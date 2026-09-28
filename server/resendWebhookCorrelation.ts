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
  emailKind: ResendApplicationEmailKind = RESEND_APPLICATION_CONFIRMATION_KIND,
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
export function resendApplicationReferenceFromTags(tags: unknown): string | null {
  const emailKind = resendTagValue(tags, "email_kind");
  if (!emailKind || !RESEND_APPLICATION_EMAIL_KINDS.has(emailKind as ResendApplicationEmailKind)) return null;
  const reference = resendTagValue(tags, "application_ref");
  return reference ? safeApplicationReference(reference) : null;
}

export function resendRecipientMatchesApplication(
  recipientEmail: string | null,
  applicationEmail: string | null | undefined,
) {
  if (!recipientEmail || !applicationEmail) return false;
  return recipientEmail.trim().toLowerCase() === applicationEmail.trim().toLowerCase();
}
