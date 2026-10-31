import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RECRUITMENT_CV_MAX_BYTES } from "../shared/recruitmentCvLimits";
import { RECRUITMENT_CV_FORMAT_MESSAGE } from "./recruitmentFileValidation";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";
import { libreOfficeCvPdf, packPdfIntoObjectStream } from "./testing/pdfFixture";
import { recruitmentSubmissionErrorMessage } from "../client/src/lib/recruitmentSubmissionErrors";

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { databaseRequests: 0 };
});

// No database: an application that passes the upload and every check stops at 503.
vi.mock("./db", () => ({ getDb: async () => { state.databaseRequests += 1; return null; } }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
// The anti-robot check and the rate limits have their own tests (recruitmentApplyProtection).
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined) }));
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  enforcePersistentRateLimit: vi.fn(async () => undefined),
  logSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
// The real check, watched for the file name the route keeps.
vi.mock("./recruitmentFileValidation", async importOriginal => {
  const original = await importOriginal<typeof import("./recruitmentFileValidation")>();
  return { ...original, validateCvFile: vi.fn(original.validateCvFile) };
});

const { createApp } = await import("./_core/index");
const { validateCvFile } = await import("./recruitmentFileValidation");

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const app = await createApp();
  const listening = await listen(app as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => { state.databaseRequests = 0; });

type CvPart = { buffer: Buffer; name?: string; type?: string };

async function apply(input: { cvs: CvPart[]; fields?: Record<string, string> }) {
  const form = new FormData();
  const fields = {
    firstName: "Amina",
    lastName: "Haddad",
    email: "amina.haddad@example.test",
    specialty: "Anesthésie-réanimation",
    diplomaCountry: "Algérie",
    targetCountries: JSON.stringify(["France"]),
    gdprConsent: "1",
    turnstileToken: "turnstile-token-accepted-by-the-mock",
    ...input.fields,
  };
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  for (const cv of input.cvs) {
    form.append("cv", new Blob([new Uint8Array(cv.buffer)], { type: cv.type ?? "application/pdf" }), cv.name ?? "cv.pdf");
  }
  const response = await fetch(`${baseUrl}/api/recruitment/apply`, { method: "POST", body: form });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("POST /api/recruitment/apply — réception du CV (multer) et validation (zod)", () => {
  it("accepte un CV d'exactement 4 Mo et le conduit jusqu'à l'enregistrement", async () => {
    const result = await apply({ cvs: [{ buffer: validPdfBuffer(RECRUITMENT_CV_MAX_BYTES) }] });
    expect(result).toEqual({ status: 503, body: { error: "Le service de candidature est temporairement indisponible.", code: "recruitment_service_unavailable" } });
    expect(state.databaseRequests).toBe(1);
  });

  it("refuse un CV de plus de 4 Mo avec le message dédié, sans rien enregistrer", async () => {
    const result = await apply({ cvs: [{ buffer: validPdfBuffer(RECRUITMENT_CV_MAX_BYTES + 1) }] });
    expect(result).toEqual({ status: 400, body: { error: "Le CV ne doit pas dépasser 4 Mo. Compressez-le ou enregistrez-le en PDF, puis réessayez.", code: "recruitment_cv_too_large" } });
    expect(state.databaseRequests).toBe(0);
  });

  it("refuse un fichier qui n'est ni un PDF ni un DOCX", async () => {
    const result = await apply({ cvs: [{ buffer: Buffer.from("Curriculum vitae"), name: "cv.txt", type: "text/plain" }] });
    expect(result).toEqual({ status: 400, body: { error: RECRUITMENT_CV_FORMAT_MESSAGE, code: "recruitment_cv_format_refused" } });
    expect(state.databaseRequests).toBe(0);
  });

  it("refuse une candidature qui joint deux CV", async () => {
    const result = await apply({ cvs: [{ buffer: validPdfBuffer() }, { buffer: validPdfBuffer(), name: "cv-2.pdf" }] });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: expect.stringMatching(/\S/) });
    expect(state.databaseRequests).toBe(0);
  });

  it("conduit jusqu'à l'enregistrement un CV au nom de plus de 180 caractères, sans le refuser comme d'un autre type", async () => {
    const name = `${"Curriculum_Vitae_Amina_Haddad_anesthesie_reanimation_".repeat(4)}2026.pdf`;
    expect(name.length).toBeGreaterThan(180);
    const result = await apply({ cvs: [{ buffer: validPdfBuffer(), name }] });
    expect(result).toEqual({ status: 503, body: { error: "Le service de candidature est temporairement indisponible.", code: "recruitment_service_unavailable" } });
    expect(state.databaseRequests).toBe(1);
  });

  it("lit le nom du CV envoyé en UTF-8 par le navigateur : une lettre accentuée devient un seul « _ », pas deux", async () => {
    vi.mocked(validateCvFile).mockClear();
    const result = await apply({ cvs: [{ buffer: validPdfBuffer(), name: "Diplôme d’État.pdf" }] });
    expect(result.status).toBe(503);
    expect(vi.mocked(validateCvFile).mock.calls.map(([file]) => file.originalName)).toEqual(["Dipl_me_d__tat.pdf"]);
  });

  it("exige le CV", async () => {
    const result = await apply({ cvs: [] });
    expect(result).toEqual({ status: 400, body: { error: "Le CV est requis.", code: "recruitment_cv_required" } });
  });

  it("signale le nombre maximal de pays ciblés et refuse les autres champs invalides", async () => {
    const tooManyCountries = Array.from({ length: 19 }, (_, index) => `Pays ${index + 1}`);
    const countries = await apply({ cvs: [{ buffer: validPdfBuffer() }], fields: { targetCountries: JSON.stringify(tooManyCountries) } });
    expect(countries).toEqual({ status: 400, body: { error: "Vous pouvez sélectionner jusqu’à 18 pays ciblés.", code: "recruitment_target_countries_too_many" } });

    for (const fields of [{ email: "pas-une-adresse" }, { gdprConsent: "0" }, { targetCountries: "[]" }]) {
      const invalid = await apply({ cvs: [{ buffer: validPdfBuffer() }], fields });
      expect(invalid, JSON.stringify(fields)).toMatchObject({ status: 400, body: { error: "Les informations de candidature sont invalides." } });
    }
    expect(state.databaseRequests).toBe(0);
  });
});

describe("REC-02 — PDF réels et PDF piégés reçus par /api/recruitment/apply", () => {
  it("conduit un CV LibreOffice et un CV à flux d’objets jusqu’à l’enregistrement", async () => {
    for (const buffer of [libreOfficeCvPdf(), packPdfIntoObjectStream(libreOfficeCvPdf())]) {
      const result = await apply({ cvs: [{ buffer }] });
      expect(result.body.code).toBe("recruitment_service_unavailable");
    }
    expect(state.databaseRequests).toBe(2);
  });

  it("refuse un JavaScript caché dans un flux d’objets et dit au candidat quoi faire, en français et traduit", async () => {
    const trapped = packPdfIntoObjectStream(libreOfficeCvPdf(), {
      edit: source => source.replace("/OpenAction[1 0 R /XYZ null null 0]", "/OpenAction <</S/JavaScript/JS(app.alert\\(1\\))>>"),
    });
    const result = await apply({ cvs: [{ buffer: trapped }] });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("cv_validation_pdf_active_content");
    expect(result.body.error).toContain("Réenregistrez votre CV en DOCX ou imprimez-le en PDF depuis votre navigateur");
    const pageCopy = { genericError: "generic", fileError: "file" };
    expect(recruitmentSubmissionErrorMessage(result.body, "en", pageCopy)).toContain("print it to PDF from your browser");
    expect(state.databaseRequests).toBe(0);
  });
});
