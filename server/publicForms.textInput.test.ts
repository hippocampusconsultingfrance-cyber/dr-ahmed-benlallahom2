import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import superjson from "superjson";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { medicalQuestions } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";
import { TEXT_INPUT_INVALID_CHARACTERS, TEXT_INPUT_INVALID_CHARACTERS_MESSAGE } from "../shared/textInput";
import type { NotificationPayload } from "./_core/notification";

// INTL-05 — the public forms, called as the browser does (tRPC over HTTP with
// its errorFormatter, Express routes): a NUL byte, a line break or a reversal
// of the text's direction in a name is refused with 400 and the stable reason
// invalid_characters, never with an internal error 500, before anything is
// stored, uploaded or emailed; a legitimate name in any script is kept, with
// what a paste leaves at either end removed.

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return {
    db: null as unknown,
    rawInserts: [] as Array<{ table: string; params: unknown[] }>,
    notifications: [] as NotificationPayload[],
    uploads: 0,
  };
});
process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async (payload: NotificationPayload) => { state.notifications.push(payload); return true; }),
  getResendClient: () => undefined,
}));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined) }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => { state.uploads += 1; return { key, url: `https://blob.test/${key}` }; }),
  storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`),
}));

const { createApp } = await import("./_core/index");

const dialect = new PgDialect();
const TURNSTILE_TOKEN = "turnstile-token-accepted-by-the-mock";
/** The characters are built from their code points: none of them appears as such in this file. */
const character = (codePoint: number) => String.fromCodePoint(codePoint);
const NUL = character(0x0);
const NBSP = character(0xa0);
const ZWSP = character(0x200b);
const ZWNJ = character(0x200c);
const ZWJ = character(0x200d);
const LRM = character(0x200e);
const RLM = character(0x200f);
const PDF = character(0x202c);
const RLO = character(0x202e);
const BOM = character(0xfeff);

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => {
  // Contact and GDPR rows are written with a raw INSERT, which the in-memory stand-in does not parse: record its values.
  state.db = Object.assign(createInMemoryDrizzle(), {
    execute: vi.fn(async (query: SQL) => {
      const { sql, params } = dialect.sqlToQuery(query);
      const table = /INSERT INTO (\w+)/.exec(sql)?.[1];
      if (table) state.rawInserts.push({ table, params });
      return { rows: [{ id: 1 }], rowCount: 1 };
    }),
  });
  state.rawInserts.length = 0;
  state.notifications.length = 0;
  state.uploads = 0;
});

const db = () => state.db as InMemoryDrizzle;

/** One tRPC mutation as the form sends it (batch, superjson), from its own connection. */
async function trpc(path: string, input: Record<string, unknown>, ip: string) {
  const response = await fetch(`${baseUrl}/api/trpc/${path}?batch=1`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ 0: superjson.serialize(input) }),
  });
  const [body] = await response.json() as Array<{ error?: { json: { message: string; data: { code: string; httpStatus: number; reason?: string } } }; result?: { data: { json: Record<string, unknown> } } }>;
  return { status: response.status, error: body.error?.json ?? null, result: body.result?.data.json ?? null };
}

const forms = {
  contact: (name: string) => ({ name, email: "jeanne@example.test", message: "Bonjour, je souhaite une information.", gdprConsent: 1, turnstileToken: TURNSTILE_TOKEN }),
  gdpr: (name: string) => ({ name, email: "jeanne@example.test", requestType: "access", description: "Je souhaite accéder à mes données.", turnstileToken: TURNSTILE_TOKEN }),
  medicalQuestions: (firstName: string) => ({
    firstName, lastName: "Martin", email: "jeanne@example.test", phone: "+33 6 12 34 56 78", language: "fr",
    question: "Puis-je prendre mon traitement habituel la veille de mon anesthésie ?", privacyConsent: true, urgencyAcknowledged: true, turnstileToken: TURNSTILE_TOKEN,
  }),
  appointments: (customerName: string) => ({ customerName, customerEmail: "jeanne@example.test", customerPhone: "+33612345678", appointmentDate: "2027-01-10T10:00", requestDetails: "Demande de conseil" }),
};

async function postBrief(contactName: string, email = "rh@clinique.test") {
  const response = await fetch(`${baseUrl}/api/client-briefs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.90" },
    body: JSON.stringify({ organizationName: "Clinique du Lac", contactName, email, targetEnvironment: "Bloc", specialtyNeeded: "Anesthésie", country: "Suisse" }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function apply(firstName: string, email = "camille@test.local") {
  const form = new FormData();
  for (const [field, value] of Object.entries({ firstName, lastName: "Martin", email, specialty: "Anesthésie-réanimation", diplomaCountry: "France", gdprConsent: "1", turnstileToken: TURNSTILE_TOKEN })) form.set(field, value);
  form.set("targetCountries", JSON.stringify(["Canada"]));
  form.set("cv", new Blob([new Uint8Array(validPdfBuffer())], { type: "application/pdf" }), "cv.pdf");
  const response = await fetch(`${baseUrl}/api/recruitment/apply`, { method: "POST", body: form, headers: { "x-forwarded-for": "198.51.100.91" } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function expectNothingKept() {
  expect(state.rawInserts).toEqual([]);
  expect(state.uploads).toBe(0);
  expect(state.notifications).toEqual([]);
}

describe("formulaires publics — caractères refusés (INTL-05)", () => {
  it("refuse en 400 et non en 500 un octet NUL dans le nom des cinq formulaires et de la réservation, sans rien enregistrer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      for (const [path, form] of Object.entries(forms)) {
        const refused = await trpc(`${path === "appointments" ? "appointments.create" : `${path}.submit`}`, form(`Leak${NUL}Test`), "198.51.100.80");
        expect(refused.status, path).toBe(400);
        expect(refused.error, path).toMatchObject({ message: TEXT_INPUT_INVALID_CHARACTERS_MESSAGE, data: { code: "BAD_REQUEST", httpStatus: 400, reason: TEXT_INPUT_INVALID_CHARACTERS } });
      }
      expect(await postBrief(`Leak${NUL}Test`)).toEqual({ status: 400, body: { error: TEXT_INPUT_INVALID_CHARACTERS_MESSAGE, code: TEXT_INPUT_INVALID_CHARACTERS } });
      expect(await apply(`Leak${NUL}Test`)).toEqual({ status: 400, body: { error: TEXT_INPUT_INVALID_CHARACTERS_MESSAGE, code: TEXT_INPUT_INVALID_CHARACTERS } });
      expectNothingKept();
      expect(db().rows(medicalQuestions)).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it("refuse un nom qui inverse le sens du texte ou glisse un saut de ligne vers l’objet des emails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      for (const forged of [`Ali ${RLO}gnp.exe${PDF} Hassan`, "Ali\r\nBcc: x@evil.test"]) {
        expect((await trpc("contact.submit", forms.contact(forged), "198.51.100.81")).error?.data.reason, JSON.stringify(forged)).toBe(TEXT_INPUT_INVALID_CHARACTERS);
        expect((await trpc("gdpr.submit", forms.gdpr(forged), "198.51.100.81")).error?.data.reason, JSON.stringify(forged)).toBe(TEXT_INPUT_INVALID_CHARACTERS);
        expect((await postBrief(forged)).body.code, JSON.stringify(forged)).toBe(TEXT_INPUT_INVALID_CHARACTERS);
      }
      expectNothingKept();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("formulaires publics — noms légitimes (INTL-05)", () => {
  it("enregistre tel quel un nom arabe, hébreu, chinois, persan avec ZWNJ ou suivi d’un emoji composé, sans ce qu’un copier-coller laisse aux extrémités", async () => {
    const family = ["👩", "👩", "👧"].join(ZWJ);
    const names = ["محمد بن عبد الله", "אברהם כהן", "王小明", `می${ZWNJ}خواهم`, `Lina ${family}`];
    // Resend is not configured here: the acknowledgement is skipped with a warning.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const [index, name] of names.entries()) {
      const sent = await trpc("contact.submit", forms.contact(`${RLM}${BOM} ${name} ${RLM}`), `198.51.100.${100 + index}`);
      expect(sent.status, name).toBe(200);
      expect(state.rawInserts.at(-1)).toMatchObject({ table: "contact_messages" });
      expect(state.rawInserts.at(-1)!.params[1], name).toBe(name);
      // INTL-11 / ADM-09: the reference first in the subject, then the name; a direct link to the message.
      expect(state.notifications.at(-1), name).toMatchObject({ reference: sent.result!.trackingId, title: "Contact", name });
      expect(state.notifications.at(-1)!.content).toContain(`https://drahmedbenlallahom.com/admin?tab=contacts&ref=${sent.result!.trackingId}`);
    }
    vi.mocked(console.warn).mockRestore();
  });
});

describe("formulaires publics — adresses email collées (INTL-05)", () => {
  /** The forms with the given address, their name kept valid. */
  const withEmail = (email: string) => ({
    contact: { ...forms.contact("Jeanne Martin"), email },
    gdpr: { ...forms.gdpr("Jeanne Martin"), email },
    medicalQuestions: { ...forms.medicalQuestions("Jeanne"), email },
    appointments: { ...forms.appointments("Jeanne Martin"), customerEmail: email },
  });

  it("enregistre l'adresse sans les marques de direction ni les espaces qu'un copier-coller laisse aux extrémités", async () => {
    // Resend is not configured here, even with the CI's dummy key: the acknowledgements are skipped, never sent.
    vi.stubEnv("RESEND_API_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const [index, pasted] of [`${LRM}jeanne@example.test`, `jeanne@example.test${RLM}`, `jeanne@example.test `, `${NBSP}jeanne@example.test${BOM}`].entries()) {
        const sent = withEmail(pasted);
        for (const path of ["contact", "gdpr"] as const) {
          const answer = await trpc(`${path}.submit`, sent[path], `198.51.100.${120 + index}`);
          expect(answer.status, `${path} ${JSON.stringify(pasted)}`).toBe(200);
          expect(state.rawInserts.at(-1)).toMatchObject({ table: path === "contact" ? "contact_messages" : "gdpr_requests" });
          expect(state.rawInserts.at(-1)!.params[2], `${path} ${JSON.stringify(pasted)}`).toBe("jeanne@example.test");
        }
        expect((await trpc("medicalQuestions.submit", sent.medicalQuestions, `198.51.100.${130 + index}`)).status, JSON.stringify(pasted)).toBe(200);
        expect(db().rows(medicalQuestions).at(-1)).toMatchObject({ email: "jeanne@example.test" });
      }
      const brief = await postBrief("Jeanne Martin", `${RLM}rh@clinique.test `);
      expect(brief.status).toBe(200);
      expect(state.rawInserts.find(insert => insert.table === "client_briefs")!.params[3]).toBe("rh@clinique.test");
      expect((await apply("Camille", `${LRM}camille@test.local${RLM}`)).status).toBe(201);
      expect(state.rawInserts.find(insert => insert.table === "cv_applications")!.params[3]).toBe("camille@test.local");
    } finally {
      warn.mockRestore();
      error.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("refuse avec le motif invalid_characters, et non comme une adresse invalide, un caractère invisible resté à l'intérieur", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const sent = withEmail(`jeanne${ZWSP}@example.test`);
      for (const path of ["contact", "gdpr", "medicalQuestions", "appointments"] as const) {
        const refused = await trpc(path === "appointments" ? "appointments.create" : `${path}.submit`, sent[path], "198.51.100.140");
        expect(refused.status, path).toBe(400);
        expect(refused.error, path).toMatchObject({ message: TEXT_INPUT_INVALID_CHARACTERS_MESSAGE, data: { reason: TEXT_INPUT_INVALID_CHARACTERS } });
      }
      expect(await postBrief("Jeanne Martin", `rh${LRM}@clinique.test`)).toEqual({ status: 400, body: { error: TEXT_INPUT_INVALID_CHARACTERS_MESSAGE, code: TEXT_INPUT_INVALID_CHARACTERS } });
      expect(await apply("Camille", `camille${ZWSP}@test.local`)).toEqual({ status: 400, body: { error: TEXT_INPUT_INVALID_CHARACTERS_MESSAGE, code: TEXT_INPUT_INVALID_CHARACTERS } });
      expectNothingKept();
      expect(db().rows(medicalQuestions)).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("réservation — téléphone avec un caractère de contrôle (INTL-05)", () => {
  it("le refuse avec le motif invalid_characters et son message, jamais avec le JSON de la validation", async () => {
    for (const phone of [`+33 6 12 34 56 78${NUL}`, "+33 6 12 34\r\n56 78", `+33\t612345678`, `+33 6 12 34 56 78${character(0x85)}`]) {
      const refused = await trpc("appointments.create", { ...forms.appointments("Jeanne Martin"), customerPhone: phone }, "198.51.100.150");
      expect(refused.status, JSON.stringify(phone)).toBe(400);
      expect(refused.error, JSON.stringify(phone)).toMatchObject({ message: TEXT_INPUT_INVALID_CHARACTERS_MESSAGE, data: { reason: TEXT_INPUT_INVALID_CHARACTERS } });
    }
    expectNothingKept();
  });

  it("lit toujours un numéro collé avec ses marques de direction, comme la page (INTL-09)", async () => {
    // A name left empty once cleaned is refused after the input is read: the phone went through.
    const read = await trpc("appointments.create", { ...forms.appointments(" "), customerPhone: `${RLM}+33 6 12 34 56 78${LRM}` }, "198.51.100.151");
    expect(read.error?.data.reason).toBe("invalid_name");
  });
});
