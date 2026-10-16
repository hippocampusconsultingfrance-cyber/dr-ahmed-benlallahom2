import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// M4 — BOOK-EMAIL-CONTENT / LEGAL-24 / OPS-07 : emails patients avec Reply-To vers
// l’email public du site, coordonnées, heure de Paris, politique d’annulation et
// partie texte. Seul le transport Resend est simulé.

const sent = vi.hoisted(() => ({ emails: [] as Array<{ message: Record<string, unknown>; options?: Record<string, unknown> }> }));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(async (message: Record<string, unknown>, options?: Record<string, unknown>) => {
        sent.emails.push({ message, options });
        return { data: { id: `email_${sent.emails.length}` }, error: null };
      }),
    },
  })),
}));

import { siteConfig } from "../client/src/data/site-config";
import { DEFAULT_TRANSACTIONAL_FROM, resolveConsultationContact } from "./consultationContact";
import {
  buildBookingConfirmationEmail,
  sendConfirmationEmail,
  sendInvoiceEmail,
  sendRefundConfirmationEmail,
  sendReminderEmail,
} from "./_core/notifications";

const originalTz = process.env.TZ;
// 00:30 heure de Paris le 16 octobre (22:30 UTC la veille).
const NIGHT_APPOINTMENT = new Date("2026-10-15T22:30:00.000Z");

beforeEach(() => {
  sent.emails.length = 0;
  process.env.TZ = "UTC";
  vi.stubEnv("RESEND_API_KEY", "re_test_patient_emails");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("RESEND_API_KEY", "re_test_patient_emails");
});
afterAll(() => {
  vi.unstubAllEnvs();
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const last = () => sent.emails.at(-1)!.message;

describe("emails patients", () => {
  it("confirmation : Reply-To vers l’email public, coordonnées, heure de Paris, politique d’annulation et partie texte", async () => {
    await sendConfirmationEmail("patient@example.test", "Patient <Test>", "APTMAIL0001", NIGHT_APPOINTMENT, 150, undefined, { idempotencyKey: "appointment-confirmation-APTMAIL0001" });
    const message = last();
    expect(message.replyTo).toBe(siteConfig.email);
    expect(message.from).toBe(DEFAULT_TRANSACTIONAL_FROM);
    const text = String(message.text);
    const html = String(message.html);
    for (const body of [text, html]) {
      expect(body).toContain("vendredi 16 octobre 2026 à 00:30 (heure de Paris)");
      expect(body).toContain("150,00 €");
      expect(body).toContain(siteConfig.email);
      expect(body).toContain(siteConfig.phone);
      expect(body).toContain("plus de 24 heures avant le rendez-vous");
      expect(body).toContain("APTMAIL0001");
    }
    expect(html).toContain(`mailto:${siteConfig.email}`);
    expect(html).toContain("tel:+33972152413");
    expect(html).toContain("Patient &lt;Test&gt;");
    expect(html).not.toContain("Patient <Test>");
    expect(sent.emails.at(-1)!.options).toEqual({ idempotencyKey: "appointment-confirmation-APTMAIL0001" });
  });

  it("rappel : donne les coordonnées pour annuler ou reporter", async () => {
    await sendReminderEmail("patient@example.test", "Patient Test", "APTMAIL0001", NIGHT_APPOINTMENT);
    const message = last();
    expect(message.replyTo).toBe(siteConfig.email);
    expect(String(message.text)).toContain(siteConfig.phone);
    expect(String(message.text)).toContain(siteConfig.email);
    expect(String(message.text)).toContain("(heure de Paris)");
    expect(String(message.text)).toContain("plus de 24 heures avant le rendez-vous");
    expect(sent.emails.at(-1)!.options).toEqual({ idempotencyKey: "appointment-reminder-APTMAIL0001" });
  });

  it("facture : pièce jointe nommée d’après le numéro de facture, montant au format français, partie texte", async () => {
    await sendInvoiceEmail("patient@example.test", "Patient Test", "APTMAIL0001", 100, Buffer.from("%PDF-test"), "FAC-2026-000001");
    const message = last();
    expect(message.replyTo).toBe(siteConfig.email);
    expect((message.attachments as Array<{ filename: string }>)[0].filename).toBe("Facture-FAC-2026-000001.pdf");
    expect(String(message.text)).toContain("Facture n° : FAC-2026-000001");
    expect(String(message.text)).toContain("100,00 €");
  });

  it("annulation par le praticien : motif, remboursement et coordonnées", async () => {
    await expect(sendRefundConfirmationEmail("patient@example.test", "Patient Test", "APTMAIL0001", NIGHT_APPOINTMENT, "150.00", { context: "practitioner_cancellation", reason: "Indisponibilité du médecin" })).resolves.toBe(true);
    const message = last();
    expect(message.subject).toBe("Annulation de votre consultation - APTMAIL0001");
    expect(message.replyTo).toBe(siteConfig.email);
    expect(String(message.text)).toContain("Motif : Indisponibilité du médecin");
    expect(String(message.text)).toContain("Montant remboursé : 150,00 €");
    expect(String(message.text)).toContain(siteConfig.phone);
  });

  it("applique les surcharges d’environnement valides et ignore les valeurs invalides", async () => {
    vi.stubEnv("CONSULTATION_REPLY_TO", "consultation@example.test");
    vi.stubEnv("CONSULTATION_FROM_EMAIL", "Dr Ahmed Ben Lallahom <consultation@example.test>");
    vi.stubEnv("CONSULTATION_MODALITY_TEXT", "Consultation par appel téléphonique au numéro indiqué lors de la réservation.");
    await sendConfirmationEmail("patient@example.test", "Patient Test", "APTMAIL0001", NIGHT_APPOINTMENT, 100);
    expect(last()).toMatchObject({ replyTo: "consultation@example.test", from: "Dr Ahmed Ben Lallahom <consultation@example.test>" });
    expect(String(last().text)).toContain("Déroulement : Consultation par appel téléphonique");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveConsultationContact({ CONSULTATION_REPLY_TO: "not an email", CONSULTATION_FROM_EMAIL: "bad<" })).toMatchObject({ replyTo: siteConfig.email, from: DEFAULT_TRANSACTIONAL_FROM, modalityText: null });
    warn.mockRestore();
  });

  it("n’invente pas de modalité de consultation quand elle n’est pas configurée", () => {
    const email = buildBookingConfirmationEmail({ customerName: "P", trackingId: "APT1", appointmentDate: NIGHT_APPOINTMENT, finalPrice: 100 }, resolveConsultationContact({}));
    expect(email.text).not.toContain("Déroulement");
    expect(email.text).not.toMatch(/Google Meet|visioconférence/);
  });
});
