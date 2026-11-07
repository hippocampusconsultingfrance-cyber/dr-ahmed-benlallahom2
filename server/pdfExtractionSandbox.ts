import { existsSync } from "node:fs";
// Aliased: the Vercel bundle's banner already declares `createRequire` (package.json build).
import { createRequire as createModuleRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { DOCUMENT_DECOMPRESSION_LIMITS, type DocumentDecompressionLimits } from "./documentDecompressionLimits";
import { visibleTextContent, type PdfVisibilityFindings } from "./pdfVisibleText";

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
 *
 * The text task also keeps only the text a reader sees (IA-01): each page
 * with text is drawn at 72 dpi at most, and ink is attributed to each text
 * operation (pdfVisibleText), then to each word. Text at least 4 pt high,
 * not squashed, with ink of its own is kept; text without ink is hidden
 * (`invisibleText`), or unverifiable (`unverifiableText`, never counted as
 * hidden) when a picture under it may show it, as an OCR layer on a scan,
 * when it is left with too little ink to be read, when its font cannot be
 * drawn, or when it was not checked in time. Both are left out of the text.
 * The render task draws the first pages, or those it is given.
 * Drawing pages stops once `pdfVisibilityWorkUnits` of drawing work are
 * spent (counted, so that a file always gives the same text: see
 * pdfVisibleText), or at `VISIBILITY_TIME_SHARE` of the time allowed on a
 * host far slower than planned: the pages not wholly checked are listed in
 * `uncheckedPages`.
 */

export type PdfTextReading = {
  total: number | null;
  pages: Array<{ num: number; text: string }>;
  /** Absent when the text was read without the visibility check (in-process fallback). */
  visibility?: { invisibleText: string[]; uncheckedPages: number[]; unverifiableText: PdfVisibilityFindings["unverifiableText"] };
};
export type PdfRendering = { total: number | null; pages: Array<{ pageNumber: number; dataUrl: string | null }> };
/** `pages`, when given, renders those pages instead of the first ones. */
export type PdfReaderTask = { kind: "text"; first: number } | { kind: "render"; first: number; desiredWidth: number; pages?: number[] };

const VISIBILITY_TIME_SHARE = 0.6;

/**
 * IA-04: a page's text items with each wide gap between two texts of one
 * line read as a line break. pdf.js writes such a gap as one whitespace item
 * as wide as the gap, which joins with a space the cells of a table row, or
 * two columns side by side (« Spécialité : anesthésie-réanimation » and
 * « Médecin anesthésiste-réanimateur »), where mammoth puts each cell of a
 * DOCX on its own line: the same CV then has the same lines, and the same
 * places of evidence, in PDF and in DOCX. A gap is wide from one em (the
 * height of its line's text) when it is twice as wide as any other gap of
 * its line, or from two and a half: the even gaps of a justified line stay
 * spaces. Only whitespace becomes a line break, no text is added or removed.
 * Self-contained: the isolated reader runs it as its source.
 */
export function textCellsAsLines<Content extends { items: readonly unknown[] }>(content: Content): Content {
  const CELL_GAP_EM = 1;
  const LONE_CELL_GAP_EM = 2.5;
  const OTHER_GAPS_FACTOR = 2;
  type Item = { str?: unknown; width?: unknown; height?: unknown; hasEOL?: unknown };
  const items = content.items as readonly Item[];
  const text = (item: Item) => typeof item.str === "string" && item.str.trim() !== "";
  const gap = (item: Item) => typeof item.str === "string" && item.str !== "" && item.str.trim() === "" && !item.hasEOL && typeof item.width === "number" && item.width > 0;
  const breaks = new Set<number>();
  let start = 0;
  for (let index = 0; index <= items.length; index += 1) {
    if (index < items.length && !items[index]!.hasEOL) continue;
    const line = Array.from({ length: index - start }, (_, offset) => start + offset);
    const em = Math.max(0, ...line.filter(at => text(items[at]!)).map(at => Number(items[at]!.height) || 0));
    const gaps = line.filter(at => gap(items[at]!));
    for (const at of gaps) {
      const width = items[at]!.width as number;
      const others = Math.max(0, ...gaps.filter(other => other !== at).map(other => items[other]!.width as number));
      const between = line.some(other => other < at && text(items[other]!)) && line.some(other => other > at && text(items[other]!));
      if (em > 0 && between && width >= CELL_GAP_EM * em && (width >= OTHER_GAPS_FACTOR * others || width >= LONE_CELL_GAP_EM * em)) breaks.add(at);
    }
    start = index + 1;
  }
  if (breaks.size === 0) return content;
  return { ...content, items: items.map((item, index) => (breaks.has(index) ? { ...item, str: "\n" } : item)) };
}

let standardFontDirectory: string | null | undefined;

/**
 * pdf.js's standard fonts (server/fonts/pdfjs, copied from pdfjs-dist), for
 * the PDFs that do not embed Helvetica, Times or Courier (PDFKit, FPDF,
 * ReportLab…). Without them pdf.js draws that text with the host's fonts,
 * and a Vercel function has none: the page would come out blank. Looked for
 * next to this file (tsx, vitest), then under the project root (esbuild
 * bundles, included by vercel.json), as the invoice fonts are.
 */
export function pdfStandardFontDataUrl() {
  if (standardFontDirectory === undefined) {
    standardFontDirectory = [fileURLToPath(new URL("./fonts/pdfjs/", import.meta.url)), path.resolve(process.cwd(), "server", "fonts", "pdfjs")]
      // pdf.js wants the trailing slash.
      .map(directory => `${directory.replace(/[\\/]+$/, "")}/`)
      .find(directory => existsSync(`${directory}LiberationSans-Regular.ttf`)) ?? null;
    if (!standardFontDirectory) console.error("[PdfReader] pdf.js standard fonts not found: text in a font that is not embedded stays unchecked");
  }
  return standardFontDirectory ?? undefined;
}

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
const startedAt = Date.now();
// The visibility check, as this module was compiled; esbuild's keepNames (tsx) wraps functions in __name.
const __name = target => target;
const visibleTextContent = ${visibleTextContent.toString()};
const textCellsAsLines = ${textCellsAsLines.toString()};

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
    parser = new PDFParse({ data: workerData.data, CanvasFactory, maxImageSize: workerData.maxImagePixels, isEvalSupported: false, standardFontDataUrl: workerData.standardFontDataUrl });
    const task = workerData.task;
    if (task.kind === "text") {
      // What parser.getText({ first }) does, page by page, with the visible text content only: its
      // own page text assembly (getPageText; it and load are private in pdf-parse's typings)
      // keeps the text laid out as before, a wide gap within a line read as a line break.
      const doc = await parser.load();
      const total = doc.numPages;
      const pages = [];
      const visibility = { invisibleText: [], uncheckedPages: [], unverifiableText: [] };
      const deadline = startedAt + task.visibilityBudgetMs;
      const budget = { units: task.visibilityUnits };
      for (let num = 1; num <= Math.min(total, task.first); num += 1) {
        const page = await doc.getPage(num);
        let content = await page.getTextContent();
        // Only pages with text are drawn; past the work budget, a page's text is set aside unchecked.
        const layer = content.items.map(item => typeof item.str === "string" ? item.str : "").join(" ").replace(/\\s+/g, " ").trim();
        if (layer && budget.units > 0 && Date.now() < deadline) {
          const checked = await visibleTextContent(page, content, doc.canvasFactory, visibility, { pageNumber: num, deadline, budget });
          content = checked.content;
          if (!checked.complete) visibility.uncheckedPages.push(num);
        } else if (layer) {
          visibility.uncheckedPages.push(num);
          visibility.unverifiableText.push({ page: num, reason: "unfinished", text: layer });
          content = { ...content, items: [] };
        }
        content = textCellsAsLines(content);
        const text = await parser.getPageText({ getViewport: options => page.getViewport(options), getTextContent: async () => content }, {}, total);
        pages.push({ num, text });
        page.cleanup();
      }
      parentPort.postMessage({ type: "result", result: { total: Number.isInteger(total) ? total : null, pages, visibility } });
    } else {
      const result = await parser.getScreenshot({ ...(task.pages ? { partial: task.pages } : { first: task.first }), desiredWidth: task.desiredWidth, imageDataUrl: true, imageBuffer: false });
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
export function readPdfIsolated(buffer: Buffer, task: { kind: "render"; first: number; desiredWidth: number; pages?: number[] }, limits?: DocumentDecompressionLimits): Promise<PdfRendering>;
export function readPdfIsolated(buffer: Buffer, task: PdfReaderTask, limits: DocumentDecompressionLimits = DOCUMENT_DECOMPRESSION_LIMITS): Promise<PdfTextReading | PdfRendering> {
  return new Promise((resolve, reject) => {
    let modules: { pdfModuleUrl: string; canvasModuleUrl: string };
    try {
      modules = { pdfModuleUrl: moduleUrl("pdf-parse"), canvasModuleUrl: moduleUrl("pdf-parse/worker") };
    } catch (error) {
      reject(new PdfReaderUnavailableError(error instanceof Error ? error.name : "resolve_failed"));
      return;
    }
    const timeoutMs = task.kind === "text" ? limits.pdfTextTimeoutMs : limits.pdfRenderTimeoutMs;
    const workerTask = task.kind === "text" ? { ...task, visibilityBudgetMs: Math.floor(timeoutMs * VISIBILITY_TIME_SHARE), visibilityUnits: limits.pdfVisibilityWorkUnits } : task;
    const baselineRss = process.memoryUsage.rss();
    let worker: Worker;
    try {
      worker = new Worker(WORKER_SOURCE, {
        eval: true,
        execArgv: [],
        workerData: { ...modules, task: workerTask, maxImagePixels: limits.pdfMaxImagePixels, standardFontDataUrl: pdfStandardFontDataUrl(), data: new Uint8Array(buffer) },
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
    }, timeoutMs);
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
