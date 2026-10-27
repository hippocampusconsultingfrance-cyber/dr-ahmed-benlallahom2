import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import { startFitsDeadline } from "../processingDeadline";
import { alertSendSlot, reportResendQuotaError, resendDeliveryFailureCode, sendSlotBeforeNewTry, sendWithRateLimitRetry } from "./resendDelivery";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const OWNER_NOTIFICATION_EMAIL = process.env.OWNER_NOTIFICATION_EMAIL?.trim() || "hippocampusconsultingfrance@gmail.com";
const FROM_EMAIL = "Hippocampus Consulting <recrutement@drahmedbenlallahom.com>";
let resendClient: Resend | undefined;

function getResendClient(): Resend | undefined {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return undefined;
  resendClient ??= new Resend(apiKey);
  return resendClient;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * The owner notification email itself (sender, owner mailbox, escaped HTML and
 * plain text). The paid-booking notification sends it with the post-payment
 * retries (see sendOwnerNotificationEmail).
 */
export function buildOwnerNotificationEmail(payload: NotificationPayload) {
  const { title, content } = validatePayload(payload);
  return {
    from: FROM_EMAIL,
    to: [OWNER_NOTIFICATION_EMAIL],
    replyTo: OWNER_NOTIFICATION_EMAIL,
    subject: title.slice(0, 200),
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a"><div style="padding:18px 22px;background:#071827;color:#fff;border-bottom:3px solid #0891b2"><strong>Hippocampus Consulting</strong></div><div style="padding:24px;border:1px solid #dbe4ee;border-top:0"><h2 style="margin-top:0;color:#0e7490">${escapeHtml(title)}</h2><div style="white-space:pre-wrap;line-height:1.6">${escapeHtml(content)}</div><p style="margin-top:24px;font-size:12px;color:#64748b">Notification privée générée par drahmedbenlallahom.com</p></div></div>`,
    text: `${title}\n\n${content}\n\nNotification privée générée par drahmedbenlallahom.com`,
  };
}

/**
 * Dispatches a private project-owner notification through Resend. As for the
 * other emails (ABUS-03), Resend's rate limit gets one more send after its
 * retry-after delay when that delay is short (a few seconds at most, so a
 * request is not held much longer), and a used-up quota is logged as a
 * high-severity event.
 * With an idempotency key, an uncertain answer (network error, timeout, 5xx:
 * Resend may have taken the email) is asked again once at once under that
 * key (REC-09): Resend keeps a key only 24 hours, and the caller's own retry,
 * minutes or a daily pass later, may come once it is forgotten. Sent from a
 * processing that spaces its sends (the post-payment jobs), that new try
 * waits for its send slot (ABUS-03).
 * `stopAtDeadline`: for an alert queued as a post-payment job (refund_owner),
 * not asked again once the immediate budget of the processing it runs in is
 * spent, the request it serves having answered (ABUS-03): its job goes back to
 * the queue. Without it (the other alerts, queued nowhere), it is asked again
 * whatever the time, rather than lost.
 */
export async function notifyOwner(
  payload: NotificationPayload,
  options: { idempotencyKey?: string; stopAtDeadline?: boolean } = {},
): Promise<boolean> {
  const message = buildOwnerNotificationEmail(payload);
  const resend = getResendClient();
  if (!resend) {
    console.warn("[Notification] Resend is not configured; the database record remains available.");
    return false;
  }

  const { idempotencyKey, stopAtDeadline = false } = options;
  const attempts = idempotencyKey ? 2 : 1;
  for (let attempt = 1; ; attempt += 1) {
    try {
      // A stable idempotency key lets a caller retry without a duplicate email.
      const { error } = await sendWithRateLimitRetry(() => idempotencyKey
        ? resend.emails.send(message, { idempotencyKey })
        : resend.emails.send(message));
      if (!error) return true;
      console.warn(`[Notification] Resend rejected the owner notification: ${error.message}`);
      // A used-up quota is logged as a high-severity event. Its owner alert,
      // refused in turn, logs one more event; the alert's slot, held during
      // the send, then stops the chain.
      await reportResendQuotaError(error, "owner_notification");
      if (attempt >= attempts || resendDeliveryFailureCode(error) !== "delivery_exception") return false;
    } catch {
      console.warn("[Notification] Owner email delivery failed.");
      if (attempt >= attempts) return false;
    }
    // The new try takes the send slot of the processing it runs in, if any
    // (ABUS-03), rather than reach Resend right after the first one.
    if (stopAtDeadline) {
      if (!(await sendSlotBeforeNewTry(startFitsDeadline))) return false;
    } else {
      await alertSendSlot();
    }
  }
}
