import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";

const CRON_SECRET = "cron-secret-for-orphan-cv-tests";
const HOUR = 60 * 60 * 1000;

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  // The private Blob store, with each object's upload date.
  return { db: null as unknown, blobs: new Map<string, Date>(), deleted: [] as string[] };
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
  storagePut: vi.fn(async (key: string) => {
    const stored = key.replace(/(\.[a-z]+)$/, "_a1b2c3d4$1");
    state.blobs.set(stored, new Date());
    return { key: stored, url: `https://blob.test/${stored}` };
  }),
  storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`),
  storageListObjects: vi.fn(async (prefix: string) => Array.from(state.blobs, ([key, uploadedAt]) => ({ key, uploadedAt })).filter(object => object.key.startsWith(prefix))),
  storageDelete: vi.fn(async (keys: string[]) => {
    for (const key of keys) { state.blobs.delete(key); state.deleted.push(key); }
    return keys.length;
  }),
}));
vi.mock("./recruitmentProcessingWorker", async importOriginal => ({ ...await importOriginal<typeof import("./recruitmentProcessingWorker")>(), countWaitingCvAnalyses: vi.fn(async () => 0) }));
vi.mock("./recruitmentRetention", () => ({ runRecruitmentRetentionCleanup: vi.fn(async () => ({ expiredFound: 0, erased: 0 })) }));

const { createApp } = await import("./_core/index");
const { removeOrphanApplicationCvFiles } = await import("./recruitmentOrphanCvCleanup");

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

function db() { return state.db as InMemoryDrizzle; }

async function apply(email: string) {
  const form = new FormData();
  for (const [name, value] of Object.entries({ firstName: "Camille", lastName: "Martin", email, specialty: "Anesthésie-réanimation", diplomaCountry: "France", targetCountries: JSON.stringify(["Canada"]), gdprConsent: "1", turnstileToken: "turnstile-token-accepted-by-the-mock" })) form.set(name, value);
  form.set("cv", new Blob([new Uint8Array(validPdfBuffer())], { type: "application/pdf" }), "cv.pdf");
  const response = await fetch(`${baseUrl}/api/recruitment/apply`, { method: "POST", body: form, headers: { "x-forwarded-for": "198.51.100.82" } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function seedApplication(trackingId: string) {
  db().seed(cvApplications, { trackingId, firstName: "Paul", lastName: "Nom", email: "paul@test.local", specialty: "Anesthésie", targetCountries: "[]", cvFileKey: `recruitment/quarantine/${trackingId}-cv_00000000.pdf`, cvOriginalName: "cv.pdf", cvMimeType: "application/pdf", cvSizeBytes: 1 });
}

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => {
  // The application row is written with a raw INSERT, refused here as by a trigger.
  state.db = Object.assign(createInMemoryDrizzle(), {
    execute: async () => { throw new Error("Failed query: INSERT INTO cv_applications"); },
  });
  state.blobs.clear();
  state.deleted.length = 0;
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("CV stockés sans candidature (DATA-02, parcours 5)", () => {
  it("le CV d’une candidature dont la ligne n’a pas pu être écrite est supprimé par la tâche quotidienne de rétention", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await apply("orpheline@test.local");
    expect(result).toEqual({ status: 500, body: { error: "La candidature n’a pas pu être enregistrée." } });
    expect(error).toHaveBeenCalledWith("Recruitment application error:", expect.objectContaining({ stage: "application-insert" }));
    error.mockRestore();
    // The CV was stored before the refused INSERT: no row points to it.
    const [orphan] = Array.from(state.blobs.keys());
    expect(orphan).toMatch(/^recruitment\/quarantine\/CV[A-Z2-9]{16}-cv_a1b2c3d4\.pdf$/);
    expect(db().rows(cvApplications)).toEqual([]);

    // A dossier stored normally is never touched.
    seedApplication("CVKEPTKEPTKEPTKEPT");
    state.blobs.set("recruitment/quarantine/CVKEPTKEPTKEPTKEPT-cv_00000000.pdf", new Date(Date.now() - 3 * HOUR));
    state.blobs.set(orphan!, new Date(Date.now() - 2 * HOUR));

    const response = await fetch(`${baseUrl}/api/scheduled/recruitment-retention`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, erased: 0, orphanCvFiles: { scanned: 2, deleted: 1, scanComplete: true } });
    expect(state.deleted).toEqual([orphan]);
    expect(Array.from(state.blobs.keys())).toEqual(["recruitment/quarantine/CVKEPTKEPTKEPTKEPT-cv_00000000.pdf"]);
  });

  it("laisse une heure à la candidature en cours, et les fichiers qui ne sont pas des CV de candidature", async () => {
    const now = new Date("2026-10-26T03:25:00Z");
    state.blobs.set("recruitment/quarantine/CVRECENTRECENTRECE-cv_11111111.pdf", new Date(now.getTime() - 30 * 60_000));
    state.blobs.set("recruitment/quarantine/sans-reference.pdf", new Date(now.getTime() - 48 * HOUR));
    state.blobs.set("recruitment/quarantine/CVOLDOLDOLDOLDOLDO-cv_22222222.pdf", new Date(now.getTime() - 61 * 60_000));

    await expect(removeOrphanApplicationCvFiles(now)).resolves.toEqual({ scanned: 3, deleted: 1, scanComplete: true });
    expect(state.deleted).toEqual(["recruitment/quarantine/CVOLDOLDOLDOLDOLDO-cv_22222222.pdf"]);
  });
});
