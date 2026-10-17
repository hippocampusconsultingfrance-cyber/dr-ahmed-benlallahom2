import { beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications, cvProcessingJobs } from "../drizzle/schema";
import { DOCUMENT_DECOMPRESSION_LIMITS } from "./documentDecompressionLimits";
import { CV_ANALYSIS_STEP_MINIMUM_MS, ProcessingDeadlineError, runWithProcessingDeadline, stepTimeoutMs } from "./processingDeadline";
import { RECRUITMENT_PROCESSING_BUDGET } from "./recruitmentProcessingWorker";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown }, extractFailure: null as null | Error }));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./storage", () => ({
  storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`),
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://blob.test/${key}` })),
}));
vi.mock("./recruitmentAnalysis", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentAnalysis")>(),
  extractCvDocument: vi.fn(async () => { throw state.extractFailure; }),
}));

const { processDueCvAnalysisJobs } = await import("./recruitmentProcessing");

/** Runs the steps of a scanned-PDF analysis, each lasting its full timeout, on a fake clock. */
async function scannedCvAnalysisFrom(startMs: number) {
  let now = startMs;
  const steps: Array<[string, number]> = [];
  const take = (step: string, timeoutMs: number) => { steps.push([step, timeoutMs]); now += timeoutMs; };
  await runWithProcessingDeadline(RECRUITMENT_PROCESSING_BUDGET.analysisDeadlineMs, async () => {
    take("pdf_text", stepTimeoutMs("pdf_text", DOCUMENT_DECOMPRESSION_LIMITS.pdfTextTimeoutMs, { reserveMs: CV_ANALYSIS_STEP_MINIMUM_MS.analysis, minimumMs: CV_ANALYSIS_STEP_MINIMUM_MS.pdfText }));
    take("pdf_render", stepTimeoutMs("pdf_render", DOCUMENT_DECOMPRESSION_LIMITS.pdfRenderTimeoutMs, { reserveMs: CV_ANALYSIS_STEP_MINIMUM_MS.ocr + CV_ANALYSIS_STEP_MINIMUM_MS.analysis, minimumMs: CV_ANALYSIS_STEP_MINIMUM_MS.pdfRender }));
    take("ocr", stepTimeoutMs("ocr", 20_000, { reserveMs: CV_ANALYSIS_STEP_MINIMUM_MS.analysis, minimumMs: CV_ANALYSIS_STEP_MINIMUM_MS.ocr }));
    take("analysis", stepTimeoutMs("analysis", 35_000, { minimumMs: CV_ANALYSIS_STEP_MINIMUM_MS.analysis }));
  }, () => now);
  return { endsAt: now, steps };
}

describe("budget de temps d’une analyse de CV dans le cron (60 s Vercel)", () => {
  it("hors cron, chaque étape garde son propre délai", () => {
    expect(stepTimeoutMs("analysis", 35_000, { minimumMs: 15_000 })).toBe(35_000);
  });

  it("un CV scanné commencé en début de passage se termine avant la limite, même au pire cas de chaque étape", async () => {
    const run = await scannedCvAnalysisFrom(2_000);
    expect(run.endsAt).toBeLessThanOrEqual(RECRUITMENT_PROCESSING_BUDGET.analysisDeadlineMs);
    expect(RECRUITMENT_PROCESSING_BUDGET.analysisDeadlineMs).toBeLessThanOrEqual(55_000);
    expect(run.steps.find(([step]) => step === "analysis")![1]).toBeGreaterThanOrEqual(CV_ANALYSIS_STEP_MINIMUM_MS.analysis);
  });

  it("un CV scanné commencé à la dernière seconde permise est rendu à la file au lieu d’être coupé par la plateforme", async () => {
    await expect(scannedCvAnalysisFrom(RECRUITMENT_PROCESSING_BUDGET.analysisStartDeadlineMs - 1)).rejects.toBeInstanceOf(ProcessingDeadlineError);
    // A text PDF started at the same moment still fits: its AI call gets what remains.
    let now = RECRUITMENT_PROCESSING_BUDGET.analysisStartDeadlineMs - 1;
    await runWithProcessingDeadline(RECRUITMENT_PROCESSING_BUDGET.analysisDeadlineMs, async () => {
      now += stepTimeoutMs("pdf_text", DOCUMENT_DECOMPRESSION_LIMITS.pdfTextTimeoutMs, { reserveMs: CV_ANALYSIS_STEP_MINIMUM_MS.analysis, minimumMs: CV_ANALYSIS_STEP_MINIMUM_MS.pdfText });
      now += stepTimeoutMs("analysis", 35_000, { minimumMs: CV_ANALYSIS_STEP_MINIMUM_MS.analysis });
    }, () => now);
    expect(now).toBeLessThanOrEqual(RECRUITMENT_PROCESSING_BUDGET.analysisDeadlineMs);
  });
});

describe("job rendu à la file à l’approche de la limite", () => {
  let memory: MemoryPg;
  const scheduledFor = new Date(Date.now() - 60 * 60_000);

  beforeEach(() => {
    memory = createMemoryPg([cvApplications, cvProcessingJobs]);
    state.memory = memory;
    const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n"), Buffer.alloc(400, 65)]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(pdf)));
    const [application] = memory.seed(cvApplications, [{
      tracking_id: "CVDEADLINE0000001", first_name: "Ana", last_name: "Test", email: "ana@test.local", specialty: "Anesthésie", target_countries: "[]",
      cv_file_key: "recruitment/quarantine/CVDEADLINE0000001-cv.pdf", cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: pdf.length,
    }]);
    memory.seed(cvProcessingJobs, [{ application_id: application!.id, job_status: "queued", attempts: 0, max_attempts: 3, scheduled_for: scheduledFor }]);
  });

  it("ne compte pas la tentative et garde sa place quand le temps manque ; une vraie panne compte", async () => {
    state.extractFailure = new ProcessingDeadlineError("ocr");
    const released = await processDueCvAnalysisJobs(1);
    expect(released.results[0]).toMatchObject({ completed: false, retry: true, deadlineReached: true });
    const [job] = memory.rows(cvProcessingJobs);
    expect(job).toMatchObject({ job_status: "retry", attempts: 0, started_at: null, finished_at: null });
    expect(new Date(`${job!.scheduled_for}Z`).getTime()).toBe(scheduledFor.getTime());
    expect(memory.rows(cvApplications)[0]).toMatchObject({ analysis_status: "queued" });

    state.extractFailure = new Error("ocr_provider_down");
    const failed = await processDueCvAnalysisJobs(1);
    expect(failed.results[0]).toMatchObject({ completed: false, retry: true });
    expect(failed.results[0]).not.toHaveProperty("deadlineReached");
    expect(memory.rows(cvProcessingJobs)[0]).toMatchObject({ job_status: "retry", attempts: 1 });
  });
});
