import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { medicalQuestions } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

type SentEmail = { to: string[]; subject: string; html: string; text: string };
const state = vi.hoisted(() => ({ db: null as unknown, sent: [] as SentEmail[] }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined) }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(async (payload: SentEmail) => { state.sent.push(payload); return { data: { id: `email_${state.sent.length}` }, error: null }; }) };
  },
}));

const { medicalQuestionsRouter } = await import("./medicalQuestionsRouter");

function caller(ip: string | null) {
  const headers: Record<string, string> = ip ? { "x-forwarded-for": ip } : {};
  return medicalQuestionsRouter.createCaller({ user: null, mfaVerified: false, req: { headers }, res: {} } as never);
}

function question(email: string, firstName = "Jeanne") {
  return {
    firstName,
    lastName: "Martin",
    email,
    phone: "+33 6 12 34 56 78",
    question: "Puis-je garder mes lunettes jusqu’au bloc opératoire avant une anesthésie générale ?",
    language: "fr" as const,
    privacyConsent: true as const,
    urgencyAcknowledged: true as const,
    turnstileToken: "turnstile-token-accepted-by-the-mock",
  };
}

/** Runs the real protections, which test and Vitest environments skip. */
function enableProductionProtections() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VITEST", "false");
}

beforeEach(() => {
  state.db = createInMemoryDrizzle();
  state.sent.length = 0;
  vi.stubEnv("RESEND_API_KEY", "re_test_medical_submit");
});
afterEach(() => vi.unstubAllEnvs());

describe("medicalQuestions.submit — emails vers une adresse non vérifiée (MAIL-01)", () => {
  it("enregistre la question avec le prénom saisi mais n’en recopie pas le texte dans l’accusé", async () => {
    const trapName = "Votre colis est bloqué, payez sur https://colis-phish.example/fr";
    const result = await caller("198.51.100.23").submit(question("victime@test.local", trapName));

    expect(result.acknowledgementSent).toBe(true);
    expect((state.db as InMemoryDrizzle).rows(medicalQuestions)[0]?.firstName).toBe(trapName);
    expect(state.sent).toHaveLength(1);
    const [acknowledgement] = state.sent;
    expect(acknowledgement.to).toEqual(["victime@test.local"]);
    expect(acknowledgement.text.startsWith("Bonjour,\n\n")).toBe(true);
    expect(acknowledgement.text).toContain(`Référence : ${result.trackingId}`);
    expect(`${acknowledgement.html}${acknowledgement.text}`).not.toMatch(/phish|colis|payez/);
  });

  it("limite à 5 envois par heure depuis une même IP, même en changeant d’adresse destinataire", async () => {
    enableProductionProtections();
    for (let index = 1; index <= 5; index += 1) {
      await expect(caller("198.51.100.47").submit(question(`cible${index}@test.local`, `Offre speciale sur https://promo-${index}.example`))).resolves.toMatchObject({ acknowledgementSent: true });
    }
    await expect(caller("198.51.100.47").submit(question("cible6@test.local"))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.sent.map(email => email.to[0])).toEqual(["cible1@test.local", "cible2@test.local", "cible3@test.local", "cible4@test.local", "cible5@test.local"]);
    expect((state.db as InMemoryDrizzle).rows(medicalQuestions)).toHaveLength(5);

    await expect(caller("203.0.113.48").submit(question("cible6@test.local"))).resolves.toMatchObject({ acknowledgementSent: true });
  });

  it("ne regroupe pas les visiteurs sans IP identifiable dans un compteur commun", async () => {
    enableProductionProtections();
    for (let index = 1; index <= 7; index += 1) {
      await expect(caller(null).submit(question(`patient${index}@test.local`))).resolves.toMatchObject({ acknowledgementSent: true });
    }
    expect(state.sent).toHaveLength(7);
  });
});
