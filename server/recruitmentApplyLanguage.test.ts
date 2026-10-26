import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";

// EN-02 — /api/recruitment/apply enregistre la langue du formulaire (champ
// multipart facultatif « language ») et envoie la confirmation dans cette langue.

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return {
    confirmations: [] as Array<{ trackingId: string; language?: string; candidatePortalInviteUrl?: string }>,
    executed: [] as unknown[],
    sameCvApplications: [] as Array<{ id: number; trackingId: string; email: string; specialty: string; targetCountries: string }>,
  };
});
process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const fakeDb = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => state.sameCvApplications }) }) }),
  execute: async (query: unknown) => { state.executed.push(query); return { rows: [{ id: 52 }] }; },
};
vi.mock("./db", () => ({ getDb: async () => fakeDb }));
// The anti-robot check and the rate limits have their own tests (recruitmentApplyProtection).
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined) }));
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  enforcePersistentRateLimit: vi.fn(async () => undefined),
  logSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://blob.test/${key}` })),
  storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`),
}));
vi.mock("./recruitmentEmailTrace", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentEmailTrace")>(),
  sendTrackedCvApplicationConfirmationEmail: vi.fn(async (input: { trackingId: string; language?: string; candidatePortalInviteUrl?: string }) => {
    state.confirmations.push(input);
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
const dialect = new PgDialect();

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
  state.sameCvApplications = [];
});

function applicationBody(language?: string) {
  const body = new FormData();
  const fields: Record<string, string> = {
    firstName: "Aisha",
    lastName: "Rahman",
    email: "aisha@example.test",
    specialty: "Anesthesiology",
    diplomaCountry: "United Arab Emirates",
    targetCountries: JSON.stringify(["Canada"]),
    languages: JSON.stringify(["English"]),
    gdprConsent: "1",
    turnstileToken: "turnstile-token-accepted-by-the-mock",
  };
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  if (language !== undefined) body.append("language", language);
  body.append("cv", new File([new Uint8Array(validPdfBuffer())], "cv-aisha.pdf", { type: "application/pdf" }));
  return body;
}

async function apply(body: FormData) {
  const response = await fetch(`${baseUrl}/api/recruitment/apply`, { method: "POST", body, headers: { "x-forwarded-for": "203.0.113.40" } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function storedLanguage() {
  const insert = state.executed.find(query => dialect.sqlToQuery(query as SQL).sql.includes("INSERT INTO cv_applications"));
  const { sql, params } = dialect.sqlToQuery(insert as SQL);
  expect(sql).toMatch(/retention_until, language\s*\) VALUES/);
  return params.at(-1);
}

describe("langue de la candidature (EN-02)", () => {
  it("enregistre la langue envoyée par le formulaire et confirme dans cette langue", async () => {
    const result = await apply(applicationBody("en"));
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(storedLanguage()).toBe("en");
    expect(state.confirmations).toEqual([expect.objectContaining({ trackingId: result.body.trackingId, language: "en" })]);
  });

  it("prend le français quand le champ manque ou n’est pas une langue du site, sans refuser la candidature", async () => {
    for (const language of [undefined, "es"]) {
      state.executed.length = 0;
      state.confirmations.length = 0;
      const result = await apply(applicationBody(language));
      expect(result.status, JSON.stringify(result.body)).toBe(201);
      expect(storedLanguage()).toBe("fr");
      expect(state.confirmations[0]?.language).toBe("fr");
    }
  });

  it("répond à un doublon dans la langue du formulaire en cours", async () => {
    state.sameCvApplications = [{ id: 7, trackingId: "CVDUPLICATE000001", email: "aisha@example.test", specialty: "Anesthesiology", targetCountries: JSON.stringify(["Canada"]) }];
    const result = await apply(applicationBody("zh"));
    expect(result.body).toMatchObject({ duplicate: true, trackingId: "CVDUPLICATE000001" });
    expect(state.confirmations).toEqual([expect.objectContaining({ trackingId: "CVDUPLICATE000001", language: "zh" })]);
  });
});
