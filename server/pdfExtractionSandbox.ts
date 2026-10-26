import { existsSync } from "node:fs";
// Aliased: the Vercel bundle's banner already declares `createRequire` (package.json build).
import { createRequire as createModuleRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
 *
 * The text task also keeps only the text a reader sees (IA-01): each page
 * read is drawn at 72 dpi and every word of pdf.js's text layer must be at
 * least 4 pt high, not squashed, inside the page, and stand out from the
 * pixels where it sits. That one test covers white on white, tiny fonts,
 * invisible rendering mode, covered or clipped text, layers switched off,
 * opacity 0 and text off the page, while an OCR layer laid on a scan stays
 * readable. Drawing pages stops at `VISIBILITY_TIME_SHARE` of the time
 * allowed: the pages left unchecked then give no text and are listed in
 * `uncheckedPages`. The words of a font pdf.js could not load (not embedded
 * and not one of its standard fonts, or unreadable) would be drawn with the
 * host's fonts, if it has any: they are kept unchecked, in `uncheckedText`.
 */

export type PdfTextReading = {
  total: number | null;
  pages: Array<{ num: number; text: string }>;
  /** Absent when the text was read without the visibility check (in-process fallback). */
  visibility?: { invisibleText: string[]; uncheckedPages: number[]; uncheckedText: string[] };
};
export type PdfRendering = { total: number | null; pages: Array<{ pageNumber: number; dataUrl: string | null }> };
export type PdfReaderTask = { kind: "text"; first: number } | { kind: "render"; first: number; desiredWidth: number };

const VISIBILITY_TIME_SHARE = 0.6;

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
const MIN_FONT_SIZE_PT = 4;
// Average advance of a character below which text is squashed out of sight.
const MIN_ADVANCE_PT = 1;
const MIN_CONTRAST = 32;
const MAX_RENDER_PIXELS = 2000000;
// A word, or one ideograph: pdf.js merges runs of any colour into one item, so each word is checked.
const WORDS = /[\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af]|[^\\s\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af]+/g;

/** Largest difference of one colour channel inside the box whose corners are given, -1 when it lies off the page. */
function contrastIn(pixels, width, height, corners) {
  const xs = corners.map(corner => corner[0]);
  const ys = corners.map(corner => corner[1]);
  const x0 = Math.max(0, Math.round(Math.min(...xs)));
  const y0 = Math.max(0, Math.round(Math.min(...ys)));
  const x1 = Math.min(width, Math.max(x0 + 1, Math.round(Math.max(...xs))));
  const y1 = Math.min(height, Math.max(y0 + 1, Math.round(Math.max(...ys))));
  if (x0 >= width || y0 >= height || x1 <= 0 || y1 <= 0) return -1;
  const low = [255, 255, 255];
  const high = [0, 0, 0];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = pixels[offset + channel];
        if (value < low[channel]) low[channel] = value;
        if (value > high[channel]) high[channel] = value;
      }
    }
  }
  return Math.max(high[0] - low[0], high[1] - low[1], high[2] - low[2]);
}

/** The text content of a page without the words nobody sees on it, which go to \`invisibleText\`. */
async function visibleTextContent(page, content, canvasFactory, { invisibleText, uncheckedText }) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(1, Math.sqrt(MAX_RENDER_PIXELS / (base.width * base.height))) });
  const target = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  let pixels;
  let width;
  let height;
  try {
    await page.render({ canvasContext: target.context, viewport, canvas: target.canvas }).promise;
    ({ width, height } = target.canvas);
    pixels = target.context.getImageData(0, 0, width, height).data;
  } finally {
    canvasFactory.destroy(target);
  }
  const [a, b, c, d, e, f] = viewport.transform;
  const items = content.items.map(item => {
    if (typeof item.str !== "string" || !item.str.trim()) return item;
    const m = item.transform;
    // Position of the item on the render: the viewport transform applied to the text one.
    const t = [a * m[0] + c * m[1], b * m[0] + d * m[1], a * m[2] + c * m[3], b * m[2] + d * m[3], a * m[4] + c * m[5] + e, b * m[4] + d * m[5] + f];
    const along = Math.hypot(t[0], t[1]);
    const up = Math.hypot(t[2], t[3]);
    // The height of the item, and its width per character: a Type3 font keeps its scale in its own
    // matrix, which pdf.js applies to the height of the item but not to its horizontal scale.
    const readable = up / viewport.scale >= MIN_FONT_SIZE_PT && item.width / item.str.length >= MIN_ADVANCE_PT;
    const length = readable ? item.width * along / Math.hypot(m[0], m[1]) : 0;
    const point = (advance, rise) => [t[4] + t[0] / along * advance + t[2] / up * rise, t[5] + t[1] / along * advance + t[3] / up * rise];
    const font = item.fontName && page.commonObjs.has(item.fontName) ? page.commonObjs.get(item.fontName) : null;
    const unloaded = Boolean(font && font.missingFile);
    const hidden = [];
    const unchecked = [];
    const str = item.str.replace(WORDS, (word, index) => {
      if (readable && unloaded) {
        unchecked.push(word);
        return word;
      }
      // pdf.js gives no glyph positions: each word takes its share of the item, from the right in right-to-left text.
      let start = length * index / item.str.length;
      let end = length * (index + word.length) / item.str.length;
      if (item.dir === "rtl") [start, end] = [length - end, length - start];
      if (readable && contrastIn(pixels, width, height, [point(start, 0), point(end, 0), point(start, up * 0.8), point(end, up * 0.8)]) >= MIN_CONTRAST) return word;
      hidden.push(word);
      return "";
    });
    if (unchecked.length > 0) uncheckedText.push(unchecked.join(" "));
    if (hidden.length === 0) return item;
    invisibleText.push(hidden.join(" "));
    return { ...item, str };
  });
  return { ...content, items };
}

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
      // keeps the text laid out as before.
      const doc = await parser.load();
      const total = doc.numPages;
      const pages = [];
      const visibility = { invisibleText: [], uncheckedPages: [], uncheckedText: [] };
      for (let num = 1; num <= Math.min(total, task.first); num += 1) {
        const page = await doc.getPage(num);
        let content = await page.getTextContent();
        if (Date.now() - startedAt < task.visibilityBudgetMs) {
          content = await visibleTextContent(page, content, doc.canvasFactory, visibility);
        } else {
          visibility.uncheckedPages.push(num);
          content = { ...content, items: [] };
        }
        const text = await parser.getPageText({ getViewport: options => page.getViewport(options), getTextContent: async () => content }, {}, total);
        pages.push({ num, text });
        page.cleanup();
      }
      parentPort.postMessage({ type: "result", result: { total: Number.isInteger(total) ? total : null, pages, visibility } });
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
    const timeoutMs = task.kind === "text" ? limits.pdfTextTimeoutMs : limits.pdfRenderTimeoutMs;
    const workerTask = task.kind === "text" ? { ...task, visibilityBudgetMs: Math.floor(timeoutMs * VISIBILITY_TIME_SHARE) } : task;
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
