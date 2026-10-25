/** TEST-ONLY: rewrites PDF fixtures in memory. Never imported by production code. */
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

/** A real CV exported by LibreOffice Writer 24.2 (`soffice --convert-to pdf`): compressed page content and fonts, `/OpenAction [1 0 R /XYZ …]`. */
export function libreOfficeCvPdf() {
  return readFileSync(new URL("./fixtures/cv-libreoffice.pdf", import.meta.url));
}

/** How the PDF checks must answer a file of `pathologicalPdfs`: accept it (one page), or refuse it with this reason. */
export type PathologicalPdfOutcome = "accepted" | "object_stream_unreadable" | "stream_count_exceeded";

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
  return [
    { label: "« stream » répété sans fin de ligne", pdf: filled("stream "), outcome: "accepted" },
    { label: "« stream » répété sur une seule ligne", pdf: filled("stream ", "\n"), outcome: "object_stream_unreadable" },
    { label: "noms échappés #XX", pdf: filled("/#41"), outcome: "accepted" },
    { label: "données zlib qui couvrent les flux suivants", pdf: Buffer.from(head + chained, "latin1"), outcome: "stream_count_exceeded" },
    { label: "800 000 clés /F dans un flux d’objets", pdf: objectStream(`/Type/ObjStm/N 1/First 4${"/F/Fl".repeat(Math.floor((size - head.length - 256) / 5))}`), outcome: "accepted" },
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
