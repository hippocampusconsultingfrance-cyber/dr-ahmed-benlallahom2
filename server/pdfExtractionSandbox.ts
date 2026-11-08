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
 * line read as a line break: the cells of a table row, or two columns side by
 * side (« Spécialité : anesthésie-réanimation » and « Médecin
 * anesthésiste-réanimateur »), where mammoth puts each cell of a DOCX on its
 * own line: the same CV then has the same lines, and the same places of
 * evidence, in PDF and in DOCX. A gap is wide from one em (the height of its
 * line's text) when it is twice as wide as any other gap of its line, or from
 * two and a half: the even gaps of a justified line stay spaces. A gap is what
 * lies between two texts along their baseline (turned with them, a shear
 * aside), whichever way the line reads (right to left in Arabic or Hebrew),
 * whatever item ends the line, and whether pdf.js writes a whitespace item
 * there or not (the width of that item when the texts have no position); the
 * whitespace item between them is then the line break, else one is put before
 * the second text. Only whitespace is written, no text is added or removed.
 * Self-contained: the isolated reader runs it as its source.
 */
export function textCellsAsLines<Content extends { items: readonly unknown[] }>(content: Content): Content {
  const CELL_GAP_EM = 1;
  const LONE_CELL_GAP_EM = 2.5;
  const OTHER_GAPS_FACTOR = 2;
  type Item = { str?: unknown; width?: unknown; height?: unknown; hasEOL?: unknown; transform?: unknown };
  const items = content.items as readonly Item[];
  const text = (item: Item) => typeof item.str === "string" && item.str.trim() !== "";
  const blank = (item: Item) => typeof item.str === "string" && item.str !== "" && item.str.trim() === "" && !item.hasEOL && typeof item.width === "number" && item.width > 0;
  /** Where an item starts along its baseline, turned with its text (a shear does not move it); null without a position. */
  const along = (item: Item) => {
    const matrix = item.transform;
    if (!Array.isArray(matrix) || matrix.length < 6) return null;
    const [a, b, , , e, f] = matrix as unknown[];
    if (![a, b, e, f].every(value => typeof value === "number" && Number.isFinite(value))) return null;
    const scale = Math.hypot(a as number, b as number);
    return scale > 0 ? ((e as number) * (a as number) + (f as number) * (b as number)) / scale : null;
  };
  const replaced = new Set<number>();
  const before = new Set<number>();
  let start = 0;
  for (let index = 0; index <= items.length; index += 1) {
    if (index < items.length && !items[index]!.hasEOL) continue;
    // The line, with the item that ends it.
    const last = Math.min(index, items.length - 1);
    const written: number[] = [];
    let em = 0;
    for (let at = start; at <= last; at += 1) {
      if (!text(items[at]!)) continue;
      written.push(at);
      em = Math.max(em, Number(items[at]!.height) || 0);
    }
    const gaps: Array<{ after: number; next: number; width: number }> = [];
    for (let at = 1; at < written.length; at += 1) {
      const [previous, next] = [written[at - 1]!, written[at]!];
      const [from, to] = [along(items[previous]!), along(items[next]!)];
      let width = 0;
      if (from !== null && to !== null) {
        // Between the two texts' boxes along the line, whichever comes first on it.
        const [fromWidth, toWidth] = [Number(items[previous]!.width) || 0, Number(items[next]!.width) || 0];
        width = to >= from ? to - (from + fromWidth) : from - (to + toWidth);
      } else for (let between = previous + 1; between < next; between += 1) if (blank(items[between]!)) width = Math.max(width, items[between]!.width as number);
      gaps.push({ after: previous, next, width });
    }
    // The widest gap of the line and the next: any other gap of a gap is the widest, or the next for the widest itself.
    let widest = 0;
    let widestCount = 0;
    let second = 0;
    for (const gap of gaps) {
      if (gap.width > widest) [second, widest, widestCount] = [widest, gap.width, 1];
      else if (gap.width === widest) widestCount += 1;
      else if (gap.width > second) second = gap.width;
    }
    for (const gap of gaps) {
      const others = gap.width === widest && widestCount === 1 ? second : widest;
      if (!(em > 0 && gap.width >= CELL_GAP_EM * em && (gap.width >= OTHER_GAPS_FACTOR * others || gap.width >= LONE_CELL_GAP_EM * em))) continue;
      // The widest whitespace item between the two texts becomes the line break, else one is put before the second.
      let breakAt = -1;
      for (let between = gap.after + 1; between < gap.next; between += 1) {
        if (blank(items[between]!) && (breakAt < 0 || (items[between]!.width as number) > (items[breakAt]!.width as number))) breakAt = between;
      }
      if (breakAt >= 0) replaced.add(breakAt);
      else before.add(gap.next);
    }
    start = index + 1;
  }
  if (replaced.size === 0 && before.size === 0) return content;
  const result: Item[] = [];
  items.forEach((item, index) => {
    if (before.has(index)) result.push({ str: "\n", width: 0, height: 0, transform: item.transform, hasEOL: false });
    result.push(replaced.has(index) ? { ...item, str: "\n" } : item);
  });
  return { ...content, items: result };
}

/**
 * IA-04: the pages' text items with each piece of a line of text read as one
 * line, whatever the order its pieces are drawn in and however the line is
 * turned, and the rows of a header or a footer at the edge of their page, each
 * block of them one line. A row is the text of one baseline: read where the
 * text lies along its baseline, turned with it (a page shown upright through
 * its /Rotate, a line turned by a fraction of a degree; a shear, as of an
 * italic, does not move a baseline), each item in its own baseline's frame and
 * in the frame of its orientation (the items whose baselines turn by less than
 * half a degree from the next one's), the text of a row in either being of one
 * row. A row falls into segments at each wide gap between two of its texts
 * along it (cells of a table row, columns side by side), as textCellsAsLines
 * reads them: from one em, twice as wide as any other gap of the row or from
 * two and a half em; a whitespace item of pdf.js, as wide as the gap between
 * the texts it follows and the next one drawn, never counts, so that a piece
 * drawn into it later (a bullet, a separator) is in its segment. A segment
 * whose pieces are drawn between those of other rows, apart by an end of line,
 * or out of their order along the row, is brought back together where its
 * first piece is drawn, in its order along the row (right to left when it
 * holds Arabic or Hebrew): it is one line, as when it is drawn at once. A row
 * of the same text at the same height on two pages or more, above all other
 * text of its page or under it (a header, a footer), numbers aside (a page
 * number), is put at the start or the end of its page, the rows of each edge
 * one line, top row first: the
 * first and the last line of the pages are those normalizedSourcePassages
 * counts as one place when they repeat; a page of such rows only is left as it
 * is, and a row of the body stays where it is. Only the order and the place of
 * the items change: a space is put between two texts apart on the row, as
 * pdf.js writes it between two pieces drawn one after the other, an end of
 * line before and after a moved line, and an empty end of line that would
 * follow another is dropped. In O(n log n) of the items: sorted by height then
 * swept, a sorted list of the heights each text is found at. Self-contained:
 * the isolated reader runs it as its source.
 */
export function rowsTogether<Content extends { items: readonly unknown[] }>(contents: readonly Content[]): Content[] {
  const SPACE_EM = 0.15;
  const CELL_GAP_EM = 1;
  const LONE_CELL_GAP_EM = 2.5;
  const OTHER_GAPS_FACTOR = 2;
  /** Baselines turning by at most half a degree from the next one's are of one orientation; within a tenth of a degree of level, level. */
  const TURN = Math.PI / 360;
  const LEVEL = Math.PI / 1800;
  /** Pieces out of their order along the row by more than half an em are drawn out of order. */
  const ORDER_SLACK_EM = 0.5;
  const RIGHT_TO_LEFT = new RegExp("[\\p{Script=Arabic}\\p{Script=Hebrew}]", "u");
  type Item = { str?: unknown; width?: unknown; height?: unknown; hasEOL?: unknown; transform?: unknown };
  type Member = { item: Item; index: number; e: number; f: number; angle: number; x: number; y: number };
  type Row = { y: number; height: number; key: string; masked: string; angle: number; main: boolean; members: Member[]; segments: Member[][] };
  const textOf = (item: Item) => (typeof item.str === "string" ? item.str : "");
  const written = (item: Item) => textOf(item).trim() !== "";
  const widthOf = (item: Item) => Number(item.width) || 0;
  const heightOf = (item: Item) => Number(item.height) || 0;
  const endsLine = (item: Item) => item.hasEOL === true || textOf(item).endsWith("\n");
  /** Where an item is drawn, and how its baseline turns (the direction of its text, a shear aside); null without a position. */
  const placeOf = (item: Item) => {
    const matrix = item.transform;
    if (!Array.isArray(matrix) || matrix.length < 6) return null;
    const [a, b, , , e, f] = matrix as unknown[];
    if (![a, b, e, f].every(value => typeof value === "number" && Number.isFinite(value))) return null;
    if (a === 0 && b === 0) return null;
    const angle = Math.atan2(b as number, a as number);
    return { e: e as number, f: f as number, angle: Math.abs(angle) < LEVEL ? 0 : angle };
  };
  /** A point along a baseline turned by `angle` (x) and across it (y). */
  const frame = (e: number, f: number, angle: number) => (angle === 0 ? { x: e, y: f } : { x: e * Math.cos(angle) + f * Math.sin(angle), y: f * Math.cos(angle) - e * Math.sin(angle) });
  /** The page's point of a point of that frame. */
  const unframe = (x: number, y: number, angle: number) => (angle === 0 ? { e: x, f: y } : { e: x * Math.cos(angle) - y * Math.sin(angle), f: x * Math.sin(angle) + y * Math.cos(angle) });
  /** A row's pieces between its wide gaps, each from its first text to its last, the gaps measured between its texts. */
  const segmentsOf = (members: Member[], em: number) => {
    const gaps: Array<{ after: number; width: number }> = [];
    let end = -Infinity;
    members.forEach((member, index) => {
      if (!written(member.item)) return;
      if (end > -Infinity) gaps.push({ after: index, width: member.x - end });
      end = Math.max(end, member.x + widthOf(member.item));
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
    const placed: Array<Omit<Member, "x" | "y">> = [];
    items.forEach((item, index) => {
      const at = textOf(item) === "" ? null : placeOf(item);
      if (at) placed.push({ item, index, ...at });
    });
    // The orientations: the items by the turn of their baseline, apart where it turns by more than TURN from the one before.
    placed.sort((left, right) => left.angle - right.angle || left.index - right.index);
    const orientations: Array<typeof placed> = [];
    for (const one of placed) {
      const orientation = orientations[orientations.length - 1];
      if (orientation && one.angle - orientation[orientation.length - 1]!.angle <= TURN) orientation.push(one);
      else orientations.push([one]);
    }
    let main: typeof placed | undefined;
    let mainCount = -1;
    for (const orientation of orientations) {
      let count = 0;
      for (const one of orientation) if (written(one.item)) count += 1;
      if (count > mainCount) [main, mainCount] = [orientation, count];
    }
    const result: Row[] = [];
    for (const orientation of orientations) {
      const reference = orientation[orientation.length >> 1]!.angle;
      // Rows twice, each item in its own baseline's frame (a line drawn turned) and in its orientation's (pieces turned each their
      // way along one baseline): the items of a row in either are of one row.
      const parent = orientation.map((_, at) => at);
      const find = (at: number) => {
        let root = at;
        while (parent[root] !== root) root = parent[root]!;
        while (parent[at] !== root) [parent[at], at] = [root, parent[at]!];
        return root;
      };
      for (const own of [true, false]) {
        const order = orientation.map((one, at) => ({ at, y: frame(one.e, one.f, own ? one.angle : reference).y, tolerance: Math.max(0.5, 0.2 * heightOf(one.item)) }));
        order.sort((left, right) => left.y - right.y);
        let first: (typeof order)[number] | undefined;
        for (const one of order) {
          if (first && Math.abs(one.y - first.y) <= first.tolerance) parent[find(one.at)] = find(first.at);
          else first = one;
        }
      }
      const byRoot = new Map<number, Member[]>();
      orientation.forEach((one, at) => {
        const member = { ...one, ...frame(one.e, one.f, reference) };
        const root = find(at);
        const found = byRoot.get(root);
        if (found) found.push(member);
        else byRoot.set(root, [member]);
      });
      byRoot.forEach(members => {
        members.sort((left, right) => left.x - right.x || left.index - right.index);
        let height = 0;
        let key = "";
        let y = Infinity;
        for (const member of members) {
          if (written(member.item)) height = Math.max(height, heightOf(member.item));
          y = Math.min(y, member.y);
          key += textOf(member.item);
        }
        key = key.replace(/\s+/g, "").toLowerCase();
        // Numbers aside: a page number in a footer.
        if (key !== "") result.push({ y, height, key, masked: key.replace(/\d+/g, "#"), angle: reference, main: orientation === main, members, segments: segmentsOf(members, height || 1) });
      });
    }
    return result;
  };
  const pages = contents.map(content => rowsOf(content.items as readonly Item[]));
  // Where each row's text lies on each page, as it is and numbers aside, sorted by height, to find it at the same height on another page.
  const heightsOf = new Map<string, { places: Array<{ page: number; y: number; height: number }>; tallest: number }>();
  pages.forEach((rows, page) => {
    for (const row of rows) {
      if (!row.main) continue;
      for (const key of [`=${row.key}`, `#${row.masked}`]) {
        const found = heightsOf.get(key);
        if (found) {
          found.places.push({ page, y: row.y, height: row.height });
          found.tallest = Math.max(found.tallest, row.height);
        } else heightsOf.set(key, { places: [{ page, y: row.y, height: row.height }], tallest: row.height });
      }
    }
  });
  heightsOf.forEach(found => found.places.sort((left, right) => left.y - right.y));
  const elsewhere = (row: Row, page: number, numbersAside = false) => {
    const found = row.main ? heightsOf.get(numbersAside ? `#${row.masked}` : `=${row.key}`) : undefined;
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
  /** A line's texts in their order along it: right to left when it holds Arabic or Hebrew. */
  const inLineOrder = (members: Member[]) => {
    const texts = members.filter(member => written(member.item));
    return texts.some(member => RIGHT_TO_LEFT.test(textOf(member.item))) ? texts.reverse() : texts;
  };
  return contents.map((content, page) => {
    const items = content.items as readonly Item[];
    const rows = pages[page]!;
    const candidates = new Set(rows.filter(row => elsewhere(row, page)));
    let top = -Infinity;
    let bottom = Infinity;
    let body = 0;
    for (const row of rows) {
      if (!row.main || candidates.has(row)) continue;
      body += 1;
      top = Math.max(top, row.y);
      bottom = Math.min(bottom, row.y);
    }
    const byHeight = (left: Row, right: Row) => right.y - left.y;
    // A header or a footer lies above or under the body of its page: a page of repeated rows only is left as it is. Each goes on
    // from the edge with the rows of the same text numbers aside at the same height on another page (a numbered line), each within
    // two and a half lines of the one before; one of its rows at least is of the same text at the same height on another page.
    const main = rows.filter(row => row.main).sort(byHeight);
    const edge = (seed: Set<Row>, inward: Row[]) => {
      const block: Row[] = [];
      for (const row of inward) {
        const previous = block[block.length - 1];
        const near = !previous || Math.abs(previous.y - row.y) <= 2.5 * Math.max(previous.height, row.height, 1);
        if (!near || !(seed.has(row) || elsewhere(row, page, true))) break;
        block.push(row);
      }
      // Rows of the same text numbers aside only go with a row of the same text at the same height on another page.
      return block.some(row => seed.has(row)) ? block : [];
    };
    let header = body ? edge(candidates, main) : [];
    let footer = body ? edge(candidates, [...main].reverse()).reverse() : [];
    if (header.length + footer.length >= main.length) [header, footer] = [[], []];
    const running = new Set([...header, ...footer]);
    // How many items with text, and how many ends of line, come before each index: a segment is scattered when another's text, or
    // an end of line, lies between its first and last pieces, or when its texts are drawn out of their order along the row.
    const before = [0];
    const endsBefore = [0];
    items.forEach((item, index) => {
      before.push(before[index]! + (written(item) ? 1 : 0));
      endsBefore.push(endsBefore[index]! + (endsLine(item) ? 1 : 0));
    });
    const lineAt = new Map<number, { members: Member[]; angle: number }>();
    const moved = new Set<number>();
    for (const row of rows) {
      if (running.has(row)) continue;
      for (const segment of row.segments) {
        const texts = segment.filter(member => written(member.item));
        if (texts.length < 2) continue;
        let first = Infinity;
        let last = -Infinity;
        for (const member of segment) {
          first = Math.min(first, member.index);
          last = Math.max(last, member.index);
        }
        let own = 0;
        for (const member of segment) if (member.index > first && member.index < last && written(member.item)) own += 1;
        // Along the row in the order they are drawn: one way or the other (a line read right to left), never back and forth.
        const drawn = [...texts].sort((left, right) => left.index - right.index);
        const slack = ORDER_SLACK_EM * (row.height || 1);
        let forward = true;
        let backward = true;
        for (let at = 1; at < drawn.length; at += 1) {
          if (drawn[at]!.x < drawn[at - 1]!.x - slack) forward = false;
          if (drawn[at]!.x > drawn[at - 1]!.x + slack) backward = false;
        }
        if (before[last]! - before[first + 1]! > own || endsBefore[last]! - endsBefore[first]! > 0 || !(forward || backward)) {
          for (const member of segment) moved.add(member.index);
          lineAt.set(first, { members: inLineOrder(segment), angle: row.angle });
        }
      }
    }
    if (lineAt.size === 0 && running.size === 0) return content;
    running.forEach(row => row.members.forEach(member => moved.add(member.index)));
    const result: Item[] = [];
    const lineEnded = () => result.length === 0 || result[result.length - 1]!.hasEOL === true;
    /**
     * Writes the texts of one line in this order, a space between two apart on it. A turned line is drawn at its first text's
     * place (pdf-parse never breaks it on its height); `laidOut`, a level one has each text after the one before it on the first's
     * baseline, a space between them.
     */
    const emit = (ordered: Member[], angle: number, laidOut: boolean) => {
      if (ordered.length === 0) return;
      const reversed = ordered.length > 1 && ordered[0]!.x > ordered[ordered.length - 1]!.x;
      const head = ordered[0]!;
      const headMatrix = head.item.transform as number[];
      let cursor = head.x;
      if (!lineEnded()) result.push({ str: "", width: 0, height: 0, transform: head.item.transform, hasEOL: true });
      const placed = (matrix: number[], x: number) => {
        if (angle !== 0) return [matrix[0], matrix[1], matrix[2], matrix[3], headMatrix[4], headMatrix[5]];
        return [matrix[0], matrix[1], matrix[2], matrix[3], x, headMatrix[5]];
      };
      ordered.forEach((member, at) => {
        const previous = ordered[at - 1];
        const matrix = member.item.transform as number[];
        if (previous) {
          const em = Math.max(heightOf(previous.item), heightOf(member.item));
          const spaced = /\s$/.test(textOf(previous.item)) || /^\s/.test(textOf(member.item));
          // The gap between the two texts along the row, whichever way the line reads.
          const [left, right] = reversed ? [member, previous] : [previous, member];
          const end = left.x + widthOf(left.item);
          const gap = laidOut ? (spaced ? 0 : 0.25 * em) : right.x - end;
          if (!spaced && gap > (laidOut ? 0 : SPACE_EM * em)) {
            result.push({ str: " ", width: gap, height: 0, transform: laidOut || angle !== 0 ? placed(matrix, cursor) : [matrix[0], matrix[1], matrix[2], matrix[3], end, matrix[5]], hasEOL: false });
          }
          cursor += Math.max(0, gap);
        }
        const transform = laidOut || angle !== 0 ? placed(matrix, cursor) : member.item.transform;
        result.push({ ...member.item, transform, hasEOL: at === ordered.length - 1 });
        cursor += widthOf(member.item);
      });
    };
    /** The rows of an edge as one line: as they are when one row of one segment, else laid out one after the other. */
    const emitEdge = (block: Row[]) => {
      if (block.length === 0) return;
      const laidOut = block.length > 1 || block[0]!.segments.length > 1;
      emit(block.flatMap(row => inLineOrder(row.members)), block[0]!.angle, laidOut);
    };
    emitEdge(header);
    items.forEach((item, index) => {
      const line = lineAt.get(index);
      if (line) return emit(line.members, line.angle, false);
      if (moved.has(index)) return;
      if (textOf(item) === "" && item.hasEOL === true && lineEnded()) return;
      result.push(item);
    });
    emitEdge(footer);
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
 * edge when the column is filled to three fifths. Lines aligned on their right
 * (a right-aligned block, Arabic or Hebrew) are full when the word would not
 * have fitted on their left, up to the page's left edge or a column there;
 * centred ones when it would not have fitted in the page's width. A line that
 * starts as a paragraph does (a capital, a number before a colon) is joined
 * only where a wrap is told from a paragraph: paragraph spacing seen on the
 * page and a wrap in lower case at that height, a pitch tighter than around
 * it, a paragraph already wrapped onto the line above, or a column beside it.
 * Level text only, a shear aside (an italic drawn slanted). pdf-parse breaks a line at
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
  const RIGHT_TO_LEFT = new RegExp("[\\p{Script=Arabic}\\p{Script=Hebrew}]", "u");
  type Item = { str?: unknown; width?: unknown; height?: unknown; hasEOL?: unknown; transform?: unknown };
  type Line = { start: number; end: number; x: number; right: number; y: number; height: number; first: number; last: number; rightmost: number };
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
      // Level text only, a shear aside (an italic drawn slanted, as of a font without an italic face).
      if (!matrix || matrix[1] !== 0 || matrix[0]! <= 0 || matrix[3]! <= 0) return null;
      const right = matrix[4]! + (Number(item.width) || 0);
      // A sheared item's height, as pdf.js gives it, is its slanted side's: its text is as high as its upright face's.
      const height = matrix[2] !== 0 ? Math.abs(matrix[3]!) : Number(item.height) || 0;
      if (!line) line = { start, end, x: matrix[4]!, right, y: matrix[5]!, height, first: at, last: at, rightmost: at };
      else {
        if (matrix[4]! < line.x) [line.x, line.first] = [matrix[4]!, at];
        if (right > line.right) [line.right, line.rightmost] = [right, at];
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
  // The page's text edges: each margin as wide as the other one, a block of text aligned on one of them telling the other.
  const pageRight = box ? Math.max(rightmost, box[0]! + box[2]! - leftmost) : rightmost;
  const pageLeft = box ? Math.min(leftmost, box[0]! + box[2]! - rightmost) : leftmost;
  // The lines sorted by height and by left edge, to look for those of a band of the page.
  const byY = [...placed].sort((left, right) => left.y - right.y);
  const byX = [...placed].sort((left, right) => left.x - right.x);
  const byRight = [...placed].sort((left, right) => left.right - right.right);
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
  /** The width of a line's first word, at its left end; at its right end for a line of Arabic or Hebrew, where it starts. */
  const firstWord = (line: Line) => {
    const rightToLeft = RIGHT_TO_LEFT.test(textOf(items[line.rightmost]!));
    const item = items[rightToLeft ? line.rightmost : line.first]!;
    const text = textOf(item).trim();
    const unit = rightToLeft ? (/\S+$/.exec(text)?.[0] ?? text) : /^[぀-ヿ㐀-䶿一-鿿豈-﫿]/.test(text) ? text.slice(0, 1) : (/^\S*?[-‐‑/](?=\S)|^\S+/.exec(text)?.[0] ?? text);
    return (Number(item.width) || 0) * (unit.length / Math.max(1, textOf(item).length));
  };
  // A line that starts as a paragraph does: with a capital, or a date or a number before a colon (« Spécialité : », « 2012-2024 : »).
  const startsParagraph = new RegExp("^[^\\p{L}\\p{N}]*(?:\\p{Lu}|\\p{N}[^:]{0,24}\\s:\\s)", "u");
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
  // The heights at which a line is seen wrapped onto the next one: under it at a line's pitch, on its left edge, going on with a
  // word in lower case or after a hyphen.
  const wrapsSeen = new Set<number>();
  const lowerCaseWord = new RegExp("^[^\\p{L}\\p{N}]*\\p{Ll}[\\p{L}’'-]*(?:[\\s,;)]|$)", "u");
  for (let index = 1; index < lines.length; index += 1) {
    const [above, under] = [lines[index - 1], lines[index]];
    if (!above || !under || !same(above.height, under.height) || Math.abs(above.x - under.x) > Math.max(1, 0.1 * above.height)) continue;
    const drop = above.y - under.y;
    if (drop <= 0.5 * above.height || drop > WRAP_PITCH_EM * above.height) continue;
    // A word in lower case, not an address (« karim.haddad@… »), after a line not ended by a full stop.
    if (/[.!?:;]\s*$/.test(textOf(items[above.last]!))) continue;
    if (lowerCaseWord.test(textOf(items[under.first]!)) || /[-‐]\s*$/.test(textOf(items[above.last]!))) wrapsSeen.add(Math.round(above.height * 2) / 2);
  }
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
    // A line that starts as a paragraph does is joined only where wrapped lines are told from paragraphs: paragraph spacing seen on
    // the page (or around these lines) and the tighter pitch here, or a paragraph already wrapped onto the line above.
    // A line in a column beside another (a table cell) may start so too, the column's edge telling how full the line was.
    const told = (pitch.spaced && wrapsSeen.has(Math.round(above.height * 2) / 2) && drop <= pitch.tightest + Math.max(PITCH_SLACK, 0.05 * em)) || tighter || !first;
    const startsAsParagraph = !told && startsParagraph.test(textOf(items[RIGHT_TO_LEFT.test(textOf(items[under.rightmost]!)) ? under.rightmost : under.first]!));
    const edge = Math.max(1, 0.1 * em);
    // Lines aligned on their right (right-aligned, or of a right-to-left script): the same right edge, the left one no other line's,
    // and either the left edges apart or the right one another line's too (a block aligned on the page's right margin).
    let leftShared = false;
    let rightShared = false;
    band(byX, line => line.x, under.x - edge, under.x + edge, line => { if (line !== above && line !== under) leftShared = true; });
    band(byRight, line => line.right, under.right - edge, under.right + edge, line => { if (line !== above && line !== under) rightShared = true; });
    // Lines of Arabic or Hebrew start on the right: their edge, and a first line's indent, are there.
    const rightToLeft = RIGHT_TO_LEFT.test(textOf(items[above.rightmost]!)) || RIGHT_TO_LEFT.test(textOf(items[under.rightmost]!));
    const sameLeft = Math.abs(under.x - above.x) <= edge;
    const sameRight = Math.abs(under.right - above.right) <= edge;
    const rightAligned = rightToLeft ? sameRight || (first && Math.abs(under.right - above.right) <= INDENT_EM * em) : sameRight && !leftShared && (!sameLeft || rightShared);
    // Centred lines: neither edge, the same middle.
    const centred = !rightAligned && !sameLeft && !sameRight && Math.abs(above.x + above.right - under.x - under.right) <= 2 * edge;
    const aligned = rightAligned || centred || sameLeft
      || (!rightToLeft && first && Math.abs(under.x - above.x) <= INDENT_EM * em)
      || (!rightToLeft && pitch.spaced && Math.abs(under.x - rowLeft) <= edge && under.x < above.x && under.right > above.x);
    if (!aligned) continue;
    const space = unspaced.test(textOf(items[above.last]!)) ? 0 : 0.25 * em;
    if (centred) {
      // Full when the next line's first word would not have fitted in the page's width.
      if (!startsAsParagraph && above.right - above.x + space + firstWord(under) > pageRight - pageLeft - em) {
        previousOf.set(index, at);
        taken.add(at);
        paragraphOf[index] = paragraphOf[at]!;
      }
      continue;
    }
    if (rightAligned) {
      // Full when the next line's first word would not have fitted on its left: up to a column beside it on the rows of the
      // paragraph so far, else the page's left edge.
      const top = lines[paragraphOf[at]!]!.y;
      let near = pageLeft;
      band(byY, line => line.y, under.y - 0.5 * em, top + 0.5 * em, line => {
        if (line !== above && line !== under && line.right <= Math.min(above.x, under.x) - 0.5) near = Math.max(near, line.right + 0.5 * em);
      });
      if (startsAsParagraph && near <= pageLeft + 0.01) continue;
      if (above.x - space - firstWord(under) < near + 0.5 * em) {
        previousOf.set(index, at);
        taken.add(at);
        paragraphOf[index] = paragraphOf[at]!;
      }
      continue;
    }
    // The right edge of the column: the page's (as wide as its left margin), the next column's on the rows of the paragraph so far
    // (from its first line down to this one), else on the page.
    const paragraphTop = lines[paragraphOf[at]!]!.y;
    let near = pageRight;
    band(byY, line => line.y, under.y - 0.5 * em, paragraphTop + 0.5 * em, line => {
      if (line !== above && line !== under && line.x >= Math.max(above.right, under.right) + 0.5) near = Math.min(near, line.x - 0.5 * em);
    });
    let widest = above.right;
    band(byX, line => line.x, under.x - 0.5 * em, under.x + 0.5 * em, line => { if (line.right <= near + 0.5 * em) widest = Math.max(widest, line.right); });
    // A column beside it a little above or under: the nearest left edge past those lines, within two em of the paragraph.
    let nextColumn = Infinity;
    band(byY, line => line.y, under.y - 2 * em, paragraphTop + 2 * em, line => {
      if (line.x >= widest + 0.5) nextColumn = Math.min(nextColumn, line.x);
    });
    const room = nextColumn < near ? Math.min(near, nextColumn - 0.5 * em) : near;
    // The room left, half an em less: up to the page's right margin, as wide as its left one (its margins may differ), or up to a
    // column beside it (the margins of two cells); without a column beside it and with paragraph spacing seen on the page, the
    // widest line of that left edge when it fills three fifths of that room (a text box, a narrower block).
    const besideColumn = room < pageRight - 0.01;
    if (startsAsParagraph && !besideColumn) continue;
    const right = (!besideColumn && pitch.spaced && widest - under.x >= FILLED * (room - under.x) ? Math.min(widest, room) : room) - 0.5 * em;
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
