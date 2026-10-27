import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { medicalQuestionAuditLogs, medicalQuestions } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { medicalQuestionSubmitError } from "../client/src/pages/MedicalQuestionsPage";

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
const { verifyCandidateTurnstile } = await import("./candidateTurnstile");

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

beforeEach(() => {
  state.db = createInMemoryDrizzle();
  state.sent.length = 0;
  vi.stubEnv("RESEND_API_KEY", "re_test_medical_submit");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) { return error as { code: string; message: string }; }
  throw new Error("the call was expected to fail");
}

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
    for (let index = 1; index <= 5; index += 1) {
      await expect(caller("198.51.100.47").submit(question(`cible${index}@test.local`, `Offre speciale sur https://promo-${index}.example`))).resolves.toMatchObject({ acknowledgementSent: true });
    }
    const refusal = await failure(caller("198.51.100.47").submit(question("cible6@test.local")));
    expect(refusal).toMatchObject({ code: "TOO_MANY_REQUESTS", message: "Trop d’envois depuis cette connexion. Réessayez dans une heure." });
    // The page shows its own message for this code and does not point at the anti-bot box.
    expect(medicalQuestionSubmitError(refusal.code)).toBe("tooManyRequests");
    expect(state.sent.map(email => email.to[0])).toEqual(["cible1@test.local", "cible2@test.local", "cible3@test.local", "cible4@test.local", "cible5@test.local"]);
    expect((state.db as InMemoryDrizzle).rows(medicalQuestions)).toHaveLength(5);

    await expect(caller("203.0.113.48").submit(question("cible6@test.local"))).resolves.toMatchObject({ acknowledgementSent: true });
  });

  it("ne compte ni un anti-robot à renouveler ni une question non enregistrée", async () => {
    const ip = "198.51.100.49";
    for (let index = 1; index <= 5; index += 1) {
      vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(new Error("candidate_turnstile_invalid"));
      const refusal = await failure(caller(ip).submit(question(`essai${index}@test.local`)));
      expect(refusal).toMatchObject({ code: "BAD_REQUEST", message: "La vérification de sécurité doit être renouvelée avant l’envoi." });
      expect(medicalQuestionSubmitError(refusal.code)).toBe("turnstile");
    }
    const db = state.db as InMemoryDrizzle;
    const insert = db.insert.bind(db);
    let questionInsertFails = true;
    vi.spyOn(db, "insert").mockImplementation((table => {
      if (table === medicalQuestions && questionInsertFails) {
        questionInsertFails = false;
        throw new Error("database down");
      }
      return insert(table);
    }) as typeof db.insert);
    await expect(caller(ip).submit(question("panne@test.local"))).rejects.toThrow("database down");

    for (let index = 1; index <= 5; index += 1) {
      await expect(caller(ip).submit(question(`patient${index}@test.local`))).resolves.toMatchObject({ acknowledgementSent: true });
    }
    await expect(caller(ip).submit(question("patient6@test.local"))).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(state.sent).toHaveLength(5);
  });

  it("garde comptée une question déjà enregistrée quand la suite échoue", async () => {
    const ip = "198.51.100.50";
    const db = state.db as InMemoryDrizzle;
    const insert = db.insert.bind(db);
    let auditFails = true;
    vi.spyOn(db, "insert").mockImplementation((table => {
      if (table === medicalQuestionAuditLogs && auditFails) {
        auditFails = false;
        throw new Error("database down");
      }
      return insert(table);
    }) as typeof db.insert);
    await expect(caller(ip).submit(question("enregistree@test.local"))).rejects.toThrow("database down");
    expect(db.rows(medicalQuestions)).toHaveLength(1);

    for (let index = 2; index <= 5; index += 1) {
      await expect(caller(ip).submit(question(`patient${index}@test.local`))).resolves.toMatchObject({ acknowledgementSent: true });
    }
    await expect(caller(ip).submit(question("patient6@test.local"))).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("ne regroupe pas les visiteurs sans IP identifiable dans un compteur commun", async () => {
    for (let index = 1; index <= 7; index += 1) {
      await expect(caller(null).submit(question(`patient${index}@test.local`))).resolves.toMatchObject({ acknowledgementSent: true });
    }
    expect(state.sent).toHaveLength(7);
  });
});

describe("medicalQuestions.submit — consentements obligatoires", () => {
  // Health data: without both boxes ticked nothing is checked, recorded or sent.
  it.each([
    ["privacyConsent", false],
    ["privacyConsent", undefined],
    ["urgencyAcknowledged", false],
    ["urgencyAcknowledged", undefined],
  ] as const)("refuse la question quand %s vaut %s, sans rien enregistrer ni envoyer", async (field, value) => {
    vi.mocked(verifyCandidateTurnstile).mockClear();
    const refusal = await failure(caller("198.51.100.81").submit({ ...question("sans.accord@test.local"), [field]: value } as never));

    expect(refusal.code).toBe("BAD_REQUEST");
    const db = state.db as InMemoryDrizzle;
    expect(db.rows(medicalQuestions)).toEqual([]);
    expect(db.rows(medicalQuestionAuditLogs)).toEqual([]);
    expect(verifyCandidateTurnstile).not.toHaveBeenCalled();
    expect(state.sent).toEqual([]);
  });

  it("enregistre la question quand la confidentialité et l’urgence sont acceptées, la publication restant facultative", async () => {
    const result = await caller("198.51.100.82").submit(question("accord@test.local"));

    expect(result.acknowledgementSent).toBe(true);
    expect((state.db as InMemoryDrizzle).rows(medicalQuestions)).toMatchObject([{ email: "accord@test.local", privacyConsent: 1, urgencyAcknowledged: 1, publicationConsent: 0 }]);
    expect(state.sent.map(email => email.to[0])).toEqual(["accord@test.local"]);
  });
});
