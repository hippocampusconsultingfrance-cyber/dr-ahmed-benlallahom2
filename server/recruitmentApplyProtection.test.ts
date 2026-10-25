import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER, seedApplication } from "./testSupport/candidatePortal";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";

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

async function apply(input: { email: string; firstName?: string; ip: string }) {
  const form = new FormData();
  form.set("firstName", input.firstName ?? "Camille");
  form.set("lastName", "Martin");
  form.set("email", input.email);
  form.set("specialty", SPECIALTY);
  form.set("diplomaCountry", "France");
  form.set("targetCountries", JSON.stringify(["Canada", "Suisse"]));
  form.set("languages", JSON.stringify(["Français"]));
  form.set("gdprConsent", "1");
  form.set("turnstileToken", "turnstile-token-accepted-by-the-mock");
  form.set("cv", new Blob([new Uint8Array(cv)], { type: "application/pdf" }), "cv.pdf");
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
    Object.assign(existing, { specialty: SPECIALTY, fileChecksum: createHash("sha256").update(cv).digest("hex") });

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

  it("limite à 5 candidatures par heure depuis une même IP, même en changeant d’adresse destinataire", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "false");
    for (let index = 1; index <= 5; index += 1) {
      expect((await apply({ email: `cible${index}@test.local`, ip: "198.51.100.64" })).status).toBe(201);
    }
    const blocked = await apply({ email: "cible6@test.local", ip: "198.51.100.64" });
    expect(blocked).toEqual({ status: 400, body: { error: "Trop de tentatives ont été effectuées. Patientez une heure avant de réessayer." } });
    expect(state.sent.map(email => email.to[0])).toEqual(["cible1@test.local", "cible2@test.local", "cible3@test.local", "cible4@test.local", "cible5@test.local"]);

    expect((await apply({ email: "cible6@test.local", ip: "203.0.113.65" })).status).toBe(201);
  });
});
