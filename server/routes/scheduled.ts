import type { Express, Response } from "express";
import { requireVercelCron } from "../_core/cronAuth";
import { runMonitoredScheduledJob } from "../_core/scheduledJobMonitor";
import { internalErrorReference, internalErrorSummary } from "../_core/trpc";
import { postgresErrorCode } from "../languageColumns";
import { getStripeClient } from "../routers";
import { safeErrorName } from "./routeHelpers";

/**
 * Failed scheduled job: the caller gets a generic error and a short reference,
 * never the error message (Drizzle puts the whole SQL and its parameters in
 * it). The server log keeps the detail under that reference, without the
 * query parameters, like tRPC internal errors, and the SQLSTATE if any.
 */
function sendScheduledJobFailure(res: Response, logPrefix: string, error: unknown) {
  const reference = internalErrorReference();
  console.error(`${logPrefix} ref=${reference}`, internalErrorSummary(error), postgresErrorCode(error) ?? "");
  return res.status(500).json({ error: "scheduled_job_failed", reference, timestamp: new Date().toISOString() });
}

type ScheduledJobResult = { httpStatus?: number } & Record<string, unknown>;

/**
 * Scheduled jobs: GET only, called once a day by Vercel Cron (see vercel.json
 * "crons") with `Authorization: Bearer ${CRON_SECRET}`, checked in constant
 * time by requireVercelCron. Each run, once authenticated, pings its external
 * monitor (EXPL-03, see scheduledJobMonitor.ts): the URL on success, the
 * URL + /fail on failure.
 */
export function registerScheduledJobRoutes(app: Express) {
  function registerScheduledJob(path: string, label: string, run: () => Promise<ScheduledJobResult>) {
    app.get(path, requireVercelCron, async (_req, res) => {
      try {
        const { httpStatus, ...result } = await runMonitoredScheduledJob(path, run);
        if (httpStatus) return res.status(httpStatus).json(result);
        return res.json({ ok: true, scheduler: "vercel-cron", ...result });
      } catch (error) {
        return sendScheduledJobFailure(res, `[${label}] Vercel cron error`, error);
      }
    });
  }

  // Appointment reminder: a 1–30 h window so no appointment falls between two daily runs.
  registerScheduledJob("/api/scheduled/reminder", "Reminder", async () => {
    const { DAILY_REMINDER_WINDOW, sendDueAppointmentReminders } = await import("../scheduledJobs");
    return sendDueAppointmentReminders(DAILY_REMINDER_WINDOW);
  });

  // Retention: erases expired recruitment dossiers and vault documents (a
  // bounded batch per run, same routine as a GDPR erasure) and reports to the owner.
  registerScheduledJob("/api/scheduled/recruitment-retention", "RecruitmentRetention", async () => {
    const { runRecruitmentRetentionCleanup } = await import("../recruitmentRetention");
    const retention = await runRecruitmentRetentionCleanup("vercel-cron");
    // DATA-02: CVs stored by an application whose row was never written.
    const { removeOrphanApplicationCvFiles } = await import("../recruitmentOrphanCvCleanup");
    const orphanCvFiles = await removeOrphanApplicationCvFiles().catch(error => {
      console.error("[RecruitmentRetention] Orphan CV cleanup failed:", safeErrorName(error));
      return null;
    });
    return { ...retention, orphanCvFiles };
  });

  // CV processing worker. Its analyses may run until 55 s
  // (RECRUITMENT_PROCESSING_BUDGET): a shorter monitor ping leaves more of the
  // 60 s function limit to the work (EXPL-03).
  const recruitmentProcessingMonitor = { timeoutMs: 1_500 };
  app.get("/api/scheduled/recruitment-processing", requireVercelCron, async (_req, res) => {
    try {
      // Drains every queue within a time budget: confirmation-email retries and
      // Drive copies first, then CV analyses (none started after ~25 s).
      const { runRecruitmentProcessingWorker } = await import("../recruitmentProcessingWorker");
      const summary = await runMonitoredScheduledJob("/api/scheduled/recruitment-processing", () => runRecruitmentProcessingWorker(), recruitmentProcessingMonitor);
      console.info("[RecruitmentProcessing] Vercel cron summary", {
        elapsedMs: summary.elapsedMs,
        analysisRecovery: summary.analysisRecovery,
        driveRecovery: summary.driveRecovery,
        driveErasures: summary.driveErasures,
        confirmationEmailsProcessed: summary.confirmationEmails.processed,
        driveExportsProcessed: summary.driveExports.processed,
        analysisProcessed: summary.analysis.processed,
        analysesWaiting: summary.analysesWaiting,
      });
      return res.json({ ok: true, scheduler: "vercel-cron", ...summary });
    } catch (error) {
      return sendScheduledJobFailure(res, "[RecruitmentProcessing] Vercel cron error", error);
    }
  });

  // Post-payment confirmation + invoice. The Stripe webhook already sends them
  // immediately; this job recovers interrupted workers and retries failures.
  registerScheduledJob("/api/scheduled/appointment-fulfillment", "AppointmentFulfillment", async () => {
    const { runAppointmentFulfillmentWorker } = await import("../scheduledJobs");
    return runAppointmentFulfillmentWorker({ batchSize: 5, maxBatches: 4, budgetMs: 35_000 });
  });

  // An expired hold that has a Checkout session is released only after Stripe
  // confirms it was not paid; a paid one is confirmed (webhook missing).
  registerScheduledJob("/api/scheduled/appointment-hold-cleanup", "AppointmentHoldCleanup", async () => {
    const { releaseExpiredAppointmentHolds } = await import("../appointmentHolds");
    return releaseExpiredAppointmentHolds(getStripeClient);
  });

  registerScheduledJob("/api/scheduled/candidate-document-processing", "CandidateDocumentProcessing", async () => {
    // One document at a time, and no new analysis after ~20 s, to stay well
    // inside the 60 s function limit while still draining a daily backlog.
    const { runCandidateDocumentProcessingWorker } = await import("../scheduledJobs");
    return runCandidateDocumentProcessingWorker({ batchSize: 1, maxBatches: 6, budgetMs: 20_000 });
  });

  // Daily security review, then the retention periods of the privacy policy
  // for patient, contact and technical data (RGPD-09: no extra cron on the
  // Hobby plan), within a time budget; the rest waits for the next day.
  registerScheduledJob("/api/scheduled/security-posture", "SecurityPosture", async () => {
    const { runSecurityPostureReview } = await import("../scheduledJobs");
    const review = await runSecurityPostureReview();
    if (!review.available) return { httpStatus: 503, error: "security_database_unavailable" };
    const { runPersonalDataRetention } = await import("../personalDataRetention");
    const retention = await runPersonalDataRetention();
    return { highSeverityEvents24h: review.highSeverityEvents24h, retention };
  });
}
