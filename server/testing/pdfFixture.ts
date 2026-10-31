/** TEST-ONLY: rewrites PDF fixtures in memory. Never imported by production code. */
import { readFileSync } from "node:fs";
import { constants, deflateSync } from "node:zlib";

/** A real CV exported by LibreOffice Writer 24.2 (`soffice --convert-to pdf`): compressed page content and fonts, `/OpenAction [1 0 R /XYZ …]`. */
export function libreOfficeCvPdf() {
  return readFileSync(new URL("./fixtures/cv-libreoffice.pdf", import.meta.url));
}

/** A Chinese CV exported by LibreOffice 24.2 the same way: the compressed data of its embedded Chinese font holds the bytes "/JS" (REC-02). */
export function libreOfficeChineseCvPdf() {
  return readFileSync(new URL("./fixtures/cv-libreoffice-zh.pdf", import.meta.url));
}

/**
 * A classic PDF (xref table) whose objects are numbered from 1 in the order
 * given; the first one is the catalog.
 */
export function classicPdf(objects: string[]) {
  let output = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  const offsets = objects.map((body, index) => {
    const offset = output.length;
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  output += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

/** The last trailer of a PDF: where its xref section starts, its catalog and its /Size. */
function lastTrailer(source: string) {
  const previous = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(source)?.[1];
  const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(source.slice(source.lastIndexOf("/Root")))?.[1];
  if (!previous || !root) throw new Error("fixture without startxref or /Root");
  return { previous, root, size: Number(/\/Size\s+(\d+)/.exec(source.slice(source.lastIndexOf("/Size")))?.[1] ?? 0) };
}

const xrefEntry = (number: number, offset: number) => `${number} 1\n${String(offset).padStart(10, "0")} 00000 n \n`;

/** An object written by the helpers below; `header` replaces its "N 0 obj" (pdf.js also reads "N 0.obj"). */
type FixtureObject = { number: number; body: string; header?: string };

const objectText = (object: FixtureObject) => `${object.header ?? `${object.number} 0 obj`}\n${object.body}\nendobj`;

/**
 * Appends an incremental update (ISO 32000-1, 7.5.6), as Acrobat, pypdf or
 * an online editor write one to rotate pages or fill in a form: the objects
 * given are written again after the end of the file, with their own xref
 * section and a trailer that points to the previous one.
 */
export function saveIncrementally(pdf: Buffer, objects: FixtureObject[]) {
  const source = pdf.toString("latin1");
  const { previous, root, size } = lastTrailer(source);
  let output = source.endsWith("\n") ? source : `${source}\n`;
  const entries = objects.map(object => {
    const entry = xrefEntry(object.number, output.length);
    output += `${objectText(object)}\n`;
    return entry;
  });
  const xref = output.length;
  output += `xref\n${entries.join("")}trailer\n<</Size ${Math.max(size, ...objects.map(object => object.number + 1))}/Root ${root}/Prev ${previous}>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

/** Appends objects after %%EOF without any xref section or trailer: pdf.js, which follows the xref, never reads them. */
export function appendWithoutXref(pdf: Buffer, objects: FixtureObject[]) {
  return Buffer.concat([pdf, Buffer.from(objects.map(object => `${objectText(object)}\n`).join(""), "latin1")]);
}

/**
 * Appends a stream object, number 90, whose data holds `hidden` after its
 * zlib data, before `endstream`: pdf.js reads an object or an xref section
 * written there when an xref offset points to it, whatever surrounds it.
 */
function appendStreamHiding(source: string, hidden: string) {
  const data = deflateSync(Buffer.from("q Q")).toString("latin1");
  const head = `90 0 obj\n<</Length ${data.length}/Filter/FlateDecode>>\nstream\n${data}\n`;
  return { output: `${source}${head}${hidden}\nendstream\nendobj\n`, streamOffset: source.length, hiddenOffset: source.length + head.length };
}

/** `object` written inside the data of another stream, where the xref points to it; `others` are saved before, in their own update. */
export function withObjectInStreamData(pdf: Buffer, object: FixtureObject, others: FixtureObject[] = []) {
  const source = (others.length > 0 ? saveIncrementally(pdf, others) : pdf).toString("latin1");
  const { previous, root, size } = lastTrailer(source);
  const { output, streamOffset, hiddenOffset } = appendStreamHiding(source, objectText(object));
  return Buffer.from(`${output}xref\n${xrefEntry(90, streamOffset)}${xrefEntry(object.number, hiddenOffset)}trailer\n<</Size ${Math.max(size, 91, object.number + 1)}/Root ${root}/Prev ${previous}>>\nstartxref\n${output.length}\n%%EOF\n`, "latin1");
}

/** An xref section and its trailer, whose catalog is the direct dictionary `root`, written inside the data of a stream, where startxref points. */
export function withTrailerInStreamData(pdf: Buffer, root: string) {
  const source = pdf.toString("latin1");
  const { previous, size } = lastTrailer(source);
  const { output, hiddenOffset } = appendStreamHiding(source, `xref\n${xrefEntry(90, source.length)}trailer\n<</Size ${Math.max(size, 91)}/Prev ${previous}/Root ${root}>>`);
  return Buffer.from(`${output}startxref\n${hiddenOffset}\n%%EOF\n`, "latin1");
}

/** A grey page of four lines, 16×22 pixels, as Pillow saves it in baseline JPEG: the image of a scanned page, which pdf.js decodes. */
const SCANNED_PAGE_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAWABABAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APYLyXVUmAsbOzni28tPdtEwPpgRtx05z+FFnLqrzEX1nZwRbeGgu2lYn0wY14685/CqOs6V9uvEl/sDRtQxGF82+k2uOT8o/dPxznr3PFGjaV9hvHl/sDRtPzGV82xk3OeR8p/dJxxnr2HFXrzRdK1GYTX2mWd1Kq7Q88CuwHXGSOnJ/Oiz0XStOmM1jplnaysu0vBAqMR1xkDpwPyr/9k=",
  "base64",
);

/**
 * What the image data of honest scans held where the PDF check took an
 * `obj` for an object (REC-02), as ASCII85 writes it: "Oobj[" in a reportlab
 * scan refused from 12 pages on, "]5obj[" as in the tables of Pillow's
 * JPEGs, and an `obj` followed by "/JS". Read as values, the first two ran
 * into the next stream (the whole file "unclear"), the last one made the
 * image's data searched, where "/JS" was found.
 */
export const IMAGE_DATA_OBJ_KEYWORDS = ["Oobj[", "!!!!]5obj[", "!!!!]5obj/JS!!!"];

/** ASCII85 (ISO 32000-1, 7.4.3) of `data`, the way reportlab writes it: one line, then "~>". */
function ascii85(data: Buffer) {
  let text = "";
  for (let offset = 0; offset < data.length; offset += 4) {
    const group = Buffer.alloc(4);
    data.copy(group, 0, offset, offset + 4);
    const length = Math.min(4, data.length - offset);
    let value = group.readUInt32BE(0);
    if (value === 0 && length === 4) {
      text += "z";
      continue;
    }
    const digits: string[] = [];
    for (let index = 0; index < 5; index += 1, value = Math.floor(value / 85)) digits.unshift(String.fromCharCode(33 + (value % 85)));
    text += digits.slice(0, length + 1).join("");
  }
  return `${text}~>`;
}

/** The bytes that ASCII85 writes as `text`, made of whole groups of five characters. */
function ascii85Bytes(text: string) {
  const bytes = Buffer.alloc((text.length / 5) * 4);
  for (let group = 0; group * 5 < text.length; group += 1) {
    const value = Array.from(text.slice(group * 5, group * 5 + 5)).reduce((total, char) => total * 85 + char.charCodeAt(0) - 33, 0);
    bytes.writeUInt32BE(value, group * 4);
  }
  return bytes;
}

/**
 * The JPEG of a scanned page `index`: SCANNED_PAGE_JPEG, comment segments
 * of pseudo-random bytes up to about `bytes` bytes (the compressed pixels of
 * a real page), and after its end, as a phone's motion photo or a scanner's
 * trailer do, the bytes that the encoding chosen writes as `keyword`: at the
 * very end of the stream data, whatever follows them in the JPEG cannot end
 * the value read after them.
 */
function scannedPageJpeg(index: number, bytes: number, keyword: string, ascii85Encoded: boolean) {
  let seed = index * 2_654_435_761 + 1;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed & 0xff;
  };
  const comments: Buffer[] = [];
  for (let left = bytes - SCANNED_PAGE_JPEG.length; left > 0; left -= 65_533) {
    const length = Math.min(65_533, left);
    const segment = Buffer.alloc(length + 4);
    segment.writeUInt16BE(0xfffe, 0);
    segment.writeUInt16BE(length + 2, 2);
    for (let at = 4; at < segment.length; at += 1) segment[at] = random();
    comments.push(segment);
  }
  const jpeg = Buffer.concat([SCANNED_PAGE_JPEG.subarray(0, 2), ...comments, SCANNED_PAGE_JPEG.subarray(2)]);
  // ASCII85 writes each group of four bytes as five characters: the keyword's groups start on a multiple of four.
  if (!ascii85Encoded) return Buffer.concat([jpeg, Buffer.from(keyword, "latin1")]);
  return Buffer.concat([jpeg, Buffer.alloc((4 - (jpeg.length % 4)) % 4), ascii85Bytes(keyword)]);
}

/**
 * A scanned document of `pages` pages laid out as reportlab writes it (each
 * page image, then its page; the content streams last): one JPEG per page,
 * ASCII85-encoded (/Filter [/ASCII85Decode /DCTDecode], reportlab's
 * default) or as raw bytes (/DCTDecode, img2pdf or a scanner), whose data
 * ends with the `keywords` in turn (all of IMAGE_DATA_OBJ_KEYWORDS by
 * default). Each page also writes a line of text, for pdf.js to read the
 * file without OCR.
 */
export function scannedPdf(pages: number, options: { ascii85?: boolean; pageBytes?: number; keywords?: string[] } = {}) {
  const ascii85Encoded = options.ascii85 ?? true;
  const keywords = options.keywords ?? IMAGE_DATA_OBJ_KEYWORDS;
  const firstContent = 3 + pages * 2;
  const objects = [
    "<<\n/Pages 2 0 R /Type /Catalog\n>>",
    `<<\n/Count ${pages} /Kids [ ${Array.from({ length: pages }, (_, index) => `${4 + index * 2} 0 R`).join(" ")} ] /Type /Pages\n>>`,
  ];
  for (let index = 0; index < pages; index += 1) {
    const jpeg = scannedPageJpeg(index, options.pageBytes ?? SCANNED_PAGE_JPEG.length, keywords[index % keywords.length]!, ascii85Encoded);
    const data = ascii85Encoded ? ascii85(jpeg) : jpeg.toString("latin1");
    const filter = ascii85Encoded ? "[ /ASCII85Decode /DCTDecode ]" : "/DCTDecode";
    objects.push(`<<\n/BitsPerComponent 8 /ColorSpace /DeviceGray /Filter ${filter} /Height 22 /Length ${data.length} /Subtype /Image\n  /Type /XObject /Width 16\n>>\nstream\n${data}\nendstream`);
    objects.push(`<<\n/Contents ${firstContent + index} 0 R /MediaBox [ 0 0 595.2756 841.8898 ] /Parent 2 0 R /Resources <<\n/Font << /F1 ${firstContent + pages} 0 R >> /XObject <<\n/Im${index} ${3 + index * 2} 0 R\n>>\n>> /Type /Page\n>>`);
  }
  for (let index = 0; index < pages; index += 1) {
    const content = `q\n535 0 0 736 30 76 cm\n/Im${index} Do\nQ\nBT /F1 11 Tf 30 40 Td (Dr Camille Martin, anesthesiste-reanimateur, page ${index + 1}) Tj ET\n`;
    objects.push(`<<\n/Length ${content.length}\n>>\nstream\n${content}endstream`);
  }
  objects.push("<<\n/BaseFont /Helvetica /Encoding /WinAnsiEncoding /Subtype /Type1 /Type /Font\n>>");
  return classicPdf(objects);
}

/** How the PDF checks must answer a file of `pathologicalPdfs`: accept it (one page), or refuse it with this reason. */
export type PathologicalPdfOutcome = "accepted" | "object_stream_unreadable" | "stream_count_exceeded" | "decompressed_size_exceeded";

/**
 * 4 MB PDFs made to keep a naive check busy for minutes (REC-02): each must
 * be judged in well under a second. The first three objects are a real page.
 */
export function pathologicalPdfs(): Array<{ label: string; pdf: Buffer; outcome: PathologicalPdfOutcome }> {
  const size = 4 * 1024 * 1024;
  const head = "%PDF-1.7\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj ";
  const filled = (unit: string, tail = "") => Buffer.from(head + unit.repeat(Math.floor((size - head.length - tail.length) / unit.length)) + tail, "latin1");
  // zlib header, then empty stored blocks: data that inflates to nothing and runs on over the next keywords.
  const chained = Array.from({ length: 2_000 }, () => `\nstream\nx\x01${"\x00\x00\x00\xff\xff".repeat(400)}`).join("");
  const objectStream = (dictionary: string) => Buffer.concat([Buffer.from(`${head}9 0 obj<<${dictionary}>>stream\n`, "latin1"), deflateSync(Buffer.from("4 0 <</A 1>>")), Buffer.from("\nendstream endobj\n", "latin1")]);
  // As many streams as fit, each with its own object number.
  const streams = (dictionary: string, data: Buffer) => {
    const parts: Buffer[] = [Buffer.from(head, "latin1")];
    for (let total = head.length, number = 10; total + data.length + dictionary.length + 64 < size; number += 1) {
      parts.push(Buffer.from(`${number} 0 obj<<${dictionary}>>stream\n`, "latin1"), data, Buffer.from("\nendstream endobj\n", "latin1"));
      total += data.length + dictionary.length + 64;
    }
    return Buffer.concat(parts);
  };
  const image = "/Type/XObject/Subtype/Image/Width 2000/Height 4000/BitsPerComponent 8/ColorSpace/DeviceGray/Filter/FlateDecode";
  // 39 MB of zeros, then an invalid block: zlib data that turns out corrupt once inflated.
  const corrupt = Buffer.concat([deflateSync(Buffer.alloc(39_000_000), { level: 9, finishFlush: constants.Z_SYNC_FLUSH }), Buffer.from([0xff])]);
  return [
    { label: "« stream » répété sans fin de ligne", pdf: filled("stream "), outcome: "accepted" },
    { label: "« stream » répété sur une seule ligne", pdf: filled("stream ", "\n"), outcome: "object_stream_unreadable" },
    { label: "noms échappés #XX", pdf: filled("/#41"), outcome: "accepted" },
    { label: "données zlib qui couvrent les flux suivants", pdf: Buffer.from(head + chained, "latin1"), outcome: "stream_count_exceeded" },
    { label: "800 000 clés /F dans un flux d’objets", pdf: objectStream(`/Type/ObjStm/N 1/First 4${"/F/Fl".repeat(Math.floor((size - head.length - 256) / 5))}`), outcome: "accepted" },
    { label: "images de 62 Ko qui se gonflent à leur taille déclarée, 64 Mo", pdf: streams(image, deflateSync(Buffer.alloc(64_000_000), { level: 9 })), outcome: "decompressed_size_exceeded" },
    { label: "images dont les données se gonflent à 39 Mo puis sont corrompues", pdf: streams(image, corrupt), outcome: "decompressed_size_exceeded" },
    { label: "flux dont les données se gonflent à 39 Mo puis sont corrompues", pdf: streams("/Filter/FlateDecode", corrupt), outcome: "decompressed_size_exceeded" },
  ];
}

/**
 * PNG prediction (/DecodeParms << /Predictor 12 /Columns n >>) of `data` in
 * rows of `columns` bytes, `pixelBytes` per pixel, the row types taken in
 * turn from `types` (0 none, 1 sub, 2 up, 3 average, 4 Paeth); the last row
 * is completed with zeros, which pdf.js reads as white-space.
 */
export function pngPredict(data: Buffer, columns: number, types: number[], pixelBytes = 1) {
  const rows: Buffer[] = [];
  let previous = Buffer.alloc(columns);
  for (let row = 0; row * columns < data.length; row += 1) {
    const current = Buffer.alloc(columns);
    data.copy(current, 0, row * columns, (row + 1) * columns);
    const type = types[row % types.length]!;
    const encoded = Buffer.alloc(columns + 1, type);
    for (let index = 0; index < columns; index += 1) {
      const left = index >= pixelBytes ? current[index - pixelBytes]! : 0;
      const up = previous[index]!;
      const upLeft = index >= pixelBytes ? previous[index - pixelBytes]! : 0;
      const estimate = left + up - upLeft;
      const paeth = Math.abs(estimate - left) <= Math.abs(estimate - up) && Math.abs(estimate - left) <= Math.abs(estimate - upLeft) ? left
        : Math.abs(estimate - up) <= Math.abs(estimate - upLeft) ? up : upLeft;
      const predicted = [0, left, up, (left + up) >> 1, paeth][type]!;
      encoded[index + 1] = (current[index]! - predicted) & 0xff;
    }
    rows.push(encoded);
    previous = current;
  }
  return Buffer.concat(rows);
}

type PdfObject = { number: number; body: string; isStream: boolean };

function readObjects(source: string) {
  const objects: PdfObject[] = [];
  const objectStart = /(\d+)\s+0\s+obj\b/g;
  let match: RegExpExecArray | null;
  while ((match = objectStart.exec(source))) {
    const bodyStart = match.index + match[0].length;
    let end = source.indexOf("endobj", bodyStart);
    const streamAt = source.indexOf("stream", bodyStart);
    const isStream = streamAt !== -1 && streamAt < end;
    if (isStream) end = source.indexOf("endobj", source.indexOf("endstream", streamAt));
    objects.push({ number: Number(match[1]), body: source.slice(bodyStart, end), isStream });
    objectStart.lastIndex = end + "endobj".length;
  }
  return objects;
}

/**
 * Saves a classic PDF the way pdf-lib (default settings), Acrobat
 * "optimised" or Word do: every object that is not a stream moves into one
 * compressed object stream, and the xref table becomes an xref stream. The
 * page and action dictionaries are then absent from the raw bytes.
 * `edit` changes the source first (to plant an action); `objectStream`
 * changes how the object stream is written.
 */
export function packPdfIntoObjectStream(pdf: Buffer, options: {
  edit?: (source: string) => string;
  objectStream?: { dictionary?: string; encode?: (content: Buffer) => Buffer };
} = {}) {
  const source = (options.edit ?? (value => value))(pdf.toString("latin1"));
  const trailer = source.slice(source.lastIndexOf("trailer"));
  const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(trailer)?.[1];
  if (!root) throw new Error("fixture without /Root");
  const info = /\/Info\s+(\d+\s+\d+\s+R)/.exec(trailer)?.[1];
  const objects = readObjects(source.slice(0, source.lastIndexOf("xref")));
  const packed = objects.filter(object => !object.isStream);
  const objectStreamNumber = Math.max(...objects.map(object => object.number)) + 1;
  const xrefNumber = objectStreamNumber + 1;

  let output = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  const offsets = new Map<number, number>();
  for (const object of objects.filter(item => item.isStream)) {
    offsets.set(object.number, output.length);
    output += `${object.number} 0 obj${object.body}endobj\n`;
  }
  let header = "";
  let bodies = "";
  for (const object of packed) {
    header += `${object.number} ${bodies.length} `;
    bodies += `${object.body.trim()}\n`;
  }
  const encoded = (options.objectStream?.encode ?? deflateSync)(Buffer.from(header + bodies, "latin1"));
  const dictionary = options.objectStream?.dictionary ?? "/Type/ObjStm/Filter/FlateDecode";
  offsets.set(objectStreamNumber, output.length);
  output += `${objectStreamNumber} 0 obj\n<<${dictionary}/N ${packed.length}/First ${header.length}/Length ${encoded.length}>>\nstream\n${encoded.toString("latin1")}\nendstream\nendobj\n`;

  offsets.set(xrefNumber, output.length);
  const rows = Buffer.alloc((xrefNumber + 1) * 7);
  for (let number = 0; number <= xrefNumber; number += 1) {
    const row = number * 7;
    const packedIndex = packed.findIndex(object => object.number === number);
    if (offsets.has(number)) {
      rows.writeUInt8(1, row);
      rows.writeUInt32BE(offsets.get(number)!, row + 1);
    } else if (packedIndex >= 0) {
      rows.writeUInt8(2, row);
      rows.writeUInt32BE(objectStreamNumber, row + 1);
      rows.writeUInt16BE(packedIndex, row + 5);
    } else {
      rows.writeUInt16BE(number === 0 ? 0xffff : 0, row + 5);
    }
  }
  const xref = deflateSync(rows);
  output += `${xrefNumber} 0 obj\n<</Type/XRef/Size ${xrefNumber + 1}/W[1 4 2]/Root ${root}${info ? `/Info ${info}` : ""}/Filter/FlateDecode/Length ${xref.length}>>\nstream\n${xref.toString("latin1")}\nendstream\nendobj\n`;
  output += `startxref\n${offsets.get(xrefNumber)}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}
