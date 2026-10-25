/** TEST-ONLY: rewrites PDF fixtures in memory. Never imported by production code. */
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

/** A real CV exported by LibreOffice Writer 24.2 (`soffice --convert-to pdf`): compressed page content and fonts, `/OpenAction [1 0 R /XYZ …]`. */
export function libreOfficeCvPdf() {
  return readFileSync(new URL("./fixtures/cv-libreoffice.pdf", import.meta.url));
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
