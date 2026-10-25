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

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { confirmations: [] as Array<{ specialty: string; targetCountries: string }>, stored: [] as string[] };
});
process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// No duplicate CV on file, and the INSERT … RETURNING id gives a new application.
const fakeDb = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  execute: async () => ({ rows: [{ id: 41 }] }),
};
vi.mock("./db", () => ({ getDb: async () => fakeDb }));
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
  sendTrackedCvApplicationConfirmationEmail: vi.fn(async (input: { specialty: string; targetCountries: string }) => {
    state.confirmations.push({ specialty: input.specialty, targetCountries: input.targetCountries });
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
  state.stored.length = 0;
});

const allEnvironments = VVIP_ENVIRONMENTS.map(environment => environment.value);

function vvipBody(specialty: string) {
  return buildVvipApplicationFormData({
    form: { ...createInitialForm("fr"), firstName: "Amira", lastName: "Haddad", email: "amira@example.test", environments: allEnvironments, yearsExperience: "12", certifications: "ATLS, ACLS, HUET, BOSIET" },
    cv: new File([new Uint8Array(validPdfBuffer())], "cv-amira.pdf", { type: "application/pdf" }),
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
    expect(state.confirmations).toEqual([{ specialty: `[VVIP / Offshore] ${longestSpecialty}`, targetCountries: allEnvironments.join(", ") }]);
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
