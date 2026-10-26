import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications, securityEvents } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER, seedApplication } from "./testSupport/candidatePortal";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";
import { RECRUITMENT_CUSTOM_SPECIALTY_MAX_LENGTH, standardSubmissionErrorMessage } from "../client/src/pages/RecruitmentPage";
import { vvipSubmissionErrorMessage } from "../client/src/pages/VvipOffshorePage";

type SentEmail = { to: string[]; subject: string; html: string };
const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { db: null as unknown, sent: [] as SentEmail[], nextApplicationId: 500 };
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
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(async (payload: SentEmail) => { state.sent.push(payload); return { data: { id: `email_${state.sent.length}` }, error: null }; }) };
  },
}));

const { createApp } = await import("./_core/index");
const { verifyCandidateTurnstile } = await import("./candidateTurnstile");
const { storagePut } = await import("./storage");

const TRAP_NAME = "Votre dossier est incomplet, appelez le +33 1 23 45 67 89 ou allez sur https://recrut-phish.example";
const SPECIALTY = "Anesthésie-réanimation";
const cv = validPdfBuffer();

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

function db() { return state.db as InMemoryDrizzle; }

function inMemoryDbWithApplicationInsert() {
  // The application row is written with a raw INSERT ... RETURNING id, which the
  // in-memory stand-in does not parse: answer it with a fresh id.
  return Object.assign(createInMemoryDrizzle(), {
    execute: async () => ({ rows: [{ id: (state.nextApplicationId += 1) }] }),
  });
}

async function apply(input: { email: string; firstName?: string; specialty?: string; cv?: Buffer; ip: string }) {
  const form = new FormData();
  form.set("firstName", input.firstName ?? "Camille");
  form.set("lastName", "Martin");
  form.set("email", input.email);
  form.set("specialty", input.specialty ?? SPECIALTY);
  form.set("diplomaCountry", "France");
  form.set("targetCountries", JSON.stringify(["Canada", "Suisse"]));
  form.set("languages", JSON.stringify(["Français"]));
  form.set("gdprConsent", "1");
  form.set("turnstileToken", "turnstile-token-accepted-by-the-mock");
  form.set("cv", new Blob([new Uint8Array(input.cv ?? cv)], { type: "application/pdf" }), "cv.pdf");
  const response = await fetch(`${baseUrl}/api/recruitment/apply`, { method: "POST", body: form, headers: { "x-forwarded-for": input.ip } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function urls(content: string) {
  return content.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
}

function expectConfirmationWithoutVisitorText(email: SentEmail, trackingId: string) {
  expect(email.html).toContain("<p>Bonjour,</p>");
  expect(email.html).toContain(trackingId);
  expect(email.html).not.toMatch(/recrut-phish|\+33|dossier est incomplet|Spécialité|Pays ciblés|Anesthésie|Canada/);
  expect(urls(email.html).every(url => url.startsWith("https://drahmedbenlallahom.com/"))).toBe(true);
  expect(urls(email.html).some(url => url.startsWith("https://drahmedbenlallahom.com/candidate/access?invite="))).toBe(true);
}

beforeAll(async () => {
  const app = await createApp();
  const listening = await listen(app as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });

beforeEach(() => {
  state.db = inMemoryDbWithApplicationInsert();
  state.sent.length = 0;
  vi.stubEnv("RESEND_API_KEY", "re_test_recruitment_apply_protection");
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/recruitment/apply — confirmation vers une adresse non vérifiée (MAIL-01)", () => {
  it("candidature standard ou VVIP : accepte le dossier, salue sans recopier le texte du prénom ni la spécialité ou les pays", async () => {
    const response = await apply({ email: "phish.victim@test.local", firstName: TRAP_NAME, ip: "198.51.100.61" });

    expect(response.status).toBe(201);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].to).toEqual(["phish.victim@test.local"]);
    expectConfirmationWithoutVisitorText(state.sent[0], String(response.body.trackingId));
  });

  it("dossier en doublon : la confirmation renvoyée ne recopie pas davantage le texte saisi", async () => {
    const existing = seedApplication(db(), { email: "phish.victim@test.local", trackingId: "CVDUPLICATE0001" });
    Object.assign(existing, { specialty: SPECIALTY, targetCountries: JSON.stringify(["Canada", "Suisse"]), fileChecksum: createHash("sha256").update(cv).digest("hex") });

    const response = await apply({ email: "phish.victim@test.local", firstName: TRAP_NAME, ip: "198.51.100.62" });

    expect(response).toEqual({ status: 200, body: { success: true, duplicate: true, trackingId: "CVDUPLICATE0001" } });
    expect(state.sent).toHaveLength(1);
    expectConfirmationWithoutVisitorText(state.sent[0], "CVDUPLICATE0001");
    expect(db().rows(cvApplications)).toHaveLength(1);
  });

  it("salue encore un vrai prénom", async () => {
    await apply({ email: "camille@test.local", firstName: "Marie-Hélène", ip: "198.51.100.63" });
    expect(state.sent[0].html).toContain("<p>Bonjour Marie-Hélène,</p>");
  });

  it("limite à 10 candidatures par heure depuis une même IP (réseaux d’hôpitaux partagés), même en changeant d’adresse destinataire", async () => {
    for (let index = 1; index <= 10; index += 1) {
      expect((await apply({ email: `cible${index}@test.local`, ip: "198.51.100.64" })).status).toBe(201);
    }
    const blocked = await apply({ email: "cible11@test.local", ip: "198.51.100.64" });
    expect(blocked).toMatchObject({ status: 400, body: { error: "Trop de tentatives ont été effectuées. Patientez une heure avant de réessayer.", code: "recruitment_rate_limited" } });
    expect(state.sent.map(email => email.to[0])).toEqual(Array.from({ length: 10 }, (_, index) => `cible${index + 1}@test.local`));
    // The standard form now translates the refusal like the VVIP page.
    expect(standardSubmissionErrorMessage(blocked.body, "en", blocked.status)).toBe("Too many attempts have been made. Wait one hour before trying again.");
    expect(standardSubmissionErrorMessage(blocked.body, "fr", blocked.status)).toBe(blocked.body.error);

    expect((await apply({ email: "cible11@test.local", ip: "203.0.113.65" })).status).toBe(201);
  });

  it("ne compte ni un CV refusé, ni un anti-robot à renouveler, ni une panne de notre côté : le candidat peut réessayer", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ip = "198.51.100.66";
    const candidate = "camille.essais@test.local";
    try {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const refusedCv = await apply({ email: candidate, ip, cv: Buffer.from("not a PDF at all".padEnd(2048, " "), "latin1") });
        expect(refusedCv).toMatchObject({ status: 400, body: { code: "cv_validation_signature_invalid" } });
        vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(new Error("candidate_turnstile_invalid"));
        expect(await apply({ email: candidate, ip })).toMatchObject({ status: 400, body: { code: "recruitment_security_check_required" } });
      }
      vi.mocked(storagePut).mockRejectedValueOnce(new Error("blob store down"));
      const outage = await apply({ email: candidate, ip });
      expect(outage.status).toBe(500);
      expect(state.sent).toHaveLength(0);

      expect((await apply({ email: candidate, ip })).status).toBe(201);
      for (let index = 2; index <= 10; index += 1) {
        expect((await apply({ email: `collegue${index}@test.local`, ip })).status, `candidature ${index}`).toBe(201);
      }
      expect(await apply({ email: "collegue11@test.local", ip })).toMatchObject({ status: 400, body: { code: "recruitment_rate_limited" } });
      expect(state.sent).toHaveLength(10);

      // After a server failure, both forms ask to try again instead of checking the details.
      for (const message of [standardSubmissionErrorMessage(outage.body, "fr", outage.status), vvipSubmissionErrorMessage(outage.body, "fr", outage.status)]) {
        expect(message).toBe("Le service de candidature est momentanément indisponible. Réessayez dans quelques instants.");
      }
      expect(vvipSubmissionErrorMessage(outage.body, "en", outage.status)).toBe("The application service is momentarily unavailable. Please try again in a few moments.");
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });

  it("garde comptée une candidature dont le CV a déjà été déposé quand l’enregistrement échoue ensuite", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ip = "198.51.100.68";
    try {
      // Postgres refuses a NUL character in a text column, which the schema lets through: the INSERT fails after the upload.
      vi.spyOn(db(), "execute").mockRejectedValueOnce(new Error("invalid byte sequence for encoding \"UTF8\": 0x00"));
      const uploadsBefore = vi.mocked(storagePut).mock.calls.length;
      expect((await apply({ email: "nul@test.local", firstName: "Camille\u0000", ip })).status).toBe(500);
      expect(vi.mocked(storagePut).mock.calls.length).toBe(uploadsBefore + 1);
      expect(db().rows(cvApplications)).toHaveLength(0);

      for (let index = 2; index <= 10; index += 1) {
        expect((await apply({ email: `collegue${index}@test.local`, ip })).status, `candidature ${index}`).toBe(201);
      }
      expect(await apply({ email: "collegue11@test.local", ip })).toMatchObject({ status: 400, body: { code: "recruitment_rate_limited" } });
    } finally {
      error.mockRestore();
    }
  });

  it("garde comptée une candidature en doublon dont la confirmation est partie avant une panne", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ip = "198.51.100.69";
    const existing = seedApplication(db(), { email: "doublon@test.local", trackingId: "CVDUPLICATE0002" });
    Object.assign(existing, { specialty: SPECIALTY, targetCountries: JSON.stringify(["Canada", "Suisse"]), fileChecksum: createHash("sha256").update(cv).digest("hex") });
    const insert = db().insert.bind(db());
    let securityLogFails = true;
    vi.spyOn(db(), "insert").mockImplementation((table => {
      if (table === securityEvents && securityLogFails) {
        securityLogFails = false;
        throw new Error("database down");
      }
      return insert(table);
    }) as InMemoryDrizzle["insert"]);
    try {
      expect((await apply({ email: "doublon@test.local", ip })).status).toBe(500);
      expect(state.sent.map(email => email.to[0])).toEqual(["doublon@test.local"]);

      for (let index = 2; index <= 10; index += 1) {
        expect((await apply({ email: `collegue${index}@test.local`, ip })).status, `candidature ${index}`).toBe(201);
      }
      expect(await apply({ email: "collegue11@test.local", ip })).toMatchObject({ status: 400, body: { code: "recruitment_rate_limited" } });
    } finally {
      error.mockRestore();
    }
  });

});

describe("formulaire de candidature standard — spécialité libre (INTL-03)", () => {
  it("accepte une spécialité libre jusqu’à la longueur du champ, refuse au-delà et traduit le refus", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const longest = await apply({ email: "libre@test.local", ip: "198.51.100.67", specialty: "Perfusionniste ".repeat(20).slice(0, RECRUITMENT_CUSTOM_SPECIALTY_MAX_LENGTH) });
      expect(longest.status, JSON.stringify(longest.body)).toBe(201);

      const tooLong = await apply({ email: "libre@test.local", ip: "198.51.100.67", specialty: "S".repeat(RECRUITMENT_CUSTOM_SPECIALTY_MAX_LENGTH + 1) });
      expect(tooLong).toMatchObject({ status: 400, body: { code: "recruitment_application_invalid" } });
      expect(standardSubmissionErrorMessage(tooLong.body, "en", tooLong.status)).toBe("The application details are invalid.");
    } finally {
      warn.mockRestore();
    }
  });
});
