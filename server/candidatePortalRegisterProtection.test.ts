import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { CandidateClient, TEST_PEPPER, accountByEmail, freshCandidateDb } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

type SentEmail = { to: string[]; subject: string; html: string; text: string };
const state = vi.hoisted(() => ({ db: null as unknown, sent: [] as SentEmail[] }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined), candidateRequestIp: () => "203.0.113.1" }));
// The real activation email is built and handed to a fake Resend client.
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(async (payload: SentEmail) => { state.sent.push(payload); return { data: { id: `email_${state.sent.length}` }, error: null }; }) };
  },
}));

const { candidatePortalRouter } = await import("./candidatePortalRouter");
type Api = ReturnType<typeof candidatePortalRouter.createCaller>;
const client = (ip: string) => new CandidateClient<Api>(ctx => candidatePortalRouter.createCaller(ctx as Parameters<typeof candidatePortalRouter.createCaller>[0]), ip);
const clientWithoutIp = () => candidatePortalRouter.createCaller({
  user: null,
  req: { protocol: "https", headers: { "user-agent": "vitest" } },
  res: { cookie: () => undefined, clearCookie: () => undefined },
} as never);

const TURNSTILE = "turnstile-token-accepted-by-the-mock";
const registration = (email: string, firstName = "Camille") => ({ email, firstName, lastName: "Martin", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE });

function urls(content: string) {
  return content.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
}

beforeEach(() => {
  state.db = freshCandidateDb();
  state.sent.length = 0;
  vi.stubEnv("RESEND_API_KEY", "re_test_candidate_register_protection");
});

describe("candidatePortal.register — email d’activation vers une adresse non vérifiée (MAIL-01)", () => {
  it("crée l’espace avec le prénom saisi mais n’en recopie pas le texte dans l’email d’activation", async () => {
    const trapName = "Offre speciale sur https://promo-1.example";
    await client("198.51.100.31").api.register(registration("cible@test.local", trapName));

    expect(accountByEmail(state.db as InMemoryDrizzle, "cible@test.local")?.firstName).toBe(trapName);
    expect(state.sent).toHaveLength(1);
    const [activation] = state.sent;
    expect(activation.to).toEqual(["cible@test.local"]);
    expect(activation.html).toContain("<p>Bonjour,</p>");
    expect(activation.text).toContain("\n\nBonjour,\n\n");
    expect(`${activation.html}${activation.text}`).not.toMatch(/promo-1|Offre speciale/);
    const [verifyUrl, ...otherUrls] = urls(activation.text);
    expect(verifyUrl).toMatch(/^https:\/\/drahmedbenlallahom\.com\/candidate\/verify\?/);
    expect(otherUrls).toEqual([]);
  });

  it("limite à 5 inscriptions par heure depuis une même IP, même avec des adresses différentes", async () => {
    for (let index = 1; index <= 5; index += 1) {
      await client("198.51.100.32").api.register(registration(`cible${index}@test.local`));
    }
    await expect(client("198.51.100.32").api.register(registration("cible6@test.local"))).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(state.sent.map(email => email.to[0])).toEqual(["cible1@test.local", "cible2@test.local", "cible3@test.local", "cible4@test.local", "cible5@test.local"]);
    expect(accountByEmail(state.db as InMemoryDrizzle, "cible6@test.local")).toBeUndefined();

    await client("203.0.113.33").api.register(registration("cible6@test.local"));
    expect(accountByEmail(state.db as InMemoryDrizzle, "cible6@test.local")).toBeDefined();
  });

  it("ne regroupe pas les visiteurs sans IP identifiable dans un compteur commun", async () => {
    for (let index = 1; index <= 7; index += 1) {
      await clientWithoutIp().register(registration(`candidat${index}@test.local`));
    }
    expect(state.sent).toHaveLength(7);
  });
});
