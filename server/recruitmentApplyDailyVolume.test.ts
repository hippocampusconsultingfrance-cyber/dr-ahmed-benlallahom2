import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";

type SentEmail = { to: string[]; subject: string };
const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { db: null as unknown, sent: [] as SentEmail[], nextApplicationId: 700 };
});
process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined), candidateRequestIp: () => "203.0.113.9" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://blob.test/${key}` })),
  storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`),
}));
vi.mock("./recruitmentProcessing", async importOriginal => ({ ...await importOriginal<typeof import("./recruitmentProcessing")>(), enqueueCvAnalysis: vi.fn(async () => undefined) }));
vi.mock("./googleDriveExport", async importOriginal => ({ ...await importOriginal<typeof import("./googleDriveExport")>(), enqueueCvGoogleDriveExport: vi.fn(async () => undefined) }));
vi.mock("./recruitmentProcessingWorker", async importOriginal => ({ ...await importOriginal<typeof import("./recruitmentProcessingWorker")>(), countWaitingCvAnalyses: vi.fn(async () => 0) }));
// The counter itself is covered in publicFormDailyVolume.test.ts: here, only what the form does beyond it.
vi.mock("./publicFormRateLimit", async importOriginal => ({ ...await importOriginal<typeof import("./publicFormRateLimit")>(), countPublicFormDailyVolume: vi.fn(async () => true) }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(async (payload: SentEmail) => { state.sent.push(payload); return { data: { id: `email_${state.sent.length}` }, error: null }; }) };
  },
}));

const { createApp } = await import("./_core/index");
const { notifyOwner } = await import("./_core/notification");
const { enqueueCvAnalysis } = await import("./recruitmentProcessing");
const { enqueueCvGoogleDriveExport } = await import("./googleDriveExport");
const { countPublicFormDailyVolume } = await import("./publicFormRateLimit");

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

function db() { return state.db as InMemoryDrizzle; }

async function apply(email: string) {
  const form = new FormData();
  form.set("firstName", "Camille");
  form.set("lastName", "Martin");
  form.set("email", email);
  form.set("specialty", "Anesthésie-réanimation");
  form.set("diplomaCountry", "France");
  form.set("targetCountries", JSON.stringify(["Canada"]));
  form.set("languages", JSON.stringify(["Français"]));
  form.set("gdprConsent", "1");
  form.set("turnstileToken", "turnstile-token-accepted-by-the-mock");
  form.set("cv", new Blob([new Uint8Array(validPdfBuffer())], { type: "application/pdf" }), "cv.pdf");
  const response = await fetch(`${baseUrl}/api/recruitment/apply`, { method: "POST", body: form, headers: { "x-forwarded-for": "198.51.100.81" } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

beforeAll(async () => {
  const app = await createApp();
  const listening = await listen(app as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });

beforeEach(() => {
  // The application row is written with a raw INSERT ... RETURNING id: seed it
  // so that the follow-up UPDATE finds it.
  const memory = createInMemoryDrizzle();
  state.db = Object.assign(memory, {
    execute: async () => {
      const id = (state.nextApplicationId += 1);
      memory.seed(cvApplications, { id, trackingId: `CV${id}`, firstName: "Camille", lastName: "Martin", email: "x@test.local", specialty: "Anesthésie-réanimation", targetCountries: "[]", cvFileKey: "k", cvOriginalName: "cv.pdf", cvMimeType: "application/pdf", cvSizeBytes: 1 });
      return { rows: [{ id }] };
    },
  });
  state.sent.length = 0;
  vi.mocked(notifyOwner).mockClear();
  vi.mocked(enqueueCvAnalysis).mockClear();
  vi.mocked(enqueueCvGoogleDriveExport).mockClear();
  vi.stubEnv("RESEND_API_KEY", "re_test_recruitment_daily_volume");
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/recruitment/apply au-delà du volume quotidien (ABUS-01)", () => {
  it("sous le seuil : confirmation au candidat, email au propriétaire et analyse IA en file", async () => {
    const response = await apply("sous-le-seuil@test.local");

    expect(response.status).toBe(201);
    expect(state.sent.map(email => email.to[0])).toEqual(["sous-le-seuil@test.local"]);
    expect(vi.mocked(notifyOwner)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enqueueCvAnalysis)).toHaveBeenCalledTimes(1);
  });

  it("au-delà : garde le dossier sans confirmation, sans email au propriétaire ni analyse IA, mais avec sa copie Drive", async () => {
    vi.mocked(countPublicFormDailyVolume).mockResolvedValueOnce(false);

    const response = await apply("au-dela@test.local");

    expect(response.status).toBe(201);
    expect(state.sent).toEqual([]);
    expect(vi.mocked(notifyOwner)).not.toHaveBeenCalled();
    expect(vi.mocked(enqueueCvAnalysis)).not.toHaveBeenCalled();
    expect(vi.mocked(enqueueCvGoogleDriveExport)).toHaveBeenCalledTimes(1);
    expect(db().rows(cvApplications)).toHaveLength(1);
    expect(db().rows(cvApplications)[0]).toMatchObject({ analysisStatus: "needs_review", analysisLastError: "analysis_deferred_daily_volume" });
  });
});
