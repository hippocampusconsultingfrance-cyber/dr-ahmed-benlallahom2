// Aliased: the Vercel bundle's banner already declares `createRequire` (package.json build).
import { createRequire as createModuleRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { DOCUMENT_DECOMPRESSION_LIMITS, type DocumentDecompressionLimits } from "./documentDecompressionLimits";

/**
 * Isolated PDF reader. pdf.js decodes every stream of a PDF (content, fonts,
 * object streams, images, colour profiles…) with whatever filter chain the
 * file declares; a few hundred kilobytes can expand into gigabytes. The
 * static check at upload cannot model all of pdf.js, so the reading itself
 * runs in a worker thread under hard bounds:
 * - JavaScript heap of the worker (`pdfReaderMaxHeapMb`);
 * - growth of the process memory while it runs, decoded buffers included
 *   (`pdfReaderMaxMemoryGrowthBytes`), checked every 25 ms;
 * - time (`pdfTextTimeoutMs`, `pdfRenderTimeoutMs`).
 * Exceeding a bound terminates the worker and fails with a final
 * `cv_validation_*` error, so the job is not retried on the same file.
 */

export type PdfTextReading = { total: number | null; pages: Array<{ num: number; text: string }> };
export type PdfRendering = { total: number | null; pages: Array<{ pageNumber: number; dataUrl: string | null }> };
export type PdfReaderTask = { kind: "text"; first: number } | { kind: "render"; first: number; desiredWidth: number };

/**
 * pdf.js could not be loaded in a worker (deployment or runtime issue, never
 * the file itself): the caller may fall back to reading in process.
 */
export class PdfReaderUnavailableError extends Error {
  constructor(detail: string) {
    super(`pdf_reader_unavailable:${detail}`);
  }
}

const MEMORY_CHECK_INTERVAL_MS = 25;

const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  let parser = null;
  try {
    let PDFParse;
    let CanvasFactory;
    try {
      const canvas = await import(workerData.canvasModuleUrl);
      CanvasFactory = canvas.CanvasFactory ?? canvas.default?.CanvasFactory;
      const pdf = await import(workerData.pdfModuleUrl);
      PDFParse = pdf.PDFParse ?? pdf.default?.PDFParse;
      if (typeof PDFParse !== "function") throw new Error("PDFParse export missing");
    } catch (error) {
      parentPort.postMessage({ type: "unavailable", detail: String((error && (error.code || error.name)) || "load_failed") });
      return;
    }
    parentPort.postMessage({ type: "ready" });
    parser = new PDFParse({ data: workerData.data, CanvasFactory, maxImageSize: workerData.maxImagePixels, isEvalSupported: false });
    const task = workerData.task;
    if (task.kind === "text") {
      const result = await parser.getText({ first: task.first });
      parentPort.postMessage({ type: "result", result: { total: Number.isInteger(result.total) ? result.total : null, pages: result.pages.map(page => ({ num: page.num, text: page.text })) } });
    } else {
      const result = await parser.getScreenshot({ first: task.first, desiredWidth: task.desiredWidth, imageDataUrl: true, imageBuffer: false });
      parentPort.postMessage({ type: "result", result: { total: Number.isInteger(result.total) ? result.total : null, pages: result.pages.map(page => ({ pageNumber: page.pageNumber, dataUrl: page.dataUrl || null })) } });
    }
  } catch (error) {
    parentPort.postMessage({ type: "error", name: String((error && error.name) || "Error"), message: String((error && error.message) || "pdf_read_failed").slice(0, 500) });
  } finally {
    try { if (parser) await parser.destroy(); } catch {}
  }
})();
`;

/** URL of the module that `import(specifier)` loads from this file (the one bundled deployments trace). */
function moduleUrl(specifier: string) {
  const resolve = (import.meta as { resolve?: (value: string) => string }).resolve;
  if (typeof resolve === "function") {
    try {
      return resolve(specifier);
    } catch {
      // Fall back to the CommonJS resolution below.
    }
  }
  return pathToFileURL(createModuleRequire(import.meta.url).resolve(specifier)).href;
}

type WorkerMessage =
  | { type: "ready" }
  | { type: "unavailable"; detail: string }
  | { type: "result"; result: PdfTextReading | PdfRendering }
  | { type: "error"; name: string; message: string };

export function readPdfIsolated(buffer: Buffer, task: { kind: "text"; first: number }, limits?: DocumentDecompressionLimits): Promise<PdfTextReading>;
export function readPdfIsolated(buffer: Buffer, task: { kind: "render"; first: number; desiredWidth: number }, limits?: DocumentDecompressionLimits): Promise<PdfRendering>;
export function readPdfIsolated(buffer: Buffer, task: PdfReaderTask, limits: DocumentDecompressionLimits = DOCUMENT_DECOMPRESSION_LIMITS): Promise<PdfTextReading | PdfRendering> {
  return new Promise((resolve, reject) => {
    let modules: { pdfModuleUrl: string; canvasModuleUrl: string };
    try {
      modules = { pdfModuleUrl: moduleUrl("pdf-parse"), canvasModuleUrl: moduleUrl("pdf-parse/worker") };
    } catch (error) {
      reject(new PdfReaderUnavailableError(error instanceof Error ? error.name : "resolve_failed"));
      return;
    }
    const baselineRss = process.memoryUsage.rss();
    let worker: Worker;
    try {
      worker = new Worker(WORKER_SOURCE, {
        eval: true,
        execArgv: [],
        workerData: { ...modules, task, maxImagePixels: limits.pdfMaxImagePixels, data: new Uint8Array(buffer) },
        resourceLimits: { maxOldGenerationSizeMb: limits.pdfReaderMaxHeapMb },
      });
    } catch (error) {
      reject(new PdfReaderUnavailableError(error instanceof Error ? error.name : "spawn_failed"));
      return;
    }
    let ready = false;
    let settled = false;
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(memoryWatch);
      clearTimeout(deadline);
      void worker.terminate().catch(() => undefined);
      outcome();
    };
    // Errors caused by the file only count once pdf.js has started reading it.
    const fileFailure = (code: string, transient: string) => new Error(ready ? code : transient);
    const memoryWatch = setInterval(() => {
      if (process.memoryUsage.rss() - baselineRss > limits.pdfReaderMaxMemoryGrowthBytes) {
        settle(() => reject(fileFailure("cv_validation_pdf_decompressed_size_exceeded", "pdf_reader_memory_pressure")));
      }
    }, MEMORY_CHECK_INTERVAL_MS);
    const deadline = setTimeout(() => {
      settle(() => reject(fileFailure("cv_validation_pdf_processing_timeout", "pdf_reader_start_timeout")));
    }, task.kind === "text" ? limits.pdfTextTimeoutMs : limits.pdfRenderTimeoutMs);
    worker.on("message", (message: WorkerMessage) => {
      if (message.type === "ready") {
        ready = true;
      } else if (message.type === "unavailable") {
        settle(() => reject(new PdfReaderUnavailableError(message.detail)));
      } else if (message.type === "result") {
        settle(() => resolve(message.result));
      } else {
        settle(() => reject(Object.assign(new Error(message.message), { name: message.name })));
      }
    });
    worker.on("error", error => {
      const outOfMemory = (error as NodeJS.ErrnoException).code === "ERR_WORKER_OUT_OF_MEMORY";
      settle(() => reject(outOfMemory ? fileFailure("cv_validation_pdf_decompressed_size_exceeded", "pdf_reader_out_of_memory") : new Error(`pdf_reader_failed:${error.name}`)));
    });
    worker.on("exit", code => {
      settle(() => reject(new Error(`pdf_reader_exited:${code}`)));
    });
  });
}
