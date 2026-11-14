import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  candidateSecurityRateLimits,
  medicalQuestionAuditLogs,
  medicalQuestions,
  securityEvents,
} from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// MAIL-09 — the answer to a health question goes out in the language the
// question was asked in, signed « Dr Ahmed Ben Lallahom »; MAIL-07 — the
// acknowledgement links the GDPR form; MAIL-10 — the answer keeps its line
// breaks; MAIL-12 — the preview gives the reference, never the answer.

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  sent: [] as Array<{ subject: string; html: string; text: string }>,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: vi.fn(
        async (message: { subject: string; html: string; text: string }) => {
          state.sent.push(message);
          return { data: { id: `email_${state.sent.length}` }, error: null };
        }
      ),
    };
  },
}));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({
  ...(await importOriginal<typeof import("./adminMfa")>()),
  isAdminMfaVerified: vi.fn(async () => true),
}));
vi.mock("./_core/notification", async importOriginal => ({
  ...(await importOriginal<typeof import("./_core/notification")>()),
  notifyOwner: vi.fn(async () => true),
}));
vi.mock("./candidateTurnstile", () => ({
  verifyCandidateTurnstile: vi.fn(async () => undefined),
}));

const {
  sendMedicalQuestionAcknowledgementEmail,
  sendMedicalQuestionResponseEmail,
} = await import("./medicalQuestionEmails");
const { appRouter } = await import("./routers");

const previewOf = (html: string) =>
  /<body[^>]*>\s*<div style="display:none;[^"]*">([^&<]*)/.exec(html)?.[1];
const ANSWER =
  "Information générale : buvez de l’eau claire\njusqu’à deux heures avant.";

let memory: MemoryPg;

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test_medical_language");
  process.env.CANDIDATE_AUTH_PEPPER ||=
    "test-pepper-medical-questions-0123456789";
  memory = createMemoryPg([
    medicalQuestions,
    medicalQuestionAuditLogs,
    securityEvents,
    candidateSecurityRateLimits,
  ]);
  state.memory = memory;
  state.sent = [];
});

describe("réponse à une question santé", () => {
  it("part en anglais pour une question posée en anglais (ou en allemand, en chinois), en français pour le français et une langue inconnue", async () => {
    for (const language of ["en", "de", "zh"]) {
      await sendMedicalQuestionResponseEmail({
        email: "jane@example.test",
        firstName: "Jane",
        trackingId: "QMED-LANGUAGE-00001",
        response: "General information.",
        language,
      });
    }
    for (const english of state.sent) {
      expect(english.subject).toBe(
        "Answer to your question — QMED-LANGUAGE-00001"
      );
      expect(
        english.text.startsWith(
          "Hello Jane,\n\nYour question has been reviewed.\n\n"
        )
      ).toBe(true);
      expect(english.text).toContain(
        "Important information: this general answer does not replace a consultation"
      );
      expect(english.text).toContain(
        "Confidential reference: QMED-LANGUAGE-00001"
      );
      expect(english.html).toContain('<html lang="en">');
      expect(english.html).toContain(
        "reviewed and validated by Dr Ahmed Ben Lallahom."
      );
      expect(`${english.html}${english.text}`).not.toMatch(
        /Bonjour|Réponse|Référence|Information importante|Politique/
      );
    }

    state.sent = [];
    await sendMedicalQuestionResponseEmail({
      email: "jeanne@example.test",
      firstName: "Jeanne",
      trackingId: "QMED-LANGUAGE-00002",
      response: "Information générale.",
      language: "fr",
    });
    await sendMedicalQuestionResponseEmail({
      email: "jeanne@example.test",
      firstName: "Jeanne",
      trackingId: "QMED-LANGUAGE-00003",
      response: "Information générale.",
    });
    for (const french of state.sent) {
      expect(french.subject).toMatch(
        /^Réponse à votre question — QMED-LANGUAGE-0000[23]$/
      );
      expect(
        french.text.startsWith(
          "Bonjour Jeanne,\n\nVotre question a été examinée.\n\n"
        )
      ).toBe(true);
      expect(french.html).toContain('<html lang="fr">');
      expect(french.html).toContain(
        "relue et validée par le Dr Ahmed Ben Lallahom."
      );
    }
  });

  it("garde les retours à la ligne de la réponse en <br />, au nom du médecin, et n’en met rien dans l’aperçu", async () => {
    await sendMedicalQuestionResponseEmail({
      email: "jeanne@example.test",
      firstName: "Jeanne",
      trackingId: "QMED-LANGUAGE-00004",
      response: ANSWER,
      language: "fr",
    });
    const [email] = state.sent;
    expect(email!.html).toContain(
      "Information générale : buvez de l’eau claire<br />jusqu’à deux heures avant."
    );
    expect(email!.html).not.toContain("white-space");
    expect(email!.html).toContain(">Dr Ahmed Ben Lallahom</div>");
    expect(email!.html).not.toContain("Hippocampus");
    expect(email!.html).not.toMatch(/Dr\.\s/);
    expect(previewOf(email!.html)).toBe(
      "Réponse d’information générale relue et validée par le Dr Ahmed Ben Lallahom – réf. QMED-LANGUAGE-00004"
    );
    expect(previewOf(email!.html)).not.toMatch(/eau|Jeanne/);
  });

  it("est envoyée par le tableau de bord dans la langue enregistrée avec la question", async () => {
    const visitor = appRouter.createCaller({
      user: null,
      mfaVerified: false,
      req: {
        protocol: "https",
        headers: { "x-forwarded-for": "203.0.113.71" },
        ip: "203.0.113.71",
      } as unknown as TrpcContext["req"],
      res: {
        clearCookie: vi.fn(),
        cookie: vi.fn(),
      } as unknown as TrpcContext["res"],
    });
    await visitor.medicalQuestions.submit({
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@test.local",
      phone: "+447700900000",
      question:
        "Can I drink water before a general anaesthetic planned in the morning?",
      language: "en",
      privacyConsent: true,
      urgencyAcknowledged: true,
      turnstileToken: "turnstile-token-ok-000000000000",
    });
    const id = memory.rows(medicalQuestions)[0]!.id as number;
    state.sent = [];

    const owner = appRouter.createCaller({
      user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
      mfaVerified: true,
      req: {
        protocol: "https",
        headers: {},
        ip: "203.0.113.72",
      } as unknown as TrpcContext["req"],
      res: {
        clearCookie: vi.fn(),
        cookie: vi.fn(),
      } as unknown as TrpcContext["res"],
    });
    await expect(
      owner.medicalQuestions.admin.sendValidatedResponse({
        id,
        adminResponse:
          "General information: follow the fasting instructions of your anaesthesia team.",
        publicQuestion: "",
        publicResponse: "",
        publish: false,
      })
    ).resolves.toMatchObject({ success: true });

    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]!.subject).toMatch(/^Answer to your question — QMED-/);
    expect(state.sent[0]!.text.startsWith("Hello Jane,\n\n")).toBe(true);
  });
});

describe("accusé de réception d’une question santé", () => {
  it("donne le lien du formulaire RGPD dans la langue de l’email, à côté de la réponse par email (MAIL-07)", async () => {
    await sendMedicalQuestionAcknowledgementEmail({
      email: "jeanne@example.test",
      firstName: "Jeanne",
      trackingId: "QMED-ACK-000000001",
      language: "fr",
    });
    await sendMedicalQuestionAcknowledgementEmail({
      email: "jane@example.test",
      firstName: "Jane",
      trackingId: "QMED-ACK-000000002",
      language: "en",
    });
    const [french, english] = state.sent;
    expect(french!.html).toContain(
      'répondez à cet email en indiquant votre référence, ou utilisez notre <a href="https://drahmedbenlallahom.com/gdpr?lang=fr" style="color:#0e7490;">formulaire RGPD</a>.'
    );
    expect(french!.text).toContain(
      "ou utilisez notre formulaire RGPD : https://drahmedbenlallahom.com/gdpr?lang=fr"
    );
    expect(english!.html).toContain(
      'reply to this email with your reference, or use our <a href="https://drahmedbenlallahom.com/gdpr?lang=en" style="color:#0e7490;">GDPR form</a>.'
    );
    expect(english!.text).toContain(
      "or use our GDPR form: https://drahmedbenlallahom.com/gdpr?lang=en"
    );
    for (const email of [french!, english!]) {
      expect(email.html).toContain(">Dr Ahmed Ben Lallahom</div>");
      expect(`${email.html}${email.text}`).not.toMatch(/Dr\.\s|Hippocampus/);
    }
    expect(previewOf(french!.html)).toBe(
      "Référence QMED-ACK-000000001 – votre question sera relue par le Dr Ahmed Ben Lallahom avant toute réponse."
    );
    expect(previewOf(english!.html)).toBe(
      "Reference QMED-ACK-000000002 – your question will be reviewed by Dr Ahmed Ben Lallahom before any answer."
    );
  });
});
