/**
 * REC-14: an invitation to the candidate portal whose delivery is uncertain
 * (Resend did not answer, email.delivery_unknown) blocks any new one, so that
 * the candidate does not receive it twice. This long after that attempt, the
 * admin may send it again anyway (« Renvoyer quand même »), once its tracking
 * is checked: the new attempt has its own Resend idempotency key, so it is
 * sent at most once, whatever the clicks.
 */
export const CANDIDATE_INVITATION_FORCED_RESEND_DELAY_MS = 10 * 60_000;

/** When « Renvoyer quand même » becomes possible after an uncertain attempt made at `occurredAt`. */
export function candidateInvitationForcedResendAt(
  occurredAt: Date | string | number
): Date {
  return new Date(
    new Date(occurredAt).getTime() + CANDIDATE_INVITATION_FORCED_RESEND_DELAY_MS
  );
}
