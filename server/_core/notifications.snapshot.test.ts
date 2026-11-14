import { describe, expect, it } from "vitest";
import { resolveConsultationContact } from "../consultationContact";
import { buildMedicalQuestionOwnerNotification } from "../medicalQuestionEmails";
import { buildClientBriefOwnerNotification } from "../clientBriefNotification";
import { buildOwnerNotificationEmail } from "./notification";
import {
  buildBookingConfirmationEmail,
  buildBookingReminderEmail,
  buildCandidatePortalAccessEmail,
  buildInvoiceEmail,
  buildRecruitmentCampaignEmail,
  buildRecruitmentTemplateEmail,
  buildRefundEmail,
  buildUnconfirmablePaymentEmail,
  type EmailLanguage,
} from "./notifications";

// MAIL-13: the rendering of each email builder, in French and in English, kept
// as a snapshot: a change of a template shows in review, line by line, before
// it reaches a patient or a candidate. `pnpm vitest run -u` records a wanted change.

const contact = resolveConsultationContact({});
const appointmentDate = new Date("2026-11-20T09:00:00.000Z");
const receivedAt = new Date("2026-11-08T10:00:00.000Z");
const booking = (language: EmailLanguage) => ({
  customerName: "Camille Martin",
  trackingId: "APTSNAPSHOT01",
  appointmentDate,
  language,
});

const BUILDERS: Record<
  string,
  (language: EmailLanguage) => {
    subject: string;
    html: string;
    text?: string;
    headers?: Record<string, string>;
  }
> = {
  bookingConfirmation: language => {
    const { attachments, ...email } = buildBookingConfirmationEmail(
      {
        ...booking(language),
        finalPrice: 100,
        meetLink: "https://drahmedbenlallahom.com/visio/exemple",
        confirmedAt: receivedAt,
      },
      contact
    );
    return {
      ...email,
      text: `${email.text}\n\n[pièce jointe] ${attachments.map(attachment => `${attachment.filename} (${attachment.contentType})`).join(", ")}`,
    };
  },
  bookingReminder: language =>
    buildBookingReminderEmail(booking(language), contact),
  invoice: language =>
    buildInvoiceEmail(
      { ...booking(language), finalPrice: 100, invoiceNumber: "F-2026-0042" },
      contact
    ),
  refund: language =>
    buildRefundEmail({ ...booking(language), refundAmount: "100.00" }, contact),
  practitionerCancellation: language =>
    buildRefundEmail(
      {
        ...booking(language),
        refundAmount: "100.00",
        context: "practitioner_cancellation",
        reason: "Indisponibilité",
      },
      contact
    ),
  unconfirmedPaymentRefund: language =>
    buildRefundEmail(
      {
        ...booking(language),
        refundAmount: "100.00",
        context: "unconfirmed_payment",
      },
      contact
    ),
  unconfirmablePayment: language =>
    buildUnconfirmablePaymentEmail(
      { ...booking(language), amountCents: 10_000 },
      contact
    ),
  candidatePortalVerify: language =>
    buildCandidatePortalAccessEmail({
      to: "camille@example.test",
      firstName: "Camille",
      kind: "verify",
      actionUrl:
        "https://drahmedbenlallahom.com/candidate/verify?token=exemple",
      language,
    }),
  candidatePortalReset: language =>
    buildCandidatePortalAccessEmail({
      to: "camille@example.test",
      firstName: "Camille",
      kind: "reset",
      actionUrl: "https://drahmedbenlallahom.com/candidate/reset?token=exemple",
      language,
    }),
  candidatePortalInvite: language =>
    buildCandidatePortalAccessEmail({
      to: "camille@example.test",
      firstName: "Camille",
      kind: "invite",
      actionUrl:
        "https://drahmedbenlallahom.com/candidate/access?invite=exemple",
      language,
    }),
  recruitmentProfileInterest: language =>
    buildRecruitmentTemplateEmail(
      "Camille",
      "CVSNAPSHOT01",
      "profile_interest",
      { language }
    ),
  recruitmentAdditionalInformation: language =>
    buildRecruitmentTemplateEmail(
      "Camille",
      "CVSNAPSHOT01",
      "additional_information",
      { language, customRequest: "Diplôme\nAttestation" }
    ),
  recruitmentCampaign: language =>
    buildRecruitmentCampaignEmail({
      candidateFirstName: "Camille",
      campaignTitle: "Anesthésie – Canada",
      subject: "Opportunité",
      body: "Une mission de six mois.\nRépondez par email.",
      language,
      unsubscribeUrl:
        "https://drahmedbenlallahom.com/recruitment/unsubscribe?token=exemple",
      oneClickUnsubscribeUrl:
        "https://drahmedbenlallahom.com/api/recruitment/unsubscribe?token=exemple",
    }),
};

describe("rendu des emails (MAIL-13)", () => {
  for (const [name, build] of Object.entries(BUILDERS)) {
    for (const language of ["fr", "en"] as const) {
      it(`${name} (${language})`, () => {
        expect(build(language)).toMatchSnapshot();
      });
    }
  }

  // Written for the owner, in French only.
  it.each([
    [
      "ownerMedicalQuestion",
      buildMedicalQuestionOwnerNotification({
        trackingId: "QMEDSNAPSHOT01",
        language: "en",
        publicationConsent: true,
        receivedAt,
      }),
    ],
    [
      "ownerClientBrief",
      buildClientBriefOwnerNotification({
        briefId: "BRIEFSNAPSHOT01",
        organizationName: "Clinique Exemple",
        contactName: "Service RH",
        email: "rh@example.test",
        targetEnvironment: "Bloc opératoire",
        specialtyNeeded: "Anesthésie",
        country: "Suisse",
        receivedAt,
      }),
    ],
  ])("%s (fr)", (_name, payload) => {
    expect(buildOwnerNotificationEmail(payload)).toMatchSnapshot();
  });
});
