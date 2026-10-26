/**
 * PDF text a reader sees (IA-01), decided by attributing ink to each text
 * operation of the page rather than by looking at the pixels where a word
 * sits: text laid exactly over a visible line in render mode 3, at opacity 0
 * or in white would pass that test, the visible line's pixels being there.
 *
 * The page is drawn once as it is (A), then again with a set of its text
 * operations drawn without their glyphs, still advancing as pdf.js does (B).
 * An operation is visible when A and B differ inside its box with ink that
 * stands out from the colours around it in B: its own ink. This covers white
 * on white, covered or clipped text, render mode 3, opacity 0, layers
 * switched off and text laid over visible text; white text drawn over dark
 * text only erases strokes, and is not counted as ink. Operations hidden in
 * the same B do not overlap; overlapping ones go to different renders
 * (greedy colouring), so that a few renders per page are enough, at most
 * `maxRenders`. The same text drawn again at the same place (fake bold, or an
 * invisible copy laid on its visible line, even at another horizontal scale)
 * is hidden with its first copy and kept once, never counted as hidden text;
 * operations that only show ink together are drawn one at a time, and the
 * text of those that ink kept once.
 *
 * Inside a visible operation (one per line in ReportLab, PDFKit, Word or
 * LibreOffice exports), each word is then judged on its own ink: a word
 * without any (covered, even by a nearly opaque shape, clipped or off the
 * page) is text without ink, and a word with far less ink than the words of
 * the page usually have (mostly covered, or left with a few specks) is set
 * aside as unverifiable, as is a word without ink where other text or lines
 * are drawn (it may only be lost in them), and a sign or a lone letter or
 * digit without ink, which may be too thin to show at this resolution.
 *
 * Text without ink lying on a picture that shows marks there (the OCR layer
 * of a scan, or text under a photo) cannot be told visible or not, nor can a
 * sign or a lone digit on a picture (too thin to show there): it is set aside
 * as unverifiable, like text in a font pdf.js cannot load (drawn with the
 * host's fonts, if any), text the reader could not match with its drawing,
 * and text left unchecked for lack of time. Unverifiable text is never
 * counted as hidden text.
 *
 * The work is counted, not timed (`budget`, shared by the pages of a file):
 * a render costs RENDER_UNITS plus one unit per drawing operation of the
 * page, the first one also the pixels of the pictures it decodes. A file thus
 * always gives the same text, whatever the load of the machine; `deadline`
 * only guards against a host far slower than planned.
 *
 * This function runs in the isolated PDF reader's worker, whose source
 * includes it through Function.prototype.toString: it must not use anything
 * defined outside its own body.
 */

export type PdfUnverifiableReason = "faint" | "font" | "image" | "unfinished" | "unmatched";
export type PdfVisibilityFindings = {
  invisibleText: string[];
  unverifiableText: Array<{ page: number; reason: PdfUnverifiableReason; text: string }>;
};

type TextItem = { str?: string; dir?: string; transform: number[]; width: number; height?: number; fontName?: string; hasEOL?: boolean };
type TextContent = { items: TextItem[]; styles?: Record<string, { vertical?: boolean }> };
type PdfFont = { missingFile?: boolean; isInvalidPDFjsFont?: boolean; isType3Font?: boolean; bbox?: number[]; fontMatrix?: number[]; charProcOperatorList?: Record<string, unknown> };
type Glyph = { unicode?: string; width?: number; isInFont?: boolean; operatorListId?: unknown } | number | null;
type OperatorList = { fnArray: number[]; argsArray: unknown[][]; lastChunk?: boolean };
type Viewport = { width: number; height: number; scale: number; transform: number[] };
type CanvasAndContext = { canvas: { width: number; height: number }; context: { getImageData(x: number, y: number, width: number, height: number): { data: ArrayLike<number> } } };
type PdfPage = {
  getViewport(options: { scale: number }): Viewport;
  render(options: Record<string, unknown>): { promise: Promise<void> };
  commonObjs: { has(name: string): boolean; get(name: string): PdfFont };
  _intentStates?: Map<string, { operatorList?: OperatorList }>;
};
type CanvasFactory = { create(width: number, height: number): CanvasAndContext; destroy(target: CanvasAndContext): void };

export async function visibleTextContent(
  page: PdfPage,
  content: TextContent,
  canvasFactory: CanvasFactory,
  findings: PdfVisibilityFindings,
  options: { pageNumber: number; deadline: number; maxRenders?: number; budget?: { units: number } },
): Promise<{ content: TextContent; complete: boolean }> {
  const MIN_FONT_SIZE_PT = 4;
  // Average advance of a character below which text is squashed out of sight.
  const MIN_ADVANCE_PT = 1;
  const MIN_CONTRAST = 32;
  // Difference from its usual colour above which a picture under text without ink may show that text.
  const MARK_CONTRAST = 28;
  const MIN_INK_PIXELS = 2;
  const MAX_RENDER_PIXELS = 2_000_000;
  const MAX_RENDERS = options.maxRenders ?? 12;
  // Units of `budget` (see above): a render costs about what drawing 5,000 operations does, plus one unit per
  // operation of the page; the first one also parses them (one more unit each) and decodes the pictures
  // (one unit per 150 pixels).
  const RENDER_UNITS = 5_000;
  const IMAGE_PIXELS_PER_UNIT = 150;
  // A word of a visible operation is faint below this share of the usual ink of the page's words (their
  // median, per pixel of their glyphs' boxes; honest words keep more than half of it), or below this ink
  // per pixel whatever the page (a page of specks; honest words have 0.18 or more).
  const FAINT_SHARE = 0.2;
  const MIN_INK_DENSITY = 0.05;
  // Glyphs the text layer leaves out (off the page, format marks) skipped while matching it with the drawing.
  const ALIGN_WINDOW = 8;
  // Operator codes of pdf.js 5.4.296 (OPS), the version pdf-parse pins.
  const OP = { save: 10, restore: 11, endPath: 28, clip: 29, eoClip: 30, setTextRenderingMode: 38, showText: 44, shadingFill: 62, formBegin: 74, formEnd: 75, groupBegin: 76, groupEnd: 77, annotationBegin: 80, annotationEnd: 81, imageMask: 83, image: 85, inlineImage: 86, constructPath: 91 };
  const IMAGE_OPS = new Set([83, 84, 85, 86, 87, 88, 89, 90]);
  const INVISIBLE_MODE = 3;
  const HIDDEN_CHAR_PROC = "pdfVisibleTextHidden";
  const SPACE = new RegExp("\\s", "u");
  const LETTER = new RegExp("[\\p{L}\\p{N}]", "u");
  // One ideograph is one word, as in the text layer pdf.js builds.
  const IDEOGRAPH = new RegExp("[\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af]", "u");
  // What pdf.js's normalizeUnicode does to the text layer, applied to the glyphs drawn.
  const NORMALIZED = new RegExp("([\\u00a0\\u00b5\\u037e\\u0eb3\\u2000-\\u200a\\u202f\\u2126\\ufb00-\\ufb04\\ufb06\\ufb20-\\ufb36\\ufb38-\\ufb3c\\ufb3e\\ufb40-\\ufb41\\ufb43-\\ufb44\\ufb46-\\ufba1\\ufba4-\\ufba9\\ufbae-\\ufbb1\\ufbd3-\\ufbdc\\ufbde-\\ufbe7\\ufbea-\\ufbf8\\ufbfc-\\ufbfd\\ufc00-\\ufc5d\\ufc64-\\ufcf1\\ufcf5-\\ufd3d\\ufd88\\ufdf4\\ufdfa-\\ufdfb\\ufe71\\ufe77\\ufe79\\ufe7b\\ufe7d]+)|(\\ufb05+)", "gu");
  const normalize = (text: string) => text.replace(NORMALIZED, (_, compatible: string | undefined, longSt: string | undefined) => compatible ? compatible.normalize("NFKC") : "\u017ft".repeat(longSt!.length));

  type Box = [number, number, number, number];
  type Char = { text: string; space: boolean; q: number; a: number; b: number; status: string };
  type Segment = { op: number; chars: Char[]; box: Box; core: Box; a: number; b: number; ink: number; cluttered: boolean };
  type Line = { item: TextItem; chars: Char[]; segments: Segment[]; up: number };
  type Operation = { chars: Char[]; segments: Segment[]; box: Box; up: number; font: PdfFont | null; mode: number; ink: number; result: string };
  const area = (box: Box) => Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);

  const lines: Array<Line | null> = content.items.map(item => {
    if (typeof item.str !== "string" || !item.str.trim()) return null;
    return { item, chars: Array.from(item.str, text => ({ text, space: SPACE.test(text), q: -1, a: 0, b: 0, status: "visible" })), segments: [], up: 0 };
  });
  const textChars = () => lines.flatMap(line => line ? line.chars.filter(char => !char.space) : []);
  if (textChars().length === 0) return { content, complete: true };

  /** The text layer of the page, without the characters not marked visible, which go to `findings`. */
  const assemble = (complete: boolean) => {
    const items = content.items.map((item, index) => {
      const line = lines[index];
      if (!line || line.chars.every(char => char.space || char.status === "visible")) return item;
      let str = "";
      const words: Record<string, string[]> = {};
      const pending: Record<string, string> = {};
      const flush = () => {
        for (const [status, word] of Object.entries(pending)) if (word) (words[status] ??= []).push(word);
        for (const status of Object.keys(pending)) pending[status] = "";
      };
      for (const char of line.chars) {
        if (char.space) {
          str += char.text;
          flush();
        } else if (char.status === "visible") {
          str += char.text;
        } else {
          pending[char.status] = (pending[char.status] ?? "") + char.text;
        }
      }
      flush();
      for (const [status, found] of Object.entries(words)) {
        if (status === "invisible") findings.invisibleText.push(found.join(" "));
        else if (status.startsWith("unverifiable:")) findings.unverifiableText.push({ page: options.pageNumber, reason: status.slice(13) as PdfUnverifiableReason, text: found.join(" ") });
        // "duplicate": the same text drawn again at the same place, kept once.
      }
      return { ...item, str };
    });
    return { content: { ...content, items }, complete };
  };
  const setAside = (status: string) => {
    for (const char of textChars()) if (char.status === "visible") char.status = status;
  };

  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(1, Math.sqrt(MAX_RENDER_PIXELS / (base.width * base.height))) });
  const target = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const { width, height } = target.canvas;
  let renders = 0;
  // Units of a render of this page, once its operations are known (after the first one).
  let renderUnits = RENDER_UNITS;
  const charge = (units: number) => {
    if (options.budget) options.budget.units -= units;
  };
  const canRender = (count = 1) => renders + count <= MAX_RENDERS && (options.budget?.units ?? Infinity) >= count * renderUnits && Date.now() < options.deadline;
  const draw = async (operationsFilter: ((index: number) => boolean) | null) => {
    await page.render({ canvasContext: target.context, viewport, canvas: target.canvas, operationsFilter }).promise;
    renders += 1;
    charge(renderUnits);
    return target.context.getImageData(0, 0, width, height).data;
  };
  try {
    const drawn = await draw(null);
    let operatorList: OperatorList | null = null;
    for (const state of Array.from(page._intentStates?.values() ?? [])) {
      if (state.operatorList?.lastChunk && state.operatorList.fnArray.length) operatorList = state.operatorList;
    }
    if (!operatorList) {
      setAside("unverifiable:unmatched");
      return assemble(true);
    }
    const { fnArray, argsArray } = operatorList;

    // The glyphs drawn, in order, with the text rendering mode of each text operation.
    const stream: Array<{ op: number; glyph: number; ch: string }> = [];
    const modes = new Map<number, number>();
    const modeStack: number[] = [];
    let mode = 0;
    let hasImages = false;
    let imagePixels = 0;
    for (let index = 0; index < fnArray.length; index += 1) {
      const fn = fnArray[index];
      if (fn === OP.save || fn === OP.formBegin || fn === OP.groupBegin || fn === OP.annotationBegin) modeStack.push(mode);
      else if (fn === OP.restore || fn === OP.formEnd || fn === OP.groupEnd || fn === OP.annotationEnd) mode = modeStack.pop() ?? mode;
      else if (fn === OP.setTextRenderingMode) mode = Number(argsArray[index]![0]);
      else if (IMAGE_OPS.has(fn)) {
        hasImages = true;
        // An image XObject is drawn from [id, width, height], an inline image or a mask from its data.
        const args = argsArray[index]!;
        const data = args[0] as { width?: unknown; height?: unknown } | null;
        const pixels = fn === OP.image ? Number(args[1]) * Number(args[2]) : (fn === OP.inlineImage || fn === OP.imageMask) && data && typeof data === "object" ? Number(data.width) * Number(data.height) : 0;
        if (Number.isFinite(pixels) && pixels > 0) imagePixels += pixels;
      } else if (fn === OP.showText) {
        modes.set(index, mode);
        (argsArray[index]![0] as Glyph[]).forEach((glyph, position) => {
          if (!glyph || typeof glyph !== "object") return;
          for (const ch of normalize(String(glyph.unicode ?? ""))) if (!SPACE.test(ch)) stream.push({ op: index, glyph: position, ch });
        });
      }
    }
    // The first render, charged as a base render so far: its operations, drawn and parsed, and the
    // pictures it decoded.
    renderUnits = RENDER_UNITS + fnArray.length;
    charge(2 * fnArray.length + Math.ceil(imagePixels / IMAGE_PIXELS_PER_UNIT));

    // Each character of the text layer matched with the glyph that draws it: the text layer follows the
    // content stream, leaving out glyphs off the page and format marks; right-to-left text is reordered.
    let next = 0;
    const find = (char: string, from: number, to: number, anchor: Char[]) => {
      for (let q = from; q < Math.min(stream.length, to); q += 1) {
        if (stream[q]!.ch === char && anchor.every((following, offset) => stream[q + 1 + offset]?.ch === following.text)) return q;
      }
      return -1;
    };
    for (const line of lines) {
      if (!line) continue;
      const targets = line.chars.filter(char => !char.space);
      if (line.item.dir === "rtl") {
        const used = new Set<number>();
        let last = next - 1;
        for (const char of targets) {
          for (let q = next; q < Math.min(stream.length, next + targets.length + ALIGN_WINDOW); q += 1) {
            if (used.has(q) || stream[q]!.ch !== char.text) continue;
            used.add(q);
            char.q = q;
            last = Math.max(last, q);
            break;
          }
        }
        next = last + 1;
        continue;
      }
      targets.forEach((char, position) => {
        const anchor = position === 0 ? targets.slice(1, 3) : [];
        let q = find(char.text, next, next + ALIGN_WINDOW, anchor);
        if (q === -1 && position === 0) q = find(char.text, next, stream.length, anchor);
        if (q === -1) return;
        char.q = q;
        next = q + 1;
      });
    }

    // Where each character lies on the render: its glyph's advance within the operation, scaled to the
    // text item pdf.js measured, from the baseline to the font's ascent.
    const fontOf = (name: string | undefined) => (name && page.commonObjs.has(name) ? page.commonObjs.get(name) : null);
    const spans = new Map<number, Float64Array>();
    const spansOf = (op: number, scale: number) => {
      let found = spans.get(op);
      if (found) return found;
      const glyphs = argsArray[op]![0] as Glyph[];
      found = new Float64Array(glyphs.length * 2);
      let x = 0;
      glyphs.forEach((glyph, position) => {
        if (typeof glyph === "number") x -= glyph / 1000;
        found![2 * position] = x;
        if (glyph && typeof glyph === "object") x += (glyph.width ?? 0) * scale;
        found![2 * position + 1] = x;
      });
      spans.set(op, found);
      return found;
    };
    const [va, vb, vc, vd, ve, vf] = viewport.transform as [number, number, number, number, number, number];
    const operations = new Map<number, Operation>();
    for (const line of lines) {
      if (!line) continue;
      const { item, chars } = line;
      const m = item.transform;
      const t = [va * m[0]! + vc * m[1]!, vb * m[0]! + vd * m[1]!, va * m[2]! + vc * m[3]!, vb * m[2]! + vd * m[3]!, va * m[4]! + vc * m[5]! + ve, vb * m[4]! + vd * m[5]! + vf] as const;
      const along = Math.hypot(t[0], t[1]);
      const up = Math.hypot(t[2], t[3]);
      const font = fontOf(item.fontName);
      // The height of the item, and its width per character: a Type3 font keeps its scale in its own
      // matrix, which pdf.js applies to the height of the item but not to its horizontal scale.
      if (!(along > 0 && up / viewport.scale >= MIN_FONT_SIZE_PT && item.width / item.str!.length >= MIN_ADVANCE_PT)) {
        for (const char of chars) if (!char.space) char.status = "invisible";
        continue;
      }
      if (content.styles?.[item.fontName ?? ""]?.vertical) {
        for (const char of chars) if (!char.space) char.status = "unverifiable:unmatched";
        continue;
      }
      if (font && (font.missingFile || font.isInvalidPDFjsFont)) {
        for (const char of chars) if (!char.space) char.status = "unverifiable:font";
        continue;
      }
      line.up = up;
      const length = item.width * along / Math.hypot(m[0]!, m[1]!);
      const scale = font?.fontMatrix?.[0] ?? 0.001;
      const matched = chars.filter(char => char.q >= 0).sort((left, right) => left.q - right.q);
      let previousOp = -1;
      let previousEnd = 0;
      let offset = 0;
      for (const char of matched) {
        const { op, glyph } = stream[char.q]!;
        const glyphSpans = spansOf(op, scale);
        if (op !== previousOp) offset = (previousOp === -1 ? 0 : previousEnd) - glyphSpans[2 * glyph]!;
        previousOp = op;
        char.a = offset + glyphSpans[2 * glyph]!;
        char.b = previousEnd = offset + glyphSpans[2 * glyph + 1]!;
      }
      const start = Math.min(...matched.map(char => char.a));
      const extent = Math.max(...matched.map(char => char.b)) - start;
      let index = 0;
      for (const char of chars) {
        if (extent > 0 && char.q >= 0) {
          char.a = (char.a - start) * length / extent;
          char.b = (char.b - start) * length / extent;
        } else {
          // Without the glyph, its share of the item, from the right in right-to-left text.
          char.a = length * index / chars.length;
          char.b = length * (index + 1) / chars.length;
          if (item.dir === "rtl") [char.a, char.b] = [length - char.b, length - char.a];
        }
        index += 1;
        if (!char.space && char.q < 0) char.status = "unverifiable:unmatched";
      }
      const bbox = font && !font.isType3Font && font.bbox?.length === 4 ? font.bbox : null;
      const ascent = bbox ? Math.min(1.2, Math.max(0.7, bbox[3]! * (font!.fontMatrix?.[3] ?? 0.001))) : 1.05;
      const descent = bbox ? Math.max(-0.45, Math.min(-0.15, bbox[1]! * (font!.fontMatrix?.[3] ?? 0.001))) : -0.3;
      const point = (advance: number, rise: number) => [t[4] + t[0] / along * advance + t[2] / up * rise, t[5] + t[1] / along * advance + t[3] / up * rise];
      const boxOf = (a: number, b: number, pad: number): Box => {
        const corners = [point(a - pad, descent * up), point(b + pad, descent * up), point(a - pad, ascent * up), point(b + pad, ascent * up)];
        const xs = corners.map(corner => corner[0]!);
        const ys = corners.map(corner => corner[1]!);
        return [Math.max(0, Math.floor(Math.min(...xs))), Math.max(0, Math.floor(Math.min(...ys))), Math.min(width, Math.ceil(Math.max(...xs))), Math.min(height, Math.ceil(Math.max(...ys)))];
      };
      // Segments: the words of the item, an ideograph alone, split where the operation drawing them changes.
      let segment: Segment | null = null;
      for (const char of chars) {
        if (char.space || char.status !== "visible") {
          segment = null;
          continue;
        }
        const op = stream[char.q]!.op;
        if (!segment || segment.op !== op || IDEOGRAPH.test(char.text) || IDEOGRAPH.test(segment.chars.at(-1)!.text)) {
          segment = { op, chars: [], box: [0, 0, 0, 0], core: [0, 0, 0, 0], a: char.a, b: char.b, ink: 0, cluttered: false };
          line.segments.push(segment);
        }
        segment.chars.push(char);
        segment.b = Math.max(segment.b, char.b);
        segment.a = Math.min(segment.a, char.a);
      }
      for (const found of line.segments) {
        found.box = boxOf(found.a, found.b, 0.15 * up);
        // Its glyphs alone, for the ink of the word: the margin around them may hold the next word.
        found.core = boxOf(found.a, found.b, 0);
        let operation = operations.get(found.op);
        if (!operation) {
          operation = { chars: [], segments: [], box: [width, height, 0, 0], up, font, mode: modes.get(found.op) ?? 0, ink: 0, result: "" };
          operations.set(found.op, operation);
        }
        operation.chars.push(...found.chars);
        operation.segments.push(found);
        operation.up = Math.max(operation.up, up);
        // Off the page, a segment has no box: no ink can be measured there.
        if (area(found.box) > 0) operation.box = [Math.min(operation.box[0], found.box[0]), Math.min(operation.box[1], found.box[1]), Math.max(operation.box[2], found.box[2]), Math.max(operation.box[3], found.box[3])];
      }
    }

    const overlaps = (left: Box, right: Box) => left[0] < right[2] && right[0] < left[2] && left[1] < right[3] && right[1] < left[3];
    const grow = (box: Box, by: number): Box => [box[0] - by, box[1] - by, box[2] + by, box[3] + by];
    /** Greedy colouring: sets of operations whose boxes (grown by `margin` times their size) do not overlap. */
    const colour = (ops: number[], margin: number) => {
      const sets: number[][] = [];
      const boxes = sets.map(() => [] as Box[]);
      for (const op of ops) {
        const operation = operations.get(op)!;
        const box = grow(operation.box, margin * operation.up);
        let set = sets.findIndex((_, index) => !boxes[index]!.some(other => overlaps(box, other)));
        if (set === -1) {
          set = sets.push([]) - 1;
          boxes.push([]);
        }
        sets[set]!.push(op);
        boxes[set]!.push(box);
      }
      return sets;
    };

    // Ink of an operation: pixels it changed to a colour outside the range of the colours around them
    // before (B). White drawn over dark strokes only erases them, and a line drawn again over itself only
    // mixes colours already there: neither is ink.
    const ink = new Uint8Array(width * height);
    const covered = new Uint8Array(width * height);
    const differs = (left: ArrayLike<number>, l: number, right: ArrayLike<number>, r: number) =>
      Math.abs(left[l]! - right[r]!) >= MIN_CONTRAST || Math.abs(left[l + 1]! - right[r + 1]!) >= MIN_CONTRAST || Math.abs(left[l + 2]! - right[r + 2]!) >= MIN_CONTRAST;
    const measureBox = (shown: ArrayLike<number>, hidden: ArrayLike<number>, box: Box, radius: number) => {
      let count = 0;
      for (let y = box[1]; y < box[3]; y += 1) {
        for (let x = box[0]; x < box[2]; x += 1) {
          const index = y * width + x;
          const offset = index * 4;
          const red = shown[offset]!;
          const green = shown[offset + 1]!;
          const blue = shown[offset + 2]!;
          let value = 0;
          if (differs(shown, offset, hidden, offset)) {
            let lowRed = 255, lowGreen = 255, lowBlue = 255, highRed = 0, highGreen = 0, highBlue = 0;
            for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += 1) {
              for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
                const around = (yy * width + xx) * 4;
                const r = hidden[around]!, g = hidden[around + 1]!, b = hidden[around + 2]!;
                if (r < lowRed) lowRed = r;
                if (r > highRed) highRed = r;
                if (g < lowGreen) lowGreen = g;
                if (g > highGreen) highGreen = g;
                if (b < lowBlue) lowBlue = b;
                if (b > highBlue) highBlue = b;
              }
            }
            value = red <= lowRed - MIN_CONTRAST || red >= highRed + MIN_CONTRAST || green <= lowGreen - MIN_CONTRAST || green >= highGreen + MIN_CONTRAST || blue <= lowBlue - MIN_CONTRAST || blue >= highBlue + MIN_CONTRAST ? 1 : 0;
          }
          ink[index] = value;
          count += value;
        }
      }
      return count;
    };
    const countIn = (mask: Uint8Array, box: Box) => {
      let count = 0;
      for (let y = box[1]; y < box[3]; y += 1) for (let x = box[0]; x < box[2]; x += 1) count += mask[y * width + x]!;
      return count;
    };
    /** Pixels of the box away from its usual colour (its median), up to `MIN_INK_PIXELS`: a paper texture or the noise of a scan has none. */
    const marksIn = (pixels: ArrayLike<number>, box: Box) => {
      const [x0, y0, x1, y1] = box;
      const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) for (let channel = 0; channel < 3; channel += 1) histograms[channel]![pixels[(y * width + x) * 4 + channel]!]! += 1;
      const median = histograms.map(histogram => {
        let seen = 0;
        for (let value = 0; value < 256; value += 1) if ((seen += histogram[value]!) * 2 >= area(box)) return value;
        return 255;
      });
      let marks = 0;
      for (let y = y0; y < y1 && marks < MIN_INK_PIXELS; y += 1) {
        for (let x = x0; x < x1 && marks < MIN_INK_PIXELS; x += 1) {
          const offset = (y * width + x) * 4;
          if ([0, 1, 2].some(channel => Math.abs(pixels[offset + channel]! - median[channel]!) >= MARK_CONTRAST)) marks += 1;
        }
      }
      return marks;
    };
    /** Measures each operation of `ops` (and its segments) between a render showing it and one hiding it. */
    const measure = (shown: ArrayLike<number>, hidden: ArrayLike<number>, ops: number[]) => {
      for (const op of ops) {
        const operation = operations.get(op)!;
        operation.ink = measureBox(shown, hidden, operation.box, Math.min(6, Math.max(2, Math.ceil(0.1 * operation.up) + 1)));
        for (const found of operation.segments) {
          found.ink = countIn(ink, found.core);
          // A word without ink where something else is drawn (other text, a line) may only be lost in it.
          found.cluttered = found.ink < MIN_INK_PIXELS && marksIn(hidden, found.core) >= MIN_INK_PIXELS;
        }
      }
    };
    // The same text drawn again at the same place (fake bold, or a generator's double pass) is one unit:
    // its copies are hidden with it, and their text kept once. A second coat only darkens thin strokes.
    // The same place: the same line, from the same start, to an end that another horizontal scale may move
    // a little (a copy drawn after a line set at another scale keeps that scale).
    const samePlace = (left: Box, right: Box, near: number) =>
      Math.abs(left[0] - right[0]) <= near && Math.abs(left[1] - right[1]) <= near && Math.abs(left[3] - right[3]) <= near &&
      Math.abs(left[2] - right[2]) <= near + 0.05 * Math.max(left[2] - left[0], right[2] - right[0]);
    const copies = new Map<number, number[]>();
    const copyOf = new Set<number>();
    const units: Array<{ op: number; text: string; box: Box; up: number }> = [];
    for (const [op, operation] of Array.from(operations).sort(([left], [right]) => left - right)) {
      const text = operation.chars.map(char => char.text).join("");
      const near = Math.max(2, 0.1 * operation.up);
      const unit = units.find(other => other.text === text && samePlace(other.box, operation.box, near));
      if (!unit) {
        units.push({ op, text, box: operation.box, up: operation.up });
        continue;
      }
      // The unit is measured on a copy that draws something, if one does.
      const first = operations.get(unit.op)!;
      if (first.mode === INVISIBLE_MODE && operation.mode !== INVISIBLE_MODE) {
        copies.set(op, [unit.op, ...(copies.get(unit.op) ?? [])]);
        copies.delete(unit.op);
        copyOf.delete(op);
        copyOf.add(unit.op);
        unit.op = op;
      } else {
        copies.set(unit.op, [...(copies.get(unit.op) ?? []), op]);
        copyOf.add(op);
      }
    }
    /** Draws the page with these text operations, and their copies, advancing without their glyphs. */
    const drawWithout = async (shown: number[]) => {
      const ops = shown.flatMap(op => [op, ...(copies.get(op) ?? [])]);
      const saved = ops.map(op => [op, argsArray[op]!] as const);
      for (const op of ops) {
        const font = operations.get(op)?.font;
        if (font?.isType3Font && font.charProcOperatorList) font.charProcOperatorList[HIDDEN_CHAR_PROC] ??= { fnArray: [], argsArray: [], lastChunk: true };
        const glyphs = (argsArray[op]![0] as Glyph[]).map(glyph => glyph && typeof glyph === "object" ? { ...glyph, isInFont: false, operatorListId: HIDDEN_CHAR_PROC } : glyph);
        argsArray[op] = [glyphs, ...argsArray[op]!.slice(1)];
      }
      try {
        return await draw(null);
      } finally {
        for (const [op, args] of saved) argsArray[op] = args;
      }
    };

    const candidates: number[] = [];
    for (const [op, operation] of Array.from(operations)) {
      if (copyOf.has(op)) operation.result = "duplicate";
      else if (operation.mode === INVISIBLE_MODE || area(operation.box) === 0) operation.result = "noInk";
      else candidates.push(op);
    }
    candidates.sort((left, right) => left - right);
    let complete = true;
    const unfinished = (ops: number[]) => {
      complete = false;
      for (const op of ops) operations.get(op)!.result = "unfinished";
    };
    /** Each operation of each set measured against the render without that set; returns the visible ones near ink that left its box. */
    const testSets = async (sets: number[][], margin: number) => {
      const doubtful: number[] = [];
      for (const set of sets) {
        if (!canRender()) {
          unfinished(set);
          continue;
        }
        const hidden = await drawWithout(set);
        measure(drawn, hidden, set);
        // Ink of one operation that strays out of its box may have reached another one's in the same set.
        for (const op of set) {
          const [x0, y0, x1, y1] = grow(operations.get(op)!.box, 1);
          for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) covered.fill(1, y * width + Math.max(0, x0), y * width + Math.min(width, x1));
        }
        const leaks: Array<{ op: number; box: Box }> = [];
        for (const op of set) {
          const operation = operations.get(op)!;
          operation.result = operation.ink >= MIN_INK_PIXELS ? "visible" : "noInk";
          const around = grow(operation.box, Math.ceil(margin * operation.up) + 2);
          let leaked = false;
          for (let y = Math.max(0, around[1]); !leaked && y < Math.min(height, around[3]); y += 1) {
            for (let x = Math.max(0, around[0]); x < Math.min(width, around[2]); x += 1) {
              const offset = (y * width + x) * 4;
              if (!covered[y * width + x] && differs(drawn, offset, hidden, offset)) {
                leaked = true;
                break;
              }
            }
          }
          if (leaked) leaks.push({ op, box: grow(operation.box, Math.ceil(operation.up)) });
        }
        covered.fill(0);
        for (const op of set) {
          const operation = operations.get(op)!;
          if (operation.result === "visible" && leaks.some(leak => leak.op !== op && overlaps(leak.box, operation.box))) doubtful.push(op);
        }
      }
      return doubtful;
    };
    let doubtful = await testSets(colour(candidates, 0), 0.5);
    // Measured again apart from the others, as long as their ink keeps leaking.
    for (let round = 0; doubtful.length > 0 && round < 2; round += 1) doubtful = await testSets(colour(doubtful, 1), 1);
    if (doubtful.length > 0) unfinished(doubtful);

    // Operations without ink alone that overlap: a line drawn twice at the same place. Hidden together, they
    // may show ink: each is then drawn alone among them, and the text of those that ink is kept once.
    const silent = candidates.filter(op => operations.get(op)!.result === "noInk");
    const groups: number[][] = [];
    for (const op of silent) {
      const box = operations.get(op)!.box;
      const touching = groups.filter(group => group.some(other => overlaps(box, operations.get(other)!.box)));
      const merged = [op, ...touching.flat()];
      for (const group of touching) groups.splice(groups.indexOf(group), 1);
      groups.push(merged.sort((left, right) => left - right));
    }
    const stacks = groups.filter(group => group.length > 1);
    if (stacks.length > 0) {
      const rounds = Math.max(...stacks.map(group => group.length));
      if (!canRender(1 + rounds)) {
        unfinished(stacks.flat());
      } else {
        const together = await drawWithout(stacks.flat());
        measure(drawn, together, stacks.flat());
        const inking = stacks.filter(group => group.some(op => operations.get(op)!.ink >= MIN_INK_PIXELS));
        const alone = new Map<number, number>();
        for (let round = 0; round < rounds && inking.length > 0; round += 1) {
          if (!canRender()) {
            unfinished(inking.flat());
            break;
          }
          const shown = inking.map(group => group[round]).filter((op): op is number => op !== undefined);
          const drawnAlone = await drawWithout(inking.flat().filter(op => !shown.includes(op)));
          measure(drawnAlone, together, shown);
          for (const op of shown) alone.set(op, operations.get(op)!.ink);
        }
        const textOf = (op: number) => operations.get(op)!.chars.map(char => char.text).join("");
        for (const group of inking) {
          const kept: string[] = [];
          for (const op of group) {
            const operation = operations.get(op)!;
            if (operation.result === "unfinished") continue;
            if ((alone.get(op) ?? 0) < MIN_INK_PIXELS) {
              operation.result = "noInk";
            } else if (kept.includes(textOf(op))) {
              operation.result = "duplicate";
            } else {
              kept.push(textOf(op));
              operation.result = "visible";
              // Its segments were measured alone among its copies.
            }
          }
        }
      }
    }

    // Each word of a visible operation on its own ink. The usual ink of the page's words, per pixel of their
    // glyphs' boxes: a word with far less is mostly covered or left with a few specks, and cannot be said to
    // be read. A lone ideograph is left out: some have a single stroke.
    const lettersOf = (chars: Char[]) => chars.filter(char => LETTER.test(char.text)).length;
    const densityOf = (found: Segment, up: number) => found.ink / Math.max(1, Math.abs(found.b - found.a) * up);
    const densities: number[] = [];
    for (const line of lines) {
      if (!line) continue;
      for (const found of line.segments) {
        if (operations.get(found.op)!.result === "visible" && found.ink >= MIN_INK_PIXELS && lettersOf(found.chars) >= 2) densities.push(densityOf(found, line.up));
      }
    }
    densities.sort((left, right) => left - right);
    const faintBelow = Math.max(MIN_INK_DENSITY, FAINT_SHARE * (densities[densities.length >> 1] ?? 0));
    // Words without ink (covered, clipped or off the page), in runs of the same operation: hidden when
    // nothing else is drawn where they lie, as a cover leaves it.
    const silentRuns: Segment[][] = [];
    for (const line of lines) {
      if (!line) continue;
      let run: Segment[] = [];
      const close = () => {
        if (run.length > 0) silentRuns.push(run);
        run = [];
      };
      for (const found of line.segments) {
        const visible = operations.get(found.op)!.result === "visible";
        const silent = visible && found.ink < MIN_INK_PIXELS;
        if (!silent || (run.length > 0 && run.at(-1)!.op !== found.op)) close();
        if (silent) run.push(found);
        else if (visible && lettersOf(found.chars) >= 2 && densityOf(found, line.up) < faintBelow) for (const char of found.chars) char.status = "unverifiable:faint";
      }
      close();
    }

    // Text without ink: hidden, unless a picture under it shows marks there (an OCR layer on a scan).
    const silentBoxes: Array<{ box: Box; chars: Char[]; partial: boolean; cluttered: boolean; mark: (status: string) => void }> = [];
    for (const operation of Array.from(operations.values())) {
      if (operation.result === "noInk") silentBoxes.push({ box: operation.box, chars: operation.chars, partial: false, cluttered: false, mark: status => { operation.result = status; } });
    }
    for (const run of silentRuns) {
      const box = run.map(found => found.box).reduce((left, right): Box => [Math.min(left[0], right[0]), Math.min(left[1], right[1]), Math.max(left[2], right[2]), Math.max(left[3], right[3])]);
      silentBoxes.push({ box, chars: run.flatMap(found => found.chars), partial: true, cluttered: run.some(found => found.cluttered), mark: status => { for (const found of run) for (const char of found.chars) char.status = status; } });
    }
    if (silentBoxes.length > 0 && hasImages) {
      if (candidates.length > 0 && !canRender()) {
        complete = false;
        for (const silentBox of silentBoxes) silentBox.mark("unverifiable:unfinished");
      } else {
        // Pictures only: text and vector paths skipped, clipping paths kept. A page whose text has no ink
        // (a scan under its OCR layer) already shows nothing else.
        const pictures = candidates.length === 0 ? drawn : await draw(index => {
          const fn = fnArray[index];
          if (fn === OP.showText || fn === OP.shadingFill) return false;
          return fn !== OP.constructPath || argsArray[index]![0] === OP.endPath || fnArray[index - 1] === OP.clip || fnArray[index - 1] === OP.eoClip;
        });
        for (const silentBox of silentBoxes) {
          // A sign or a lone digit (the slash or page number of a scanned footer) can be too thin to show
          // marks, and says nothing alone: set aside without accusing.
          if (marksIn(pictures, silentBox.box) >= MIN_INK_PIXELS || lettersOf(silentBox.chars) < 2) silentBox.mark("unverifiable:image");
          else silentBox.mark(silentBox.cluttered ? "unverifiable:faint" : "invisible");
        }
      }
    } else {
      // In a visible line, a sign or a lone letter or digit without ink may be too thin to show at this resolution.
      for (const silentBox of silentBoxes) silentBox.mark(silentBox.partial && (silentBox.cluttered || lettersOf(silentBox.chars) < 2) ? "unverifiable:faint" : "invisible");
    }

    for (const operation of Array.from(operations.values())) {
      const status = operation.result === "unfinished" ? "unverifiable:unfinished" : operation.result === "visible" ? null : operation.result;
      if (status) for (const char of operation.chars) if (char.status === "visible") char.status = status;
    }
    return assemble(complete);
  } finally {
    canvasFactory.destroy(target);
  }
}
