import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VVIP_CUSTOM_SPECIALTY_MAX_LENGTH,
  VVIP_ENVIRONMENTS,
  buildVvipApplicationFormData,
  createInitialForm,
  vvipOffshoreCopy,
  vvipSubmissionErrorMessage,
} from "../client/src/pages/VvipOffshorePage";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return {
    confirmations: [] as string[],
    executed: [] as unknown[],
    stored: [] as string[],
    dbAvailable: true,
    verifyTurnstile: vi.fn(async () => undefined),
    enforceRateLimit: vi.fn(async () => undefined),
  };
});
process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// No duplicate CV on file, and the INSERT … RETURNING id gives a new application.
const fakeDb = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  execute: async (query: unknown) => { state.executed.push(query); return { rows: [{ id: 41 }] }; },
};
vi.mock("./db", () => ({ getDb: async () => (state.dbAvailable ? fakeDb : null) }));
// Turnstile and the rate limit only run outside Vitest (see the REC-03 test, which simulates it).
vi.mock("./candidateTurnstile", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateTurnstile")>(),
  verifyCandidateTurnstile: state.verifyTurnstile,
}));
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  enforcePersistentRateLimit: state.enforceRateLimit,
  logSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => { state.stored.push(key); return { key, url: `https://blob.test/${key}` }; }),
  storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`),
}));
vi.mock("./recruitmentEmailTrace", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentEmailTrace")>(),
  sendTrackedCvApplicationConfirmationEmail: vi.fn(async (input: { trackingId: string }) => {
    state.confirmations.push(input.trackingId);
  }),
}));
vi.mock("./recruitmentProcessingWorker", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentProcessingWorker")>(),
  countWaitingCvAnalyses: vi.fn(async () => 0),
}));
vi.mock("./recruitmentProcessing", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentProcessing")>(),
  enqueueCvAnalysis: vi.fn(async () => undefined),
}));
vi.mock("./googleDriveExport", async importOriginal => ({
  ...await importOriginal<typeof import("./googleDriveExport")>(),
  enqueueCvGoogleDriveExport: vi.fn(async () => undefined),
}));

const { createApp } = await import("./_core/index");

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => {
  state.confirmations.length = 0;
  state.executed.length = 0;
  state.stored.length = 0;
  state.dbAvailable = true;
});

const allEnvironments = VVIP_ENVIRONMENTS.map(environment => environment.value);

function vvipBody(specialty: string, cv: Buffer = validPdfBuffer()) {
  return buildVvipApplicationFormData({
    form: { ...createInitialForm("fr"), firstName: "Amira", lastName: "Haddad", email: "amira@example.test", environments: allEnvironments, yearsExperience: "12", certifications: "ATLS, ACLS, HUET, BOSIET" },
    cv: new File([new Uint8Array(cv)], "cv-amira.pdf", { type: "application/pdf" }),
    specialty,
    diplomaCountry: "Maroc",
    turnstileToken: "turnstile-token-not-checked-under-vitest",
  });
}

async function apply(body: FormData) {
  const response = await fetch(`${baseUrl}/api/recruitment/apply`, { method: "POST", body, headers: { "x-forwarded-for": "203.0.113.20" } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("INTL-03 — candidature VVIP avec plusieurs environnements", () => {
  it.each(["fr", "en", "de", "zh"] as const)("accepte les 4 environnements avec la spécialité la plus longue proposée (%s)", async language => {
    const longestSpecialty = [...vvipOffshoreCopy[language].specialties].sort((a, b) => b.length - a.length)[0];
    const result = await apply(vvipBody(longestSpecialty));

    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body.trackingId).toMatch(/^CV[A-Z0-9]{16}$/);
    // The confirmation email no longer repeats the specialty (MAIL-01): check what is stored instead.
    expect(state.confirmations).toEqual([result.body.trackingId]);
    const storedValues = state.executed.flatMap(query => new PgDialect().sqlToQuery(query as SQL).params);
    expect(storedValues).toContain(`[VVIP / Offshore] ${longestSpecialty}`);
    expect(storedValues.some(value => typeof value === "string" && allEnvironments.every(environment => value.includes(environment)))).toBe(true);
  });

  it("accepte une « Autre spécialité » saisie jusqu’à la limite du champ", async () => {
    const result = await apply(vvipBody("R".repeat(VVIP_CUSTOM_SPECIALTY_MAX_LENGTH)));
    expect(result.status, JSON.stringify(result.body)).toBe(201);
  });

  it("refuse une spécialité trop longue, journalise le champ sans sa valeur et le formulaire affiche le vrai motif", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tooLong = `Spécialité confidentielle ${"X".repeat(160)}`;
    try {
      const result = await apply(vvipBody(tooLong));

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("Les informations de candidature sont invalides.");
      expect(result.body.code).toBe("recruitment_application_invalid");
      expect(state.stored).toHaveLength(0);
      const logged = warn.mock.calls.map(call => call.join(" ")).join("\n");
      expect(logged).toContain("Recruitment application rejected: specialty:too_big");
      expect(logged).not.toContain("confidentielle");

      expect(vvipSubmissionErrorMessage(result.body, "fr")).toBe("Les informations de candidature sont invalides.");
      expect(vvipSubmissionErrorMessage(result.body, "en")).not.toBe(vvipOffshoreCopy.en.required);
      expect(vvipSubmissionErrorMessage(result.body, "en")).toBe("The application details are invalid.");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("REC-03 — refus de la vraie route affichés par la page VVIP, traduits", () => {
  const specialty = "Médecin urgentiste (ATLS / ACLS)";
  const translatedLanguages = ["en", "de", "zh"] as const;

  /** Each refusal must give, in every other language, its own message: not the generic one, not the French text. */
  function expectDistinctTranslations(refusals: Array<Record<string, unknown>>) {
    for (const language of translatedLanguages) {
      const t = vvipOffshoreCopy[language];
      const shown = refusals.map(body => vvipSubmissionErrorMessage(body, language));
      expect(new Set(shown).size, language).toBe(refusals.length);
      for (const [index, message] of shown.entries()) {
        expect([t.required, t.genericError, t.fileError], `${language}: ${String(refusals[index].code)}`).not.toContain(message);
        expect(message).not.toBe(refusals[index].error);
      }
    }
  }

  it("anti-robot à renouveler, limite de tentatives, service indisponible", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Turnstile and the rate limit are skipped under Vitest: simulate a real environment.
    vi.stubEnv("VITEST", "false");
    vi.stubEnv("NODE_ENV", "production");
    try {
      state.verifyTurnstile.mockRejectedValueOnce(new Error("candidate_turnstile_invalid"));
      const securityCheck = await apply(vvipBody(specialty));
      state.enforceRateLimit.mockRejectedValueOnce(new Error("candidate_security_rate_limited"));
      const rateLimited = await apply(vvipBody(specialty));
      state.dbAvailable = false;
      const unavailable = await apply(vvipBody(specialty));

      expect([securityCheck.status, rateLimited.status, unavailable.status]).toEqual([400, 400, 503]);
      expect([securityCheck.body.code, rateLimited.body.code, unavailable.body.code]).toEqual(["recruitment_security_check_required", "recruitment_rate_limited", "recruitment_service_unavailable"]);
      expect(state.stored).toHaveLength(0);
      for (const result of [securityCheck, rateLimited, unavailable]) expect(vvipSubmissionErrorMessage(result.body, "fr")).toBe(result.body.error);
      expectDistinctTranslations([securityCheck.body, rateLimited.body, unavailable.body]);
      expect(vvipSubmissionErrorMessage(securityCheck.body, "en")).toBe("The security check must be renewed before sending.");
      expect(vvipSubmissionErrorMessage(rateLimited.body, "en")).toBe("Too many attempts have been made. Wait one hour before trying again.");
    } finally {
      vi.unstubAllEnvs();
      warn.mockRestore();
    }
  });

  it("donne le motif précis d’un CV refusé : plus de 25 pages, mot de passe, contenu actif, contenu invalide", async () => {
    // Padded like validPdfBuffer: the API refuses a file under 256 bytes before reading it.
    const padded = (content: string) => Buffer.from(content.padEnd(2048, " "), "latin1");
    const pdf = (body: string) => padded(`%PDF-1.7\n${body}\n%%EOF\n`);
    const page = "<< /Type /Page >>\n";
    const refusals = [];
    for (const cv of [pdf(page.repeat(30)), pdf(`${page}/Encrypt 5 0 R`), pdf(`${page}/OpenAction << /JS (app.alert(1)) >>`), padded("not a PDF at all")]) {
      const result = await apply(vvipBody(specialty, cv));
      expect(result.status, JSON.stringify(result.body)).toBe(400);
      expect(vvipSubmissionErrorMessage(result.body, "fr")).toBe(result.body.error);
      refusals.push(result.body);
    }

    expect(refusals.map(body => body.code)).toEqual(["cv_validation_pdf_page_limit_exceeded", "cv_validation_pdf_encrypted", "cv_validation_pdf_active_content", "cv_validation_signature_invalid"]);
    expect(state.stored).toHaveLength(0);
    expectDistinctTranslations(refusals);
    expect(vvipSubmissionErrorMessage(refusals[0], "en")).toBe("The CV must not exceed 25 pages.");
  });
});
