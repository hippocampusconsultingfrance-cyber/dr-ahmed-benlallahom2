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

type DeadlineContext = { deadlineAt: number; now: () => number };

const deadlineStorage = new AsyncLocalStorage<DeadlineContext>();

export function runWithProcessingDeadline<T>(deadlineAt: number, run: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  return deadlineStorage.run({ deadlineAt, now }, run);
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

/** Minimum durations of the CV analysis steps when time is short. */
export const CV_ANALYSIS_STEP_MINIMUM_MS = {
  pdfText: 3_000,
  pdfRender: 3_000,
  ocr: 8_000,
  analysis: 15_000,
} as const;
