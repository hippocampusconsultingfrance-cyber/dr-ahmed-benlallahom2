import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";

// DATA-11 — the same application sent three times at once is stored once:
// the unique index of drizzle/pg/0004 refuses the copies (23505), answered
// like a repeated sending. The fake database below holds the applications
// and refuses an INSERT on the same key as that index.

type StoredApplication = Record<string, unknown> & { id: number };

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return {
    applications: [] as Array<Record<string, unknown> & { id: number }>,
    duplicateChecks: 0,
    waitingChecks: [] as Array<() => void>,
    confirmations: [] as Array<{ applicationId: number; trackingId: string; candidateEmail: string }>,
    deletedKeys: [] as string[],
    insertError: null as null | Error,
  };
});
process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const dialect = new PgDialect();

/** Column → value of the raw INSERT INTO cv_applications of /api/recruitment/apply. */
function insertedApplication(query: SQL) {
  const { sql: text, params } = dialect.sqlToQuery(query);
  const [, columns, values] = /INSERT INTO cv_applications \(([^)]*)\) VALUES \(([\s\S]*)\) RETURNING id/.exec(text)!;
  const valueList = values.split(",").map(value => value.trim());
  return Object.fromEntries(columns.split(",").map((column, index) => {
    const value = valueList[index]!;
    return [column.trim(), /^\$\d+$/.test(value) ? params[Number(value.slice(1)) - 1] : value];
  }));
}

/** Key of cv_applications_submission_unique: lower(email), lower(specialty), file_checksum, md5(target_countries). */
function submissionKey(application: Record<string, unknown>) {
  return [String(application.email).toLowerCase(), String(application.specialty).toLowerCase(), application.file_checksum, application.target_countries].join("|");
}

/** A PostgreSQL refusal as drizzle-orm throws it: the code and the constraint are in the cause. */
function uniqueViolation(constraint: string) {
  return Object.assign(new Error("Failed query: INSERT INTO cv_applications (…)\nparams: …"), {
    cause: Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), { code: "23505", constraint }),
  });
}

/** The three requests read the existing applications before any of them stores its own, as in the race. */
async function afterEveryRequestChecked() {
  if (state.duplicateChecks >= 3) return;
  state.duplicateChecks += 1;
  if (state.duplicateChecks < 3) await new Promise<void>(resolve => state.waitingChecks.push(resolve));
  else state.waitingChecks.splice(0).forEach(resolve => resolve());
}

const fakeDb = {
  select: () => ({
    from: () => ({
      where: (condition: SQL) => ({
        limit: async () => {
          await afterEveryRequestChecked();
          const [checksum] = dialect.sqlToQuery(condition).params;
          return state.applications.filter(application => application.file_checksum === checksum).map(application => ({
            id: application.id, trackingId: application.tracking_id, email: application.email, specialty: application.specialty, targetCountries: application.target_countries,
          }));
        },
      }),
    }),
  }),
  execute: async (query: SQL) => {
    if (!dialect.sqlToQuery(query).sql.includes("INSERT INTO cv_applications")) return { rows: [] };
    const application = insertedApplication(query);
    if (state.insertError) throw state.insertError;
    if (state.applications.some(existing => submissionKey(existing) === submissionKey(application))) throw uniqueViolation("cv_applications_submission_unique");
    const stored: StoredApplication = { ...application, id: state.applications.length + 1 };
    state.applications.push(stored);
    return { rows: [{ id: stored.id }] };
  },
};

vi.mock("./db", () => ({ getDb: async () => fakeDb }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined) }));
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  enforcePersistentRateLimit: vi.fn(async () => undefined),
  logSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock("./publicFormRateLimit", async importOriginal => ({ ...await importOriginal<typeof import("./publicFormRateLimit")>(), countPublicFormDailyVolume: vi.fn(async () => true) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://blob.test/${key}` })),
  storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`),
  storageDelete: vi.fn(async (keys: string[]) => { state.deletedKeys.push(...keys); return keys.length; }),
}));
vi.mock("./recruitmentEmailTrace", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentEmailTrace")>(),
  sendTrackedCvApplicationConfirmationEmail: vi.fn(async (input: { applicationId: number; trackingId: string; candidateEmail: string }) => { state.confirmations.push(input); }),
}));
vi.mock("./recruitmentProcessingWorker", async importOriginal => ({ ...await importOriginal<typeof import("./recruitmentProcessingWorker")>(), countWaitingCvAnalyses: vi.fn(async () => 0) }));
vi.mock("./recruitmentProcessing", async importOriginal => ({ ...await importOriginal<typeof import("./recruitmentProcessing")>(), enqueueCvAnalysis: vi.fn(async () => undefined) }));
vi.mock("./googleDriveExport", async importOriginal => ({ ...await importOriginal<typeof import("./googleDriveExport")>(), enqueueCvGoogleDriveExport: vi.fn(async () => undefined) }));

const { createApp } = await import("./_core/index");
const { enqueueCvAnalysis } = await import("./recruitmentProcessing");

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => {
  state.applications.length = 0;
  state.duplicateChecks = 0;
  state.confirmations.length = 0;
  state.deletedKeys.length = 0;
  state.insertError = null;
  vi.mocked(enqueueCvAnalysis).mockClear();
});

async function apply() {
  const body = new FormData();
  const fields: Record<string, string> = {
    firstName: "Amina", lastName: "Haddad", email: "Amina.Haddad@example.test", specialty: "Anesthésie-réanimation", diplomaCountry: "Algérie",
    targetCountries: JSON.stringify(["France", "Canada"]), languages: JSON.stringify(["Français"]), gdprConsent: "1", turnstileToken: "turnstile-token-accepted-by-the-mock",
  };
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  body.append("cv", new File([new Uint8Array(validPdfBuffer())], "cv-amina.pdf", { type: "application/pdf" }));
  const response = await fetch(`${baseUrl}/api/recruitment/apply`, { method: "POST", body, headers: { "x-forwarded-for": "203.0.113.41" } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("/api/recruitment/apply — envois simultanés du même dossier (DATA-11)", () => {
  it("trois envois simultanés : une seule candidature, la même réponse et la même confirmation pour les trois", async () => {
    const responses = await Promise.all([apply(), apply(), apply()]);

    expect(state.applications).toHaveLength(1);
    const [stored] = state.applications;
    const created = responses.filter(response => response.status === 201);
    const repeated = responses.filter(response => response.status === 200);
    expect(created).toEqual([{ status: 201, body: { success: true, trackingId: stored!.tracking_id } }]);
    expect(repeated).toEqual([
      { status: 200, body: { success: true, duplicate: true, trackingId: stored!.tracking_id } },
      { status: 200, body: { success: true, duplicate: true, trackingId: stored!.tracking_id } },
    ]);
    // Each sending gets the confirmation of the one application stored, analysed once.
    expect(state.confirmations).toHaveLength(3);
    for (const confirmation of state.confirmations) expect(confirmation).toMatchObject({ applicationId: stored!.id, trackingId: stored!.tracking_id, candidateEmail: "Amina.Haddad@example.test" });
    expect(vi.mocked(enqueueCvAnalysis)).toHaveBeenCalledTimes(1);
    // The two refused copies of the CV are not kept in storage; the stored one is.
    expect(state.deletedKeys).toHaveLength(2);
    expect(state.deletedKeys).not.toContain(stored!.cv_file_key);
  });

  it("garde l’erreur générique pour tout autre refus de la base, sans confirmation", async () => {
    state.duplicateChecks = 3;
    state.insertError = uniqueViolation("cv_applications_tracking_id_unique");
    const response = await apply();
    expect(response).toEqual({ status: 500, body: { error: "La candidature n’a pas pu être enregistrée." } });
    expect(state.confirmations).toEqual([]);
    expect(state.deletedKeys).toEqual([]);
  });
});
