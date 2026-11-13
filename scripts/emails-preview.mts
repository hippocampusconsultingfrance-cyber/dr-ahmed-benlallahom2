/**
 * `pnpm emails:preview [dossier]` (MAIL-13) : écrit tous les emails du site,
 * en français et en anglais, dans un dossier que git ignore
 * (tmp/emails-preview par défaut) : un .html par email, un .txt pour sa
 * version texte, et un index.html qui les liste avec leur objet. Les emails
 * de l'administrateur et du propriétaire, écrits en français seulement, sont
 * dans fr/.
 *
 * Aucun email n'est envoyé : chacun est produit par son vrai gabarit (les
 * fonctions build*), ou par son vrai envoi quand il n'a pas de gabarit à
 * part, et les requêtes de ces envois vers Resend reçoivent ici une réponse
 * factice qui les garde ; toute autre requête réseau est refusée.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Language = "fr" | "en";
export type PreviewEmail = { name: string; language: Language; subject: string; html: string; text?: string };
type ResendMessage = { subject: string; html: string; text?: string };

const LANGUAGES: Language[] = ["fr", "en"];
const APPOINTMENT_DATE = new Date("2026-11-20T09:00:00.000Z");
const RECEIVED_AT = new Date("2026-11-08T10:00:00.000Z");
const ORIGIN = "https://drahmedbenlallahom.com";

/**
 * Runs `send` with Resend's requests answered here, and returns the emails
 * they carried; any other request throws. The real fetch is put back after.
 */
async function captureResendEmails(send: () => Promise<unknown>): Promise<ResendMessage[]> {
  const captured: ResendMessage[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (init?.method !== "POST" || !/\/emails(\/batch)?$/.test(url.pathname)) throw new Error(`emails:preview sends nothing: request to ${url.host} refused`);
    const body = JSON.parse(String(init.body)) as ResendMessage | ResendMessage[];
    const messages = Array.isArray(body) ? body : [body];
    captured.push(...messages);
    const answer = Array.isArray(body) ? { data: messages.map((_, index) => ({ id: `preview-${index}` })) } : { id: "preview" };
    return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await send();
  } finally {
    globalThis.fetch = realFetch;
  }
  return captured;
}

/** Every email of the site, in French and in English where it exists in English, built and never sent. */
export async function renderEmailPreviews(): Promise<PreviewEmail[]> {
  // Resend's client needs a key to be built; none reaches Resend, whatever the environment holds.
  process.env.RESEND_API_KEY = "re_emails_preview_never_sent";
  const notifications = await import("../server/_core/notifications");
  const { buildOwnerNotificationEmail } = await import("../server/_core/notification");
  const { sendMedicalQuestionAcknowledgementEmail, sendMedicalQuestionResponseEmail, buildMedicalQuestionOwnerNotification } = await import("../server/medicalQuestionEmails");
  const { sendPublicFormAcknowledgement } = await import("../server/publicFormAcknowledgements");
  const { buildClientBriefOwnerNotification } = await import("../server/clientBriefNotification");
  const { buildGdprRequestOwnerNotification } = await import("../server/gdprRequestNotification");

  const emails: PreviewEmail[] = [];
  const add = (name: string, language: Language, email: ResendMessage) => emails.push({ name, language, subject: email.subject, html: email.html, text: email.text });
  const addSent = async (name: string, language: Language, send: () => Promise<unknown>) => {
    for (const email of await captureResendEmails(send)) add(name, language, email);
  };

  for (const language of LANGUAGES) {
    const booking = { customerName: "Camille Martin", trackingId: "APT-2026-000123", appointmentDate: APPOINTMENT_DATE, language };
    add("rendez-vous-confirmation", language, notifications.buildBookingConfirmationEmail({ ...booking, finalPrice: 100, meetLink: `${ORIGIN}/visio/exemple`, confirmedAt: RECEIVED_AT }));
    add("rendez-vous-rappel", language, notifications.buildBookingReminderEmail(booking));
    add("rendez-vous-facture", language, notifications.buildInvoiceEmail({ ...booking, finalPrice: 100, invoiceNumber: "F-2026-0042" }));
    add("rendez-vous-remboursement", language, notifications.buildRefundEmail({ ...booking, refundAmount: "100.00", context: "refund" }));
    add("rendez-vous-annulation-praticien", language, notifications.buildRefundEmail({ ...booking, refundAmount: "100.00", context: "practitioner_cancellation", reason: language === "en" ? "Unavailable on that day." : "Indisponibilité ce jour-là." }));
    add("rendez-vous-paiement-non-confirme-rembourse", language, notifications.buildRefundEmail({ ...booking, refundAmount: "100.00", context: "unconfirmed_payment" }));
    add("rendez-vous-paiement-a-regulariser", language, notifications.buildUnconfirmablePaymentEmail({ ...booking, amountCents: 10_000 }));

    await addSent("candidature-recue", language, () => notifications.sendCvApplicationConfirmationEmail("camille@example.test", "Camille", "CV-2026-000123", `${ORIGIN}/candidate/access?invite=exemple`, "emails-preview", language));
    for (const kind of ["verify", "reset", "invite"] as const) {
      add(`espace-candidat-${kind}`, language, notifications.buildCandidatePortalAccessEmail({ to: "camille@example.test", firstName: "Camille", kind, actionUrl: `${ORIGIN}/candidate/access?token=exemple`, language }));
    }
    add("recrutement-proposer-un-echange", language, notifications.buildRecruitmentTemplateEmail("Camille", "CV-2026-000123", "profile_interest", { language }));
    add("recrutement-demander-un-complement", language, notifications.buildRecruitmentTemplateEmail("Camille", "CV-2026-000123", "additional_information", { language, customRequest: language === "en" ? "Please send your registration certificate." : "Merci de transmettre votre attestation d’inscription." }));
    add("recrutement-campagne", language, notifications.buildRecruitmentCampaignEmail({
      candidateFirstName: "Camille",
      campaignTitle: language === "en" ? "Anaesthetists – Canada" : "Anesthésistes – Canada",
      subject: language === "en" ? "International medical opportunity" : "Opportunité médicale internationale",
      body: language === "en" ? "A six-month assignment in anaesthesia.\nReply to this email if it interests you." : "Une mission de six mois en anesthésie.\nRépondez à cet email si elle vous intéresse.",
      language,
      unsubscribeUrl: `${ORIGIN}/recruitment/unsubscribe?token=exemple`,
      oneClickUnsubscribeUrl: `${ORIGIN}/api/recruitment/unsubscribe?token=exemple`,
    }));

    await addSent("question-sante-accuse", language, () => sendMedicalQuestionAcknowledgementEmail({ email: "camille@example.test", firstName: "Camille", trackingId: "QMED-2026-000123", language }));
    await addSent("question-sante-reponse", language, () => sendMedicalQuestionResponseEmail({ email: "camille@example.test", firstName: "Camille", trackingId: "QMED-2026-000123", response: language === "en" ? "Example answer, validated by the doctor." : "Exemple de réponse, validée par le médecin.", language }));
    await addSent("contact-accuse", language, () => sendPublicFormAcknowledgement({ kind: "contact", email: "camille@example.test", reference: "C-2026-000123", language }));
    await addSent("brief-employeur-accuse", language, () => sendPublicFormAcknowledgement({ kind: "clientBrief", email: "rh@example.test", reference: "BRIEF-2026-000123", language }));
    await addSent("rgpd-accuse", language, () => sendPublicFormAcknowledgement({ kind: "gdprRequest", email: "camille@example.test", reference: "G7K2M9Q4R8T1V", language, confirmationUrl: `${ORIGIN}/gdpr?confirm=exemple${language === "en" ? "&lang=en" : ""}` }));
  }

  // French only: the administrator's code and the owner's notifications.
  await addSent("admin-code-de-securite", "fr", () => notifications.sendAdminMfaCodeEmail("admin@example.test", "123456"));
  await addSent("proprietaire-reservation-payee", "fr", () => notifications.sendOwnerNotificationEmail("Camille Martin", "camille@example.test", "+33 6 00 00 00 00", "APT-2026-000123", APPOINTMENT_DATE, 100));
  add("proprietaire-question-sante", "fr", buildOwnerNotificationEmail(buildMedicalQuestionOwnerNotification({ trackingId: "QMED-2026-000123", language: "fr", publicationConsent: false, receivedAt: RECEIVED_AT })));
  add("proprietaire-demande-rgpd", "fr", buildOwnerNotificationEmail(buildGdprRequestOwnerNotification({ trackingId: "G7K2M9Q4R8T1V", requestType: "deletion", name: "Camille Martin", email: "camille@example.test", hasDescription: true, acknowledged: true })));
  add("proprietaire-brief-employeur", "fr", buildOwnerNotificationEmail(buildClientBriefOwnerNotification({ briefId: "BRIEF-2026-000123", organizationName: "Clinique Exemple", contactName: "Service RH", email: "rh@example.test", targetEnvironment: "Bloc opératoire", specialtyNeeded: "Anesthésie", country: "Suisse", receivedAt: RECEIVED_AT })));
  return emails;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Writes the previews into `outDir`, with their index; returns the files written. */
export async function writeEmailPreviews(outDir: string): Promise<string[]> {
  const emails = await renderEmailPreviews();
  const written: string[] = [];
  const write = async (file: string, content: string) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
    written.push(file);
  };
  for (const email of emails) {
    await write(path.join(outDir, email.language, `${email.name}.html`), email.html);
    if (email.text) await write(path.join(outDir, email.language, `${email.name}.txt`), email.text);
  }
  const rows = emails.map(email => `<li><a href="${email.language}/${email.name}.html">${email.language} · ${escapeHtml(email.name)}</a>${email.text ? ` (<a href="${email.language}/${email.name}.txt">texte</a>)` : ""} — ${escapeHtml(email.subject)}</li>`);
  await write(path.join(outDir, "index.html"), `<!DOCTYPE html>\n<html lang="fr"><head><meta charset="utf-8" /><title>Aperçu des emails</title></head><body><h1>Aperçu des emails (${emails.length})</h1><p>Produits par leurs vrais gabarits, aucun envoyé.</p><ul>\n${rows.join("\n")}\n</ul></body></html>\n`);
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outDir = path.resolve(process.argv[2] ?? "tmp/emails-preview");
  const written = await writeEmailPreviews(outDir);
  console.log(`emails:preview: ${written.length} files written to ${outDir}; no email sent.`);
}
