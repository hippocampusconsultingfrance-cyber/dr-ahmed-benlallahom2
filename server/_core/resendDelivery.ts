import { AsyncLocalStorage } from "node:async_hooks";
import { pauseWithinDeadline, startFitsDeadline, waitFitsDeadline } from "../processingDeadline";

/**
 * How the app reads a Resend refusal (ABUS-03), shared by the emails of
 * notifications.ts, by the owner notifications of notification.ts and by the
 * medical-question emails: a rate limit is retried once after Resend's
 * retry-after delay, a used-up quota is reported as a high-severity security event.
 */

/**
 * Why Resend did not take an email (ABUS-03):
 * - delivery_exception: network, timeout, 5xx or concurrent idempotent request;
 *   the email may have left, so it is retried with its idempotency key;
 * - rate_limited: more requests per second than the plan allows (429
 *   rate_limit_exceeded); nothing left, a new attempt follows Resend's
 *   retry-after delay;
 * - quota: the daily or monthly quota of the plan is used up; nothing leaves
 *   until it resets, so no immediate retry, and a high-severity security event;
 * - provider_rejected: this very message is refused (address, content), or
 *   the sending configuration (API key, sender); resendRefusedThisMessage
 *   tells them apart.
 */
export type ResendDeliveryFailureCode = "provider_rejected" | "delivery_exception" | "rate_limited" | "quota";

type ResendError = { name?: string; statusCode?: number | null };

const RESEND_QUOTA_ERRORS = new Set(["daily_quota_exceeded", "monthly_quota_exceeded"]);

export function resendDeliveryFailureCode(error: ResendError): ResendDeliveryFailureCode {
  const statusCode = typeof error.statusCode === "number" ? error.statusCode : null;
  const providerErrorName = typeof error.name === "string" ? error.name : null;
  if (providerErrorName && RESEND_QUOTA_ERRORS.has(providerErrorName)) return "quota";
  if (providerErrorName === "rate_limit_exceeded" || statusCode === 429) return "rate_limited";
  return statusCode === null
    || statusCode === 408
    || statusCode >= 500
    || providerErrorName === "concurrent_idempotent_requests"
    ? "delivery_exception"
    : "provider_rejected";
}

// The sending configuration, not one message: refused for every email until corrected.
const RESEND_CONFIGURATION_ERRORS = new Set(["missing_api_key", "invalid_api_key", "restricted_api_key", "invalid_from_address"]);

/**
 * Whether a provider_rejected refusal is about this very message (an address
 * or a field of it: 400 or 422), so that sending it again later changes
 * nothing (EXPL-02). A refusal of the sending configuration (API key, sender
 * address, sender domain not verified: 401, 403 or invalid_from_address)
 * passes once the configuration is corrected, so it is not one.
 */
export function resendRefusedThisMessage(error: ResendError): boolean {
  if (resendDeliveryFailureCode(error) !== "provider_rejected") return false;
  const providerErrorName = typeof error.name === "string" ? error.name : null;
  return (error.statusCode === 400 || error.statusCode === 422)
    && !(providerErrorName && RESEND_CONFIGURATION_ERRORS.has(providerErrorName));
}

/**
 * Delay before a new attempt after Resend's rate limit: its retry-after header
 * (seconds), 1 s without one. A request waits at most maxDelayMs, and never
 * past the deadline of the processing it runs in (the post-payment emails sent
 * right away); a longer delay is left to the later retries. Mutable so tests
 * can shorten it.
 */
export const resendRateLimitRetry = { defaultDelayMs: 1_000, maxDelayMs: 5_000 };

export function resendRetryAfterMs(headers: Record<string, string> | null | undefined): number | null {
  const header = headers?.["retry-after"];
  const seconds = header === undefined ? Number.NaN : Number(header);
  const delayMs = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : resendRateLimitRetry.defaultDelayMs;
  return delayMs <= resendRateLimitRetry.maxDelayMs && waitFitsDeadline(delayMs) ? delayMs : null;
}

/**
 * Wait for the send slot of the processing the current send runs in (see
 * runWithSendSlot): false, the slot left to the next send, when `mayStart`
 * says the send no longer starts.
 */
type WaitForSendSlot = (mayStart: () => boolean) => Promise<boolean>;
const sendSlotStorage = new AsyncLocalStorage<WaitForSendSlot>();

/**
 * Runs `run` with the send slot its new tries take (ABUS-03): the processing
 * that spaces its sends (the post-payment emails, appointmentFulfillment.ts)
 * takes a slot before a first send; a send made again after a pause (Resend's
 * retry-after, a short backoff) waits for `waitForSendSlot` as well, so it
 * does not leave right after a send of another processing of the instance.
 */
export function runWithSendSlot<T>(waitForSendSlot: WaitForSendSlot, run: () => Promise<T>): Promise<T> {
  return sendSlotStorage.run(waitForSendSlot, run);
}

/**
 * Pause before a new try of a send, then the send slot of the processing it
 * runs in, if any (runWithSendSlot). False when that slot comes after the end
 * allowed to the pause: the new try is given up, as a pause that would not
 * fit (deadlineCutShort), rather than leave after the answer, and the slot
 * goes to the next send without counting as one.
 */
export async function pauseBeforeNewTry(waitMs: number): Promise<boolean> {
  await pauseWithinDeadline(waitMs);
  const waitForSendSlot = sendSlotStorage.getStore();
  if (!waitForSendSlot) return true;
  return waitForSendSlot(startFitsDeadline);
}

/**
 * One Resend send, made once more after the retry-after delay when Resend
 * answers with its rate limit and that delay is short enough for a request.
 * A network error is thrown as before.
 */
export async function sendWithRateLimitRetry<T extends { error: ResendError | null; headers?: Record<string, string> | null }>(send: () => Promise<T>): Promise<T> {
  const response = await send();
  if (!response.error || resendDeliveryFailureCode(response.error) !== "rate_limited") return response;
  const retryAfterMs = resendRetryAfterMs(response.headers);
  if (retryAfterMs === null) return response;
  if (!(await pauseBeforeNewTry(retryAfterMs))) return response;
  return send();
}

/**
 * An exhausted quota stops every email at once, the admin sign-in code and the
 * payment emails included: it is logged as a high-severity security event,
 * which the daily security review reports by name. Any other error is left alone.
 */
export async function reportResendQuotaError(error: ResendError, emailKind: string) {
  if (typeof error.name !== "string" || !RESEND_QUOTA_ERRORS.has(error.name)) return;
  try {
    const { logSecurityEvent } = await import("../candidateSecurity");
    await logSecurityEvent({ actorKind: "system", category: "resend_quota_exceeded", outcome: "failed", severity: "high", metadata: { quota: error.name === "monthly_quota_exceeded" ? "monthly" : "daily", emailKind } });
  } catch (logError) {
    console.error("resend_quota_report_failed", logError instanceof Error ? logError.name : "UnknownError");
  }
}
