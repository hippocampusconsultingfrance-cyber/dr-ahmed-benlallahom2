import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Invocation deadline of a scheduled job (Vercel function limit). The cron
 * runs each CV analysis inside `runWithProcessingDeadline`; every slow step
 * (isolated PDF reading, OCR, AI analysis) asks `stepTimeoutMs` for its
 * timeout: its own limit, shortened to the time left minus what the later
 * steps need. A step that cannot get its minimum throws
 * ProcessingDeadlineError: the job is released for the next run without
 * counting an attempt, instead of being killed by the platform mid-way.
 * Outside a deadline (admin action, other crons) every step keeps its own
 * timeout.
 */
export class ProcessingDeadlineError extends Error {
  constructor(step: string) {
    super(`processing_deadline_reached:${step}`);
    this.name = "ProcessingDeadlineError";
  }
}

export function isProcessingDeadlineError(error: unknown) {
  return error instanceof ProcessingDeadlineError || (error instanceof Error && error.message.startsWith("processing_deadline_reached:"));
}

type DeadlineContext = {
  deadlineAt: number;
  now: () => number;
  /** End allowed to the first pause only (see waitFitsDeadline). */
  firstPauseDeadlineAt: number;
  paused: boolean;
  pauseRefused: boolean;
};

const deadlineStorage = new AsyncLocalStorage<DeadlineContext>();

export function runWithProcessingDeadline<T>(
  deadlineAt: number,
  run: () => Promise<T>,
  now: () => number = Date.now,
  options: { firstPauseDeadlineAt?: number } = {},
): Promise<T> {
  const firstPauseDeadlineAt = Math.max(deadlineAt, options.firstPauseDeadlineAt ?? deadlineAt);
  return deadlineStorage.run({ deadlineAt, now, firstPauseDeadlineAt, paused: false, pauseRefused: false }, run);
}

/**
 * Time steps may still use before the invocation deadline: `reserveMs` is kept
 * for the steps that follow. Throws ProcessingDeadlineError when less than
 * `minimumMs` would remain.
 */
export function stepTimeoutMs(step: string, ownTimeoutMs: number, options: { reserveMs?: number; minimumMs: number }): number {
  const context = deadlineStorage.getStore();
  if (!context) return ownTimeoutMs;
  const available = context.deadlineAt - context.now() - (options.reserveMs ?? 0);
  if (available < options.minimumMs) throw new ProcessingDeadlineError(step);
  return Math.min(ownTimeoutMs, available);
}

/**
 * Whether a pause (a provider's retry-after, a short backoff) still ends before
 * the deadline; always true outside one. The first pause may end as late as
 * `firstPauseDeadlineAt`, the later ones only before the deadline itself: the
 * emails sent right after a payment (appointmentFulfillment.ts) still get
 * their new try after a passing rate limit, but no longer wait through a
 * lasting one. A refused pause is recorded (deadlineCutShort).
 */
export function waitFitsDeadline(waitMs: number): boolean {
  const context = deadlineStorage.getStore();
  if (!context) return true;
  const fits = context.now() + waitMs <= (context.paused ? context.deadlineAt : context.firstPauseDeadlineAt);
  if (!fits) context.pauseRefused = true;
  return fits;
}

/** Takes a pause that waitFitsDeadline allowed; the next ones keep to the deadline itself. */
export function pauseWithinDeadline(waitMs: number): Promise<void> {
  const context = deadlineStorage.getStore();
  if (context) context.paused = true;
  return new Promise(resolve => setTimeout(resolve, waitMs));
}

/**
 * Whether this processing gave up a pause for its deadline: its work stopped
 * short of its own retries because time ran out, not because it failed.
 */
export function deadlineCutShort(): boolean {
  return deadlineStorage.getStore()?.pauseRefused === true;
}

/** Minimum durations of the CV analysis steps when time is short. */
export const CV_ANALYSIS_STEP_MINIMUM_MS = {
  pdfText: 3_000,
  pdfRender: 3_000,
  ocr: 8_000,
  analysis: 15_000,
} as const;
