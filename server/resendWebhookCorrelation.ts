export const RESEND_APPLICATION_CONFIRMATION_KIND = "application_confirmation";
export const RESEND_APPLICATION_ACTIVATION_KIND = "candidate_portal_activation";
export const RESEND_APPLICATION_INVITATION_KIND = "candidate_portal_invitation";

export type ResendApplicationEmailKind =
  | typeof RESEND_APPLICATION_CONFIRMATION_KIND
  | typeof RESEND_APPLICATION_ACTIVATION_KIND
  | typeof RESEND_APPLICATION_INVITATION_KIND;

const RESEND_APPLICATION_EMAIL_KINDS = new Set<ResendApplicationEmailKind>([
  RESEND_APPLICATION_CONFIRMATION_KIND,
  RESEND_APPLICATION_ACTIVATION_KIND,
  RESEND_APPLICATION_INVITATION_KIND,
]);

type ResendTag = { name?: unknown; value?: unknown };

function resendTagValue(tags: unknown, name: string): string | null {
  if (Array.isArray(tags)) {
    const match = (tags as ResendTag[]).find(tag => tag?.name === name);
    return typeof match?.value === "string" ? match.value : null;
  }
  if (!tags || typeof tags !== "object") return null;
  const value = (tags as Record<string, unknown>)[name];
  return typeof value === "string" ? value : null;
}

function safeApplicationReference(value: string) {
  const reference = value.trim();
  return /^[A-Za-z0-9_-]{3,64}$/.test(reference) ? reference : null;
}

/**
 * Resend echoes these correlation tags in signed webhook events. The
 * pseudonymous application reference is already present in the subject and
 * body of the same email; no candidate attribute is added to the tags.
 */
export function buildResendApplicationTags(
  applicationReference: string,
  emailKind: ResendApplicationEmailKind = RESEND_APPLICATION_CONFIRMATION_KIND
) {
  const reference = safeApplicationReference(applicationReference);
  return reference
    ? [
        { name: "email_kind", value: emailKind },
        { name: "application_ref", value: reference },
      ]
    : [{ name: "email_kind", value: emailKind }];
}

/** Accept both Resend's webhook object shape and the API request array shape. */
export function resendApplicationReferenceFromTags(
  tags: unknown
): string | null {
  const emailKind = resendTagValue(tags, "email_kind");
  if (
    !emailKind ||
    !RESEND_APPLICATION_EMAIL_KINDS.has(emailKind as ResendApplicationEmailKind)
  )
    return null;
  const reference = resendTagValue(tags, "application_ref");
  return reference ? safeApplicationReference(reference) : null;
}

/**
 * The patient emails of a booking (EXPL-13), each tagged with its kind and the
 * booking reference, already in the subject and body of the same email: a
 * bounce reported by Resend's webhook is traced back to the appointment.
 */
const RESEND_APPOINTMENT_EMAIL_KINDS = {
  confirmation: "appointment_confirmation",
  invoice: "appointment_invoice",
  reminder: "appointment_reminder",
  refund: "appointment_refund",
} as const;

export type ResendAppointmentEmail =
  keyof typeof RESEND_APPOINTMENT_EMAIL_KINDS;

export function buildResendAppointmentTags(
  trackingId: string,
  email: ResendAppointmentEmail
) {
  const reference = safeApplicationReference(trackingId);
  return [
    { name: "email_kind", value: RESEND_APPOINTMENT_EMAIL_KINDS[email] },
    ...(reference ? [{ name: "appointment_ref", value: reference }] : []),
  ];
}

/** The booking email a webhook event is about, from its tags (both shapes, as above); null for any other email. */
export function resendAppointmentEmailFromTags(
  tags: unknown
): { email: ResendAppointmentEmail; trackingId: string } | null {
  const emailKind = resendTagValue(tags, "email_kind");
  const email = (
    Object.keys(RESEND_APPOINTMENT_EMAIL_KINDS) as ResendAppointmentEmail[]
  ).find(key => RESEND_APPOINTMENT_EMAIL_KINDS[key] === emailKind);
  const reference = resendTagValue(tags, "appointment_ref");
  const trackingId = reference ? safeApplicationReference(reference) : null;
  return email && trackingId ? { email, trackingId } : null;
}

export function resendRecipientMatchesApplication(
  recipientEmail: string | null,
  applicationEmail: string | null | undefined
) {
  if (!recipientEmail || !applicationEmail) return false;
  return (
    recipientEmail.trim().toLowerCase() ===
    applicationEmail.trim().toLowerCase()
  );
}
