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

const owner = vi.hoisted(() => ({ notifyOwner: vi.fn(async (_payload: { title: string; content: string }, _options?: unknown) => true) }));
vi.mock("./_core/notification", () => owner);

import { siteConfig } from "../client/src/data/site-config";
import { DEFAULT_TRANSACTIONAL_FROM, resolveConsultationContact } from "./consultationContact";
import {
  buildBookingConfirmationEmail,
  sendConfirmationEmail,
  sendInvoiceEmail,
  sendOwnerNotificationEmail,
  sendRefundConfirmationEmail,
  sendReminderEmail,
  sendUnconfirmablePaymentEmail,
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

type SentAttachment = { filename: string; content: string; contentType?: string };
const calendarOf = (message: Record<string, unknown>) => {
  const attachment = (message.attachments as SentAttachment[]).find(item => item.filename.endsWith(".ics"))!;
  return { attachment, ics: Buffer.from(attachment.content, "base64").toString("utf8") };
};

describe("emails patients dans la langue de la réservation (EN-01) et fichier agenda (RES-05)", () => {
  it("confirmation en anglais : textes, heure de Paris, montant, politique d’annulation et .ics joint", async () => {
    await sendConfirmationEmail("patient@example.test", "John Smith", "APTMAIL0002", NIGHT_APPOINTMENT, 150, undefined, { idempotencyKey: "appointment-confirmation-APTMAIL0002", language: "en", confirmedAt: new Date("2026-10-10T08:00:00Z") });
    const message = last();
    expect(message.subject).toBe("Booking confirmation - APTMAIL0002");
    for (const body of [String(message.text), String(message.html)]) {
      expect(body).toContain("Hello John Smith,");
      expect(body).toContain("Friday, 16 October 2026 at 00:30 (Paris time)");
      expect(body).toContain("€150.00");
      expect(body).toContain("more than 24 hours before the appointment");
      expect(body).toContain("Add to my calendar: open the attached file “consultation-APTMAIL0002.ics”");
      expect(body).toContain(siteConfig.phone);
      expect(body).not.toMatch(/Bonjour|Référence|heure de Paris|Annulation/);
    }
    expect(String(message.text)).toContain("Reference: APTMAIL0002");
    expect(String(message.html)).toContain("Professional and confidential communication");
    const { attachment, ics } = calendarOf(message);
    expect(attachment.contentType).toBe("text/calendar; charset=utf-8; method=PUBLISH");
    expect(ics).toContain("SUMMARY:Consultation with Dr Ahmed Ben Lallahom\r\n");
    expect(ics).toContain("DTSTART:20261015T223000Z\r\n");
    expect(ics).toContain("DTEND:20261015T230000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261010T080000Z\r\n");
    expect(ics).toContain("UID:APTMAIL0002@drahmedbenlallahom.com\r\n");
  });

  it("confirmation en français : même .ics, en français, avec la modalité configurée et la mention « Ajouter à mon agenda »", async () => {
    vi.stubEnv("CONSULTATION_MODALITY_TEXT", "Appel téléphonique au numéro indiqué, à l’heure prévue.");
    await sendConfirmationEmail("patient@example.test", "Patient Test", "APTMAIL0001", NIGHT_APPOINTMENT, 100, undefined, { confirmedAt: new Date("2026-10-10T08:00:00Z") });
    const message = last();
    expect(message.subject).toBe("Confirmation de réservation - APTMAIL0001");
    expect(String(message.text)).toContain("Ajouter à mon agenda : ouvrez le fichier joint « consultation-APTMAIL0001.ics »");
    const { ics } = calendarOf(message);
    expect(ics).toContain("SUMMARY:Consultation avec le Dr Ahmed Ben Lallahom\r\n");
    expect(ics.replace(/\r\n /g, "")).toContain("Déroulement : Appel téléphonique au numéro indiqué\\, à l’heure prévue.");
    expect(ics).toContain("DTSTART:20261015T223000Z\r\n");
  });

  it("présente la modalité configurée sous « Consultation format » en anglais, dans l’email et le .ics", async () => {
    vi.stubEnv("CONSULTATION_MODALITY_TEXT", "Video call, link sent the day before.");
    await sendConfirmationEmail("patient@example.test", "John Smith", "APTMAIL0004", NIGHT_APPOINTMENT, 100, undefined, { language: "en", confirmedAt: new Date("2026-10-10T08:00:00Z") });
    const message = last();
    expect(String(message.text)).toContain("Consultation format: Video call, link sent the day before.");
    expect(calendarOf(message).ics.replace(/\r\n /g, "")).toContain("Consultation format: Video call\\, link sent the day before.");
    await sendReminderEmail("patient@example.test", "John Smith", "APTMAIL0004", NIGHT_APPOINTMENT, { language: "en" });
    expect(String(last().text)).toContain("Consultation format: Video call, link sent the day before.");
  });

  it("un nouvel essai avec la même date de paiement renvoie exactement le même email (clé d’idempotence)", async () => {
    const options = { idempotencyKey: "appointment-confirmation-APTMAIL0003", language: "en" as const, confirmedAt: new Date("2026-10-10T08:00:00Z") };
    await sendConfirmationEmail("patient@example.test", "John Smith", "APTMAIL0003", NIGHT_APPOINTMENT, 100, undefined, options);
    await sendConfirmationEmail("patient@example.test", "John Smith", "APTMAIL0003", NIGHT_APPOINTMENT, 100, undefined, options);
    expect(sent.emails.at(-1)!.message).toEqual(sent.emails.at(-2)!.message);
  });

  it("facture en anglais : annonce une facture émise en français, PDF inchangé", async () => {
    await sendInvoiceEmail("patient@example.test", "John Smith", "APTMAIL0002", 100, Buffer.from("%PDF-test"), "FAC-2026-000002", { language: "en" });
    const message = last();
    expect(message.subject).toBe("Invoice - Consultation APTMAIL0002");
    expect(String(message.text)).toContain("issued in French as required by French law, is attached");
    expect(String(message.text)).toContain("Invoice no.: FAC-2026-000002");
    expect((message.attachments as SentAttachment[])[0].filename).toBe("Facture-FAC-2026-000002.pdf");
  });

  it("rappel, annulation par le praticien et paiement non rattachable en anglais", async () => {
    await sendReminderEmail("patient@example.test", "John Smith", "APTMAIL0002", NIGHT_APPOINTMENT, { language: "en" });
    expect(last().subject).toBe("Reminder - Your consultation is coming up (APTMAIL0002)");
    expect(String(last().text)).toContain("scheduled for Friday, 16 October 2026 at 00:30 (Paris time)");

    await sendRefundConfirmationEmail("patient@example.test", "John Smith", "APTMAIL0002", NIGHT_APPOINTMENT, "150.00", { context: "practitioner_cancellation", reason: "Doctor unavailable", language: "en" });
    expect(last().subject).toBe("Cancellation of your consultation - APTMAIL0002");
    expect(String(last().text)).toContain("Reason: Doctor unavailable");
    expect(String(last().text)).toContain("Amount refunded: €150.00");

    await sendUnconfirmablePaymentEmail("patient@example.test", { customerName: "John Smith", trackingId: "APTMAIL0002", appointmentDate: NIGHT_APPOINTMENT, amountCents: 10000, language: "en" }, "appointment-unconfirmable-cs_test");
    expect(last().subject).toBe("Your payment has been received: we will sort out your booking - APTMAIL0002");
    expect(String(last().text)).toContain("Amount received: €100.00");
  });

  it("la notification au médecin indique la langue de la réservation", async () => {
    await sendOwnerNotificationEmail("John Smith", "patient@example.test", "+971500000000", "APTMAIL0002", NIGHT_APPOINTMENT, 150, { language: "en" });
    expect(owner.notifyOwner.mock.calls.at(-1)![0].content).toContain("Langue : EN");
    await sendOwnerNotificationEmail("Patient Test", "patient@example.test", "+33600000000", "APTMAIL0001", NIGHT_APPOINTMENT, 100);
    expect(owner.notifyOwner.mock.calls.at(-1)![0].content).toContain("Langue : FR");
  });
});
