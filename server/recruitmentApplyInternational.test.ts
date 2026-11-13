import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";

// /api/recruitment/apply avec des saisies internationales : le pays du diplôme
// enregistré en code ISO, quelle que soit la langue du nom envoyé (EN-11), et le
// nom du CV gardé tel qu'envoyé, la clé de stockage restant en ASCII (INTL-07).

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { executed: [] as unknown[], stored: [] as string[] };
});
process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const fakeDb = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  execute: async (query: unknown) => { state.executed.push(query); return { rows: [{ id: 61 }] }; },
};
vi.mock("./db", () => ({ getDb: async () => fakeDb }));
// The anti-robot check and the rate limits have their own tests (recruitmentApplyProtection).
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined) }));
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  enforcePersistentRateLimit: vi.fn(async () => undefined),
  logSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock("./publicFormRateLimit", async importOriginal => ({
  ...await importOriginal<typeof import("./publicFormRateLimit")>(),
  countPublicFormDailyVolume: vi.fn(async () => true),
  enforcePublicEmailIpRateLimit: vi.fn(async () => undefined),
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
  sendTrackedCvApplicationConfirmationEmail: vi.fn(async () => undefined),
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
const { notifyOwner } = await import("./_core/notification");
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
  state.executed.length = 0;
  state.stored.length = 0;
  vi.mocked(notifyOwner).mockClear();
});

async function apply(input: { diplomaCountry?: string; cvName?: string }) {
  const body = new FormData();
  const fields: Record<string, string> = {
    firstName: "Aisha",
    lastName: "Rahman",
    email: "aisha@example.test",
    specialty: "Anesthésie-réanimation",
    diplomaCountry: input.diplomaCountry ?? "TN",
    targetCountries: JSON.stringify(["Canada"]),
    gdprConsent: "1",
    turnstileToken: "turnstile-token-accepted-by-the-mock",
  };
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  body.append("cv", new File([new Uint8Array(validPdfBuffer())], input.cvName ?? "cv.pdf", { type: "application/pdf" }));
  const response = await fetch(`${baseUrl}/api/recruitment/apply`, { method: "POST", body, headers: { "x-forwarded-for": "203.0.113.41" } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

/** Columns of the INSERT bound as parameters (all but the constants), in the order the route lists them. */
function storedApplication() {
  const insert = state.executed.map(query => dialect.sqlToQuery(query as SQL)).find(query => query.sql.includes("INSERT INTO cv_applications"))!;
  const params = insert.params;
  return { diplomaCountry: params[6], cvFileKey: params[14], cvOriginalName: params[15] };
}

describe("EN-11 — pays du diplôme enregistré en code ISO 3166-1 alpha-2", () => {
  it("enregistre le code envoyé par le formulaire et nomme le pays en français dans l’email du propriétaire", async () => {
    const result = await apply({ diplomaCountry: "TN" });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(storedApplication().diplomaCountry).toBe("TN");
    expect(String(vi.mocked(notifyOwner).mock.calls[0][0].content)).toContain("**Pays du diplôme:** Tunisie");
  });

  it("enregistre aussi en code le nom qu’envoie une page chargée avant EN-11, dans chaque langue du site", async () => {
    for (const name of ["Tunisie", "Tunisia", "Tunesien", "突尼斯"]) {
      state.executed.length = 0;
      const result = await apply({ diplomaCountry: name });
      expect(result.status, name).toBe(201);
      expect(storedApplication().diplomaCountry, name).toBe("TN");
    }
  });

  it("garde tel quel un pays qu’il ne reconnaît pas, sans refuser la candidature", async () => {
    const result = await apply({ diplomaCountry: "Atlantis" });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(storedApplication().diplomaCountry).toBe("Atlantis");
    expect(String(vi.mocked(notifyOwner).mock.calls[0][0].content)).toContain("**Pays du diplôme:** Atlantis");
  });
});

describe("INTL-07 — nom du CV gardé tel qu’envoyé, clé de stockage en ASCII", () => {
  it.each([
    ["王小明简历.pdf", "cv.pdf"],
    ["سيرة ذاتية - محمد العتيبي.pdf", "cv.pdf"],
    ["CV Zoë Ørsted-Łukasz.pdf", "CV_Zoe_rsted-_ukasz.pdf"],
    ["Céline.pdf", "Celine.pdf"],
  ])("enregistre « %s » sous son nom, rangé sous une clé ASCII", async (name, asciiName) => {
    const result = await apply({ cvName: name });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    const stored = storedApplication();
    expect(stored.cvOriginalName).toBe(name);
    expect(state.stored).toEqual([`recruitment/quarantine/${result.body.trackingId}-${asciiName}`]);
    expect(stored.cvFileKey).toBe(state.stored[0]);
  });

  it("retire d’un nom les caractères refusés par Windows et les contrôles de direction", async () => {
    // U+202E (RLO) would show the rest of the name reversed.
    const result = await apply({ cvName: `CV:${String.fromCharCode(0x202e)}Zoë?*.pdf` });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(storedApplication().cvOriginalName).toBe("CV_Zoë__.pdf");
    expect(state.stored).toEqual([`recruitment/quarantine/${result.body.trackingId}-CV_Zoe_.pdf`]);
  });
});
