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

/**
 * IA-04: the pages' text items with each piece of a line of text read as one
 * line, whatever the order its pieces are drawn in, and the rows of a header
 * or a footer at the edge of their page. A row is the horizontal text of one
 * baseline; it falls into segments at each wide gap (cells of a table row,
 * columns side by side), as textCellsAsLines reads them: from one em, twice
 * as wide as any other gap of the row or from two and a half em, a whitespace
 * item counting as wide as itself. A segment whose pieces are drawn between
 * those of other rows, or apart by an end of line (a line written once or on
 * each page, drawn piece by piece between the body's lines), is brought back
 * together where its first piece is drawn, in its order along the row (right
 * to left when it holds Arabic or Hebrew): it is one line, as when it is drawn
 * at once. A row of the same text at the same height on two pages or more,
 * above all other text of its page or under it (a header, a footer), is put at
 * the start or the end of its page, top row first: the lines repeated at the
 * edges of the pages are those normalizedSourcePassages counts as one place; a
 * page of such rows only is left as it is, and a row of the body stays where
 * it is. Only the order of the items changes: a space is put between two
 * pieces apart on the row, as pdf.js writes it between two pieces drawn one
 * after the other, an end of line before and after a moved line, and an empty
 * end of line that would follow another is dropped. In O(n log n) of the
 * items: sorted by height then swept, a sorted list of the heights each text
 * is found at. Self-contained: the isolated reader runs it as its source.
 */
export function rowsTogether<Content extends { items: readonly unknown[] }>(contents: readonly Content[]): Content[] {
  const SPACE_EM = 0.15;
  const CELL_GAP_EM = 1;
  const LONE_CELL_GAP_EM = 2.5;
  const OTHER_GAPS_FACTOR = 2;
  const RIGHT_TO_LEFT = new RegExp("[\\p{Script=Arabic}\\p{Script=Hebrew}]", "u");
  type Item = { str?: unknown; width?: unknown; height?: unknown; hasEOL?: unknown; transform?: unknown };
  type Member = { item: Item; index: number; x: number; y: number };
  type Row = { y: number; height: number; key: string; members: Member[]; segments: Member[][] };
  const textOf = (item: Item) => (typeof item.str === "string" ? item.str : "");
  const written = (item: Item) => textOf(item).trim() !== "";
  const widthOf = (item: Item) => Number(item.width) || 0;
  const heightOf = (item: Item) => Number(item.height) || 0;
  const endsLine = (item: Item) => item.hasEOL === true || textOf(item).endsWith("\n");
  const position = (item: Item) => {
    const matrix = item.transform;
    if (!Array.isArray(matrix) || matrix.length < 6 || matrix[1] !== 0 || matrix[2] !== 0) return null;
    const [x, y] = [matrix[4], matrix[5]];
    return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };
  /** A row's pieces between its wide gaps, each without the whitespace at its ends. */
  const segmentsOf = (members: Member[], em: number) => {
    const gaps: Array<{ after: number; width: number }> = [];
    let end = -Infinity;
    let blank = 0;
    members.forEach((member, index) => {
      if (!written(member.item)) {
        blank = Math.max(blank, widthOf(member.item));
        return;
      }
      if (end > -Infinity) gaps.push({ after: index, width: Math.max(member.x - end, blank) });
      end = Math.max(end, member.x + widthOf(member.item));
      blank = 0;
    });
    // The widest gap of the row and the next: any other gap of a gap is the widest, or the next for the widest itself.
    let widest = 0;
    let widestCount = 0;
    let next = 0;
    for (const gap of gaps) {
      if (gap.width > widest) [next, widest, widestCount] = [widest, gap.width, 1];
      else if (gap.width === widest) widestCount += 1;
      else if (gap.width > next) next = gap.width;
    }
    const wide = new Set<number>();
    for (const gap of gaps) {
      const others = gap.width === widest && widestCount === 1 ? next : widest;
      if (gap.width >= CELL_GAP_EM * em && (gap.width >= OTHER_GAPS_FACTOR * others || gap.width >= LONE_CELL_GAP_EM * em)) wide.add(gap.after);
    }
    const segments: Member[][] = [];
    let current: Member[] = [];
    const close = () => {
      while (current.length && !written(current[current.length - 1]!.item)) current.pop();
      if (current.length) segments.push(current);
      current = [];
    };
    members.forEach((member, index) => {
      if (wide.has(index)) close();
      if (written(member.item) || current.length) current.push(member);
    });
    close();
    return segments;
  };
  const rowsOf = (items: readonly Item[]): Row[] => {
    const placed: Member[] = [];
    items.forEach((item, index) => {
      const at = position(item);
      if (at && textOf(item) !== "") placed.push({ item, index, ...at });
    });
    placed.sort((left, right) => left.y - right.y);
    const rows: Array<{ y: number; tolerance: number; members: Member[] }> = [];
    for (const member of placed) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(member.y - row.y) <= row.tolerance) row.members.push(member);
      else rows.push({ y: member.y, tolerance: Math.max(0.5, 0.2 * heightOf(member.item)), members: [member] });
    }
    const result: Row[] = [];
    for (const row of rows) {
      const members = row.members.sort((left, right) => left.x - right.x || left.index - right.index);
      let height = 0;
      let key = "";
      for (const member of members) {
        if (written(member.item)) height = Math.max(height, heightOf(member.item));
        key += textOf(member.item);
      }
      key = key.replace(/\s+/g, "").toLowerCase();
      if (key !== "") result.push({ y: row.y, height, key, members, segments: segmentsOf(members, height || 1) });
    }
    return result;
  };
  const pages = contents.map(content => rowsOf(content.items as readonly Item[]));
  // Where each row's text lies on each page, sorted by height, to find it at the same height on another page.
  const heightsOf = new Map<string, { places: Array<{ page: number; y: number; height: number }>; tallest: number }>();
  pages.forEach((rows, page) => {
    for (const row of rows) {
      const found = heightsOf.get(row.key);
      if (found) {
        found.places.push({ page, y: row.y, height: row.height });
        found.tallest = Math.max(found.tallest, row.height);
      } else heightsOf.set(row.key, { places: [{ page, y: row.y, height: row.height }], tallest: row.height });
    }
  });
  heightsOf.forEach(found => found.places.sort((left, right) => left.y - right.y));
  const elsewhere = (row: Row, page: number) => {
    const found = heightsOf.get(row.key);
    if (!found || found.places.length < 2) return false;
    const reach = Math.max(1, 0.1 * Math.max(row.height, found.tallest));
    let low = 0;
    let high = found.places.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (found.places[middle]!.y < row.y - reach) low = middle + 1;
      else high = middle;
    }
    for (let at = low; at < found.places.length && found.places[at]!.y <= row.y + reach; at += 1) {
      const other = found.places[at]!;
      if (other.page !== page && Math.abs(other.y - row.y) <= Math.max(1, 0.1 * Math.max(row.height, other.height))) return true;
    }
    return false;
  };
  /** A line's pieces in their order along it: right to left when it holds Arabic or Hebrew. */
  const inLineOrder = (members: Member[]) => (members.some(member => RIGHT_TO_LEFT.test(textOf(member.item))) ? [...members].reverse() : members);
  return contents.map((content, page) => {
    const items = content.items as readonly Item[];
    const rows = pages[page]!;
    const candidates = new Set(rows.filter(row => elsewhere(row, page)));
    let top = -Infinity;
    let bottom = Infinity;
    let body = 0;
    for (const row of rows) {
      if (candidates.has(row)) continue;
      body += 1;
      top = Math.max(top, row.y);
      bottom = Math.min(bottom, row.y);
    }
    const byHeight = (left: Row, right: Row) => right.y - left.y;
    // A header or a footer lies above or under the body of its page: a page of repeated rows only is left as it is.
    const header = body ? rows.filter(row => candidates.has(row) && row.y > top).sort(byHeight) : [];
    const footer = body ? rows.filter(row => candidates.has(row) && row.y < bottom).sort(byHeight) : [];
    const running = new Set([...header, ...footer]);
    // How many items with text, and how many ends of line, come before each index: a segment is scattered when another's text, or
    // an end of line, lies between its first and last pieces.
    const before = [0];
    const endsBefore = [0];
    items.forEach((item, index) => {
      before.push(before[index]! + (written(item) ? 1 : 0));
      endsBefore.push(endsBefore[index]! + (endsLine(item) ? 1 : 0));
    });
    const scattered: Member[][] = [];
    for (const row of rows) {
      if (running.has(row)) continue;
      for (const segment of row.segments) {
        if (segment.length < 2) continue;
        let first = Infinity;
        let last = -Infinity;
        for (const member of segment) {
          first = Math.min(first, member.index);
          last = Math.max(last, member.index);
        }
        let own = 0;
        for (const member of segment) if (member.index > first && member.index < last && written(member.item)) own += 1;
        if (before[last]! - before[first + 1]! > own || endsBefore[last]! - endsBefore[first]! > 0) scattered.push(segment);
      }
    }
    if (scattered.length === 0 && running.size === 0) return content;
    const moved = new Set<number>();
    const lineAt = new Map<number, Member[]>();
    for (const segment of scattered) {
      let first = Infinity;
      for (const member of segment) {
        moved.add(member.index);
        first = Math.min(first, member.index);
      }
      lineAt.set(first, segment);
    }
    running.forEach(row => row.members.forEach(member => moved.add(member.index)));
    const result: Item[] = [];
    const lineEnded = () => result.length === 0 || result[result.length - 1]!.hasEOL === true;
    const emit = (members: Member[]) => {
      const ordered = inLineOrder(members);
      const reversed = ordered !== members;
      if (!lineEnded()) result.push({ str: "", width: 0, height: 0, transform: ordered[0]!.item.transform, hasEOL: true });
      ordered.forEach((member, at) => {
        const previous = ordered[at - 1];
        if (previous) {
          // The gap between the two pieces along the row, whichever way the line reads.
          const [left, right] = reversed ? [member, previous] : [previous, member];
          const end = left.x + widthOf(left.item);
          const gap = right.x - end;
          const em = Math.max(heightOf(previous.item), heightOf(member.item));
          if (gap > SPACE_EM * em && !/\s$/.test(textOf(previous.item)) && !/^\s/.test(textOf(member.item))) {
            const matrix = right.item.transform as number[];
            result.push({ str: " ", width: gap, height: 0, transform: [matrix[0], matrix[1], matrix[2], matrix[3], end, matrix[5]], hasEOL: false });
          }
        }
        result.push({ ...member.item, hasEOL: at === ordered.length - 1 });
      });
    };
    header.forEach(row => emit(row.members));
    items.forEach((item, index) => {
      const members = lineAt.get(index);
      if (members) return emit(members);
      if (moved.has(index)) return;
      if (textOf(item) === "" && item.hasEOL === true && lineEnded()) return;
      result.push(item);
    });
    footer.forEach(row => emit(row.members));
    // Running rows already at the edges, drawn at once: nothing to change.
    const same = (left: Item, right: Item) => left === right || (left.hasEOL === right.hasEOL && Object.keys(left).every(key => key === "hasEOL" || (left as Record<string, unknown>)[key] === (right as Record<string, unknown>)[key]));
    if (result.length === items.length && result.every((item, index) => same(item, items[index]!))) return content;
    return { ...content, items: result };
  });
}

/**
 * IA-04: a page's text items with the lines of one paragraph that the PDF
 * wrapped for lack of room read as one line, as the DOCX of the same CV gives
 * it (mammoth: a paragraph, a line): the same CV has the same lines, and the
 * same places of evidence, in PDF and in DOCX. A line is the next one's
 * continuation when, of the same height, the next one is under it by the
 * tightest line pitch of that height on the page (no paragraph spacing), on
 * the same left edge (or within four em of it from the paragraph's first line:
 * an indent, a hanging indent; or under the row it ends, a paragraph after a
 * tab, from the left edge of that row), does not start a list item, and when
 * the line was full: the next line's first word would not have fitted in what
 * was left of its column. The column's right edge is the page's, as wide as
 * its left margin, or a column's beside it, or the widest line of that left
 * edge when the column is filled to three fifths. pdf-parse breaks a line at
 * an end of line or when the height changes (getPageText): the continuation
 * is moved after the line on its baseline, a space between them (none after
 * a hyphen or an ideograph), and the end of line between them dropped. Only
 * whitespace and the place of the items change, no text is added or removed.
 * The lines around a line are looked for in lists sorted by height and by
 * left edge; past WORK_BUDGET comparisons on a page, it is left as it is (a
 * line not joined only costs fairness: its parts are lines of their own).
 * Self-contained: the isolated reader runs it as its source.
 */
export function wrappedLinesTogether<Content extends { items: readonly unknown[] }>(content: Content, page?: { box?: readonly number[]; rotation?: number }): Content {
  const LINE_THRESHOLD = 4.6;
  const PITCH_SLACK = 0.75;
  const WRAP_PITCH_EM = 1.75;
  const INDENT_EM = 4;
  const FILLED = 0.6;
  const WORK_BUDGET = 200_000;
  type Item = { str?: unknown; width?: unknown; height?: unknown; hasEOL?: unknown; transform?: unknown };
  type Line = { start: number; end: number; x: number; right: number; y: number; height: number; first: number; last: number };
  if (page?.rotation) return content;
  const items = content.items as readonly Item[];
  const textOf = (item: Item) => (typeof item.str === "string" ? item.str : "");
  const written = (item: Item) => textOf(item).trim() !== "";
  const matrixOf = (item: Item) => {
    const matrix = item.transform;
    if (!Array.isArray(matrix) || matrix.length < 6) return null;
    for (let at = 0; at < 6; at += 1) if (typeof matrix[at] !== "number" || !Number.isFinite(matrix[at])) return null;
    return matrix as number[];
  };
  let work = 0;
  // The lines as pdf-parse writes them: after an end of line, or before an item lower or higher by more than its threshold.
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  let previousY: number | undefined;
  let tallest = 0;
  let pushed: string | undefined;
  items.forEach((item, index) => {
    const y = matrixOf(item)?.[5];
    if (y === undefined) return;
    if (previousY !== undefined && Math.abs(previousY - y) > LINE_THRESHOLD) {
      const ending = textOf(item).startsWith("\n") || (textOf(item).trim() === "" && item.hasEOL === true);
      if (pushed !== undefined && !pushed.endsWith("\n") && !ending && Math.abs(previousY - y) - 1 > tallest) {
        if (index > start) ranges.push({ start, end: index - 1 });
        start = index;
        tallest = 0;
      }
    }
    previousY = y;
    tallest = Math.max(tallest, Number(item.height) || 0);
    pushed = item.hasEOL === true ? "\n" : textOf(item);
    if (item.hasEOL === true || textOf(item).endsWith("\n")) {
      ranges.push({ start, end: index });
      start = index + 1;
      tallest = 0;
    }
  });
  if (start < items.length) ranges.push({ start, end: items.length - 1 });
  const lines: Array<Line | null> = ranges.map(({ start, end }) => {
    let line: Line | null = null;
    for (let at = start; at <= end; at += 1) {
      const item = items[at]!;
      if (!written(item)) continue;
      const matrix = matrixOf(item);
      if (!matrix || matrix[1] !== 0 || matrix[2] !== 0 || matrix[0]! <= 0 || matrix[3]! <= 0) return null;
      const right = matrix[4]! + (Number(item.width) || 0);
      const height = Number(item.height) || 0;
      if (!line) line = { start, end, x: matrix[4]!, right, y: matrix[5]!, height, first: at, last: at };
      else {
        if (matrix[4]! < line.x) [line.x, line.first] = [matrix[4]!, at];
        line.right = Math.max(line.right, right);
        line.height = Math.max(line.height, height);
        line.last = at;
      }
    }
    return line;
  });
  const placed = lines.filter((line): line is Line => line !== null && line.height > 0);
  if (placed.length < 2) return content;
  const same = (left: number, right: number) => Math.abs(left - right) <= 0.1 * Math.max(left, right);
  // The tightest pitch between two lines of a height, one under the other, and whether a wider one (paragraph spacing) is seen too.
  const drops = new Map<number, number[]>();
  for (let index = 1; index < lines.length; index += 1) {
    const [above, under] = [lines[index - 1], lines[index]];
    if (!above || !under || !same(above.height, under.height)) continue;
    const drop = above.y - under.y;
    const key = Math.round(above.height * 2) / 2;
    if (drop > 0.5 * above.height && drop <= 3 * above.height) {
      const seen = drops.get(key);
      if (seen) seen.push(drop);
      else drops.set(key, [drop]);
    }
  }
  const pitches = new Map<number, { tightest: number; spaced: boolean }>();
  drops.forEach((seen, key) => {
    let tightest = Infinity;
    for (const drop of seen) tightest = Math.min(tightest, drop);
    pitches.set(key, { tightest, spaced: seen.some(drop => drop > tightest + Math.max(2, 0.15 * key)) });
  });
  const pitchOf = (height: number) => pitches.get(Math.round(height * 2) / 2) ?? { tightest: Infinity, spaced: false };
  const box = page?.box && page.box.length >= 4 ? page.box : null;
  let leftmost = Infinity;
  let rightmost = -Infinity;
  for (const line of placed) {
    leftmost = Math.min(leftmost, line.x);
    rightmost = Math.max(rightmost, line.right);
  }
  const pageRight = box ? box[0]! + box[2]! - leftmost : rightmost;
  // The lines sorted by height and by left edge, to look for those of a band of the page.
  const byY = [...placed].sort((left, right) => left.y - right.y);
  const byX = [...placed].sort((left, right) => left.x - right.x);
  const firstAtLeast = (sorted: Line[], value: number, of: (line: Line) => number) => {
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      work += 1;
      if (of(sorted[middle]!) < value) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  /** Visits the lines whose height lies in [low, high], or whose left edge does, each once. */
  const band = (sorted: Line[], of: (line: Line) => number, low: number, high: number, visit: (line: Line) => void) => {
    for (let at = firstAtLeast(sorted, low, of); at < sorted.length && of(sorted[at]!) <= high; at += 1) {
      work += 1;
      visit(sorted[at]!);
    }
  };
  const firstWord = (line: Line) => {
    const item = items[line.first]!;
    const text = textOf(item).replace(/^\s+/, "");
    const unit = /^[぀-ヿ㐀-䶿一-鿿豈-﫿]/.test(text) ? text.slice(0, 1) : (/^\S*?[-‐‑/](?=\S)|^\S+/.exec(text)?.[0] ?? text);
    return (Number(item.width) || 0) * (unit.length / Math.max(1, textOf(item).length));
  };
  // After a hyphen or an ideograph, a wrapped line goes on without a space.
  const unspaced = /[-‐‑/぀-ヿ㐀-䶿一-鿿豈-﫿]\s*$/;
  const listItem = /^\s*(?:[•●▪■◦‣∙·*–—-](?:\s|$)|\d{1,2}[.)](?:\s|$)|[a-z][.)]\s)/i;
  // The nearest line of the same height before each line (step -1) and after it (step 1) in the text, and the drop to it.
  const DROP_REACH = 8;
  const dropAt = (index: number, step: number) => {
    const line = lines[index];
    if (!line) return null;
    for (let at = index + step, seen = 0; at >= 0 && at < lines.length && seen < DROP_REACH; at += step, seen += 1) {
      work += 1;
      const other = lines[at];
      if (!other || !same(other.height, line.height)) continue;
      const drop = step < 0 ? other.y - line.y : line.y - other.y;
      return drop > 0.5 * line.height && drop <= 3 * line.height ? drop : null;
    }
    return null;
  };
  // Each line's predecessor in its paragraph, if any: the line before it, past the lines of a column on its right (a table row
  // drawn row by row); and the first line of the paragraph each line is in.
  const previousOf = new Map<number, number>();
  const taken = new Set<number>();
  const paragraphOf: number[] = lines.map((_, index) => index);
  for (let index = 1; index < lines.length; index += 1) {
    if (work > WORK_BUDGET) return content;
    const under = lines[index];
    if (!under || listItem.test(textOf(items[under.first]!))) continue;
    let at = index - 1;
    for (let skipped = 0; at >= 0 && skipped < 4; skipped += 1) {
      const line = lines[at];
      if (line && !(line.x >= under.right + 0.5 * under.height && line.y >= under.y - 0.5 * under.height)) break;
      at -= 1;
    }
    const above = at >= 0 ? lines[at] : null;
    if (!above || !same(above.height, under.height) || taken.has(at)) continue;
    const em = Math.max(above.height, under.height);
    const drop = above.y - under.y;
    const pitch = pitchOf(above.height);
    // The pitch of a paragraph's lines: at most one and three quarters of a line of single spacing, and tighter than that of the
    // lines around them (the paragraph spacing) or the tightest of the page for that height.
    const around = [dropAt(at, -1), dropAt(index, 1)].filter((value): value is number => value !== null);
    const tighter = around.length > 0 && drop < Math.min(...around) - Math.max(2, 0.15 * em);
    if (drop <= 0.5 * em || drop > WRAP_PITCH_EM * em) continue;
    if (!tighter && drop > pitch.tightest + Math.max(PITCH_SLACK, 0.05 * em)) continue;
    // The row the line ends: its left edge, for a paragraph whose first line starts after a tab.
    let rowLeft = Infinity;
    band(byY, line => line.y, above.y - 0.2 * em, above.y + 0.2 * em, line => { rowLeft = Math.min(rowLeft, line.x); });
    const first = !previousOf.has(at);
    const aligned = Math.abs(under.x - above.x) <= Math.max(1, 0.1 * em)
      || (first && Math.abs(under.x - above.x) <= INDENT_EM * em)
      || (pitch.spaced && Math.abs(under.x - rowLeft) <= Math.max(1, 0.1 * em) && under.x < above.x && under.right > above.x);
    if (!aligned) continue;
    // The right edge of the column: the page's (as wide as its left margin), the next column's on the rows of the paragraph so far
    // (from its first line down to this one), else on the page.
    const paragraphTop = lines[paragraphOf[at]!]!.y;
    let near = pageRight;
    band(byY, line => line.y, under.y - 0.5 * em, paragraphTop + 0.5 * em, line => {
      if (line !== above && line !== under && line.x >= Math.max(above.right, under.right) + 0.5) near = Math.min(near, line.x - 0.5 * em);
    });
    let widest = above.right;
    band(byX, line => line.x, under.x - 0.5 * em, under.x + 0.5 * em, line => { if (line.right <= near + 0.5 * em) widest = Math.max(widest, line.right); });
    const nextColumn = firstAtLeast(byX, widest + 0.5, line => line.x);
    const room = nextColumn < byX.length && byX[nextColumn]!.x < near ? Math.min(near, byX[nextColumn]!.x - 0.5 * em) : near;
    // The room left, half an em less: up to the page's right margin, as wide as its left one (its margins may differ), or up to a
    // column beside it (the margins of two cells); without a column beside it and with paragraph spacing seen on the page, the
    // widest line of that left edge when it fills three fifths of that room (a text box, a narrower block).
    const besideColumn = room < pageRight - 0.01;
    const right = (!besideColumn && pitch.spaced && widest - under.x >= FILLED * (room - under.x) ? Math.min(widest, room) : room) - 0.5 * em;
    const space = unspaced.test(textOf(items[above.last]!)) ? 0 : 0.25 * em;
    if (above.right + space + firstWord(under) > right) {
      previousOf.set(index, at);
      taken.add(at);
      paragraphOf[index] = paragraphOf[at]!;
    }
  }
  if (previousOf.size === 0 || work > WORK_BUDGET) return content;
  // Each paragraph: its first line and the lines joined to it, in order; written where its first line is, ended as it ends.
  const members = new Map<number, number[]>();
  for (let index = 0; index < lines.length; index += 1) {
    const head = paragraphOf[index]!;
    const chain = members.get(head);
    if (chain) chain.push(index);
    else members.set(head, [index]);
  }
  const result: Item[] = [];
  const moved = (item: Item, dx: number, dy: number) => {
    const matrix = matrixOf(item);
    return matrix ? { ...item, transform: [matrix[0], matrix[1], matrix[2], matrix[3], matrix[4]! + dx, matrix[5]! + dy] } : { ...item };
  };
  /** The item that ends a line without text of its own (an end of line, a wide gap read as a line break), if any. */
  const breakOf = (range: { start: number; end: number }) => {
    const end = items[range.end]!;
    return (end.hasEOL === true || textOf(end).endsWith("\n")) && textOf(end).trim() === "" ? end : null;
  };
  const ends = (range: { start: number; end: number }) => items[range.end]!.hasEOL === true || textOf(items[range.end]!).endsWith("\n");
  ranges.forEach((range, index) => {
    if (paragraphOf[index] !== index) return;
    const chain = members.get(index)!;
    if (chain.length === 1) {
      for (let at = range.start; at <= range.end; at += 1) result.push(items[at]!);
      return;
    }
    const head = lines[index]!;
    let right = head.right;
    chain.forEach((member, at) => {
      const line = ranges[member]!;
      const body: Item[] = [];
      for (let offset = line.start; offset <= line.end; offset += 1) body.push(items[offset]!);
      // Each line's own end is dropped, a text ending its line kept without it: the paragraph ends once, after its last line.
      if (breakOf(line)) body.pop();
      else if (body.length && ends(line)) body[body.length - 1] = { ...body[body.length - 1]!, hasEOL: false };
      if (at === 0) {
        for (const item of body) result.push(item);
        return;
      }
      const placedLine = lines[member]!;
      const em = Math.max(head.height, placedLine.height);
      const space = unspaced.test(textOf(items[lines[chain[at - 1]!]!.last]!)) ? "" : " ";
      result.push({ str: space, width: 0, height: 0, transform: [1, 0, 0, 1, right, head.y], hasEOL: false });
      const dx = right + (space ? 0.25 * em : 0) - placedLine.x;
      const dy = head.y - placedLine.y;
      for (const item of body) result.push(moved(item, dx, dy));
      right = placedLine.right + dx;
    });
    // The paragraph ends as its first line did: with its end of line or line break, else with an end of line.
    const end = breakOf(range);
    if (end) result.push(end);
    else if (ends(range)) result.push({ str: "", width: 0, height: 0, transform: [1, 0, 0, 1, right, head.y], hasEOL: true });
  });
  return { ...content, items: result };
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
const rowsTogether = ${rowsTogether.toString()};
const wrappedLinesTogether = ${wrappedLinesTogether.toString()};

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
      // keeps the text laid out as before, a line drawn in pieces read as one line, a header or a
      // footer at the edge of its page, a wide gap within a line as a line break, and the lines a
      // paragraph wraps onto as one.
      const doc = await parser.load();
      const total = doc.numPages;
      const read = [];
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
        read.push({ num, viewport: page.getViewport({ scale: 1 }), content });
        page.cleanup();
      }
      const contents = rowsTogether(read.map(page => page.content));
      const pages = [];
      for (const [index, { num, viewport }] of read.entries()) {
        const content = wrappedLinesTogether(textCellsAsLines(contents[index]), { box: viewport.viewBox, rotation: viewport.rotation });
        const text = await parser.getPageText({ getViewport: () => viewport, getTextContent: async () => content }, {}, total);
        pages.push({ num, text });
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
