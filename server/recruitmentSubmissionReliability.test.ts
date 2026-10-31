import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { candidateSecurityRateLimits, recruitmentEmailEvents, securityEvents } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER, seedApplication } from "./testSupport/candidatePortal";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";
import { buildStandardApplicationFormData, countryOptions, initialForm } from "../client/src/pages/RecruitmentPage";

// Dépôt d’une candidature par la vraie route Express : refus exploitables même
// quand le journal de sécurité tombe, limite par adresse et connexion, dossier
// gardé quand une file différée échoue, preuve de l’email de confirmation et
// journal technique sans le texte des erreurs.

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { db: null as unknown, nextApplicationId: 700 };
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
vi.mock("./recruitmentProcessingWorker", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentProcessingWorker")>(),
  countWaitingCvAnalyses: vi.fn(async () => 0),
  notifyOwnerOfAnalysisBacklog: vi.fn(async () => undefined),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(async () => ({ data: { id: "email_confirmation_1" }, error: null })) };
  },
}));

const { createApp } = await import("./_core/index");
const { verifyCandidateTurnstile } = await import("./candidateTurnstile");
const { storagePut } = await import("./storage");
const { enqueueCvAnalysis } = await import("./recruitmentProcessing");
const { enqueueCvGoogleDriveExport } = await import("./googleDriveExport");
const { countWaitingCvAnalyses, notifyOwnerOfAnalysisBacklog, RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD } = await import("./recruitmentProcessingWorker");

const HOUR_MS = 60 * 60 * 1000;
const cv = validPdfBuffer();

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

function db() { return state.db as InMemoryDrizzle; }

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // The application row is written with a raw INSERT ... RETURNING id: answer it with a fresh id.
  state.db = Object.assign(createInMemoryDrizzle(), { execute: async () => ({ rows: [{ id: (state.nextApplicationId += 1) }] }) });
  vi.stubEnv("RESEND_API_KEY", "re_test_recruitment_submission_reliability");
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(storagePut).mockReset().mockImplementation(async (key: string) => ({ key, url: `https://blob.test/${key}` }));
  vi.unstubAllEnvs();
});

function applicationForm(input: { email: string; targetCountries?: string[]; otherTargetCountry?: string }) {
  return buildStandardApplicationFormData({
    form: { ...initialForm, firstName: "Camille", lastName: "Martin", email: input.email, targetCountries: input.targetCountries ?? ["Canada"], otherTargetCountry: input.otherTargetCountry ?? "", languages: ["Français"], gdprConsent: true },
    cv: new File([new Uint8Array(cv)], "cv.pdf", { type: "application/pdf" }),
    specialty: "Anesthésie-réanimation",
    diplomaCountry: "France",
    turnstileToken: "turnstile-token-accepted-by-the-mock",
    language: "fr",
  });
}

async function post(form: FormData, ip: string) {
  const response = await fetch(`${baseUrl}/api/recruitment/apply`, { method: "POST", body: form, headers: { "x-forwarded-for": ip } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const apply = (email: string, ip: string) => post(applicationForm({ email }), ip);

describe("fiabilité du dépôt de candidature", () => {
  it("retourne une erreur de vérification exploitable même si le journal de sécurité échoue", async () => {
    const insert = db().insert.bind(db());
    vi.spyOn(db(), "insert").mockImplementation((table => {
      if (table === securityEvents) throw new Error("security log down");
      return insert(table);
    }) as InMemoryDrizzle["insert"]);
    vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(new Error("candidate_turnstile_invalid"));

    expect(await apply("camille.journal@test.local", "198.51.100.71")).toEqual({
      status: 400,
      body: { error: "La vérification de sécurité doit être renouvelée avant l’envoi.", code: "recruitment_security_check_required" },
    });
    expect(consoleError).toHaveBeenCalledWith("Recruitment protection log error:", "Error");
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("compte 10 tentatives par jour pour une même adresse depuis une même connexion, puis bloque une heure", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T08:00:00.000Z"));
    const ip = "198.51.100.72";
    const email = "camille.essais@test.local";
    // Each attempt passes the anti-bot check, then fails on our side: the per-IP cap gives its slot back,
    // the counter of this address on this connection keeps it.
    vi.mocked(storagePut).mockRejectedValue(new Error("blob store down"));
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      // The second half of the day's attempts comes 23 hours after the first one.
      if (attempt === 6) vi.setSystemTime(Date.now() + 23 * HOUR_MS);
      expect((await apply(email, ip)).status, `tentative ${attempt}`).toBe(500);
    }

    expect(await apply(email, ip)).toEqual({ status: 400, body: { error: "Trop de tentatives ont été effectuées. Patientez une heure avant de réessayer.", code: "recruitment_rate_limited" } });
    expect(storagePut).toHaveBeenCalledTimes(10);
    const counters = db().rows(candidateSecurityRateLimits).filter(row => row.action === "public_recruitment_apply");
    expect(counters).toHaveLength(1);
    expect(new Date(counters[0].blockedUntil as Date).getTime()).toBe(Date.now() + HOUR_MS);
    // Another address from the same connection is not concerned by this counter.
    vi.mocked(storagePut).mockImplementation(async (key: string) => ({ key, url: `https://blob.test/${key}` }));
    expect((await apply("collegue@test.local", ip)).status).toBe(201);

    vi.setSystemTime(Date.now() + HOUR_MS - 1000);
    expect((await apply(email, ip)).status).toBe(400);
    vi.setSystemTime(Date.now() + 1000);
    expect((await apply(email, ip)).status).toBe(201);
  });

  it("ne transforme pas une candidature déjà enregistrée en erreur si une file différée échoue", async () => {
    vi.mocked(enqueueCvAnalysis).mockRejectedValueOnce(new Error("analysis queue down"));
    vi.mocked(enqueueCvGoogleDriveExport).mockRejectedValueOnce(new Error("drive queue down"));

    const response = await apply("camille.files@test.local", "198.51.100.73");

    expect(response).toEqual({ status: 201, body: { success: true, trackingId: expect.stringMatching(/^CV[A-HJ-NP-Z2-9]{16}$/) } });
    expect(consoleError.mock.calls.filter(([message]) => message === "Recruitment follow-up queue error:")).toEqual([
      ["Recruitment follow-up queue error:", "Error"],
      ["Recruitment follow-up queue error:", "Error"],
    ]);
  });

  it("n’est jamais refusée pour une file d’analyse longue : le propriétaire est alerté à la place", async () => {
    vi.mocked(countWaitingCvAnalyses).mockResolvedValueOnce(RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD);

    expect((await apply("camille.file@test.local", "198.51.100.78")).status).toBe(201);
    expect(notifyOwnerOfAnalysisBacklog).toHaveBeenCalledWith(RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD, { atLeast: true });
    expect(enqueueCvAnalysis).toHaveBeenCalledTimes(1);
  });

  it("conserve une preuve rattachée à la candidature pour l'email de confirmation", async () => {
    const response = await apply("Camille.Preuve@Test.local", "198.51.100.74");

    expect(response.status).toBe(201);
    const events = db().rows(recruitmentEmailEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ applicationId: state.nextApplicationId, eventType: "email.sent", providerEmailId: "email_confirmation_1", recipientEmail: "camille.preuve@test.local" });
    expect(JSON.parse(String(events[0].payload))).toMatchObject({ kind: "application_confirmation", outcome: "sent", trackingId: response.body.trackingId });
  });

  it("garde une trace du dépôt d’un CV déjà reçu", async () => {
    const existing = seedApplication(db(), { email: "camille.doublon@test.local", trackingId: "CVDUPLICATE0071" });
    Object.assign(existing, { specialty: "Anesthésie-réanimation", targetCountries: JSON.stringify(["Canada"]), fileChecksum: createHash("sha256").update(cv).digest("hex") });

    expect(await apply("camille.doublon@test.local", "198.51.100.75")).toEqual({ status: 200, body: { success: true, duplicate: true, trackingId: "CVDUPLICATE0071" } });
    expect(db().rows(securityEvents).map(event => [event.category, event.outcome])).toEqual([["public_recruitment_apply_duplicate_file", "allowed"]]);
  });

  it("journalise l’étape technique sans inclure le message potentiellement sensible", async () => {
    const sensitive = "camille.journal@test.local — cv.pdf";
    vi.mocked(storagePut).mockRejectedValueOnce(new Error(`upload refused for ${sensitive}`));
    expect((await apply("camille.journal@test.local", "198.51.100.76")).status).toBe(500);
    vi.spyOn(db(), "execute").mockRejectedValueOnce(Object.assign(new Error(`invalid byte sequence near ${sensitive}`), { code: "22021" }));
    expect((await apply("camille.journal@test.local", "198.51.100.76")).status).toBe(500);

    const logged = consoleError.mock.calls.filter(([message]) => message === "Recruitment application error:");
    expect(logged).toEqual([
      ["Recruitment application error:", { stage: "storage-upload", name: "Error", code: undefined, status: undefined, constraint: undefined }],
      ["Recruitment application error:", { stage: "application-insert", name: "Error", code: "22021", status: undefined, constraint: undefined }],
    ]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("camille.journal@test.local");
  });
});

describe("validation de soumission de candidature", () => {
  it("accepte autant de pays ciblés que le formulaire public en propose, et explique la limite au-delà", async () => {
    const everyChoice = countryOptions.map(country => country.value);
    const accepted = await post(applicationForm({ email: "camille.monde@test.local", targetCountries: everyChoice, otherTargetCountry: "Japon" }), "198.51.100.77");
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);

    const tooMany = applicationForm({ email: "camille.monde@test.local", targetCountries: everyChoice, otherTargetCountry: "Japon" });
    tooMany.set("targetCountries", JSON.stringify([...JSON.parse(String(tooMany.get("targetCountries"))), "Islande"]));
    expect(await post(tooMany, "198.51.100.77")).toEqual({
      status: 400,
      body: { error: `Vous pouvez sélectionner jusqu’à ${countryOptions.length} pays ciblés.`, code: "recruitment_target_countries_too_many" },
    });
  });
});
