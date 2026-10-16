import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANDIDATE_INVITATION_MAX_AGE_MS,
  CANDIDATE_INVITATION_PREFILL_GRACE_MS,
  createCandidateInvitationToken,
  formatCandidateLinkValidity,
  inspectCandidateInvitationToken,
  verifyCandidateInvitationToken,
} from "./candidateAuth";
import { buildCandidatePortalAccessEmail } from "./_core/notifications";
import type { InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { CandidateClient, TEST_PEPPER, accountByEmail, freshCandidateDb, seedApplication } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const state = vi.hoisted(() => ({ db: null as unknown, emails: [] as Array<{ to: string; actionUrl: string }>, resendPayloads: [] as Array<{ html: string }> }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined), candidateRequestIp: () => "203.0.113.1" }));
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: vi.fn(async (payload: { html: string }) => { state.resendPayloads.push(payload); return { data: { id: "email-test" }, error: null }; }) } })) }));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendCandidatePortalAccessEmail: vi.fn(async (input: { to: string; actionUrl: string }) => {
    state.emails.push({ to: input.to, actionUrl: input.actionUrl });
    return { id: `email_${state.emails.length}` };
  }),
}));

const { candidatePortalRouter } = await import("./candidatePortalRouter");
const { sendCvApplicationConfirmationEmail } = await import("./_core/notifications");
type Api = ReturnType<typeof candidatePortalRouter.createCaller>;
const client = () => new CandidateClient<Api>(ctx => candidatePortalRouter.createCaller(ctx as Parameters<typeof candidatePortalRouter.createCaller>[0]), "203.0.113.20");
const TURNSTILE = "turnstile-token-accepted-by-the-mock";
const DAY = 24 * 60 * 60 * 1000;

function db() { return state.db as InMemoryDrizzle; }

beforeEach(() => {
  state.db = freshCandidateDb();
  state.emails.length = 0;
  state.resendPayloads.length = 0;
});

describe("CAND-11 — validité des invitations à l’espace candidat", () => {
  it("émet des invitations valables 7 jours par défaut", () => {
    expect(CANDIDATE_INVITATION_MAX_AGE_MS).toBe(7 * DAY);
    const before = Date.now();
    const payload = verifyCandidateInvitationToken(createCandidateInvitationToken(12));
    expect(payload?.expiresAt).toBeGreaterThanOrEqual(before + 7 * DAY - 1000);
    expect(payload?.expiresAt).toBeLessThanOrEqual(Date.now() + 7 * DAY);
    expect(formatCandidateLinkValidity(CANDIDATE_INVITATION_MAX_AGE_MS)).toBe("7 jours");
    expect(formatCandidateLinkValidity(30 * 60 * 1000)).toBe("30 minutes");
  });

  it("reconnaît une invitation authentique expirée pour le préremplissage, jamais une invitation falsifiée ou trop ancienne", () => {
    const expired = createCandidateInvitationToken(12, Date.now() - 31 * 60 * 1000);
    expect(verifyCandidateInvitationToken(expired)).toBeNull();
    expect(inspectCandidateInvitationToken(expired)).toMatchObject({ applicationId: 12, expired: true });
    expect(inspectCandidateInvitationToken(`${expired}x`)).toBeNull();
    expect(inspectCandidateInvitationToken(createCandidateInvitationToken(12, Date.now() - CANDIDATE_INVITATION_PREFILL_GRACE_MS - 1000))).toBeNull();
  });

  it("bascule vers l’inscription normale avec l’email prérempli quand l’invitation a expiré", async () => {
    const application = seedApplication(db(), { email: "amina@example.test", firstName: "Amina", lastName: "Haddad" });
    const expired = createCandidateInvitationToken(Number(application.id), Date.now() - 2 * DAY);

    await expect(client().api.resolveInvitation({ token: expired })).resolves.toEqual({ email: "amina@example.test", firstName: "Amina", lastName: "Haddad", expired: true });
    // Even if an outdated page still sends the expired token, registration proceeds and links the application by email.
    await expect(client().api.register({ email: "amina@example.test", firstName: "Amina", lastName: "Haddad", termsAccepted: true, documentConsent: true, invitationToken: expired, turnstileToken: TURNSTILE })).resolves.toMatchObject({ message: expect.any(String) });
    expect(accountByEmail(db(), "amina@example.test")?.linkedApplicationId).toBe(application.id);
    expect(state.emails).toHaveLength(1);
  });

  it("répond expired: false pour une invitation valide et refuse toujours une invitation falsifiée", async () => {
    const application = seedApplication(db(), { email: "amina@example.test", firstName: "Amina", lastName: "Haddad" });
    const valid = createCandidateInvitationToken(Number(application.id));
    await expect(client().api.resolveInvitation({ token: valid })).resolves.toMatchObject({ expired: false });
    await expect(client().api.resolveInvitation({ token: `${valid}x` })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(client().api.register({ email: "amina@example.test", firstName: "Amina", lastName: "Haddad", termsAccepted: true, documentConsent: true, invitationToken: `${valid}x`, turnstileToken: TURNSTILE })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("indique la durée de validité dans les emails d’invitation, de confirmation de candidature et d’activation", async () => {
    const invite = buildCandidatePortalAccessEmail({ to: "a@example.test", firstName: "Amina", kind: "invite", actionUrl: "https://example.test/candidate/access?invite=x" });
    expect(invite.html).toContain("valable 7 jours");
    expect(invite.text).toContain("valable 7 jours");
    const verify = buildCandidatePortalAccessEmail({ to: "a@example.test", firstName: "Amina", kind: "verify", actionUrl: "https://example.test/candidate/verify?token=x" });
    expect(verify.text).toContain("valable 30 minutes");

    vi.stubEnv("RESEND_API_KEY", "re_test_candidate_invitation_expiry");
    await sendCvApplicationConfirmationEmail("a@example.test", "Amina Haddad", "CV-TEST-1", "Anesthésie", "Canada", "https://example.test/candidate/access?invite=x");
    expect(state.resendPayloads.at(-1)?.html).toContain("valable 7 jours");
    vi.unstubAllEnvs();
  });
});
