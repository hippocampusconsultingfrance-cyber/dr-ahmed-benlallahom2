import { crc32 } from "node:zlib";
import { DOCUMENT_DECOMPRESSION_LIMITS, inspectDocxArchive } from "./documentDecompressionLimits";

/**
 * DOCX text Word does not show (IA-01): runs marked hidden (w:vanish,
 * w:specVanish, w:webHidden), smaller than 4 pt (w:sz under 8 half-points),
 * or white with no coloured background under them (shading of the run, its
 * paragraph, table cell or table, highlight, filled text box, page colour;
 * no white text is cut when a picture or a shape lies behind the text, as in
 * many CV templates). mammoth reads such runs like any other text, so they
 * are cut out of the main document part, text boxes included, before it
 * reads the file. Run formatting is resolved as Word does: document
 * defaults, paragraph style, character style, then the run's own properties.
 */

/** Canonical prefixes, whatever prefix the file binds to these namespaces (as mammoth reads them). */
const NAMESPACES: Record<string, string> = {
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main": "w",
  "http://purl.oclc.org/ooxml/wordprocessingml/main": "w",
  "urn:schemas-microsoft-com:vml": "v",
  "http://schemas.openxmlformats.org/markup-compatibility/2006": "mc",
  "http://schemas.openxmlformats.org/package/2006/relationships": "relationships",
};
const OFFICE_DOCUMENT_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const STYLES_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
/** VML shapes that can hold a text box. */
const VML_SHAPES = new Set(["v:shape", "v:rect", "v:roundrect", "v:oval"]);

type XmlTag = { name: string; attributes: Map<string, string>; closing: boolean; selfClosing: boolean; start: number; end: number };

function decodeXml(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->/g, (_, data: string | undefined) => data ?? "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
      if (entity[0] !== "#") return named[entity.toLowerCase()]!;
      const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

/** Calls `visit` with each tag of an XML part, in order, with namespace-resolved names and attributes. */
function visitXmlTags(xml: string, visit: (tag: XmlTag) => void) {
  const scopes: Array<Map<string, string>> = [new Map()];
  const canonical = (qualifiedName: string, scope: Map<string, string>) => {
    const colon = qualifiedName.indexOf(":");
    const prefix = colon === -1 ? "" : qualifiedName.slice(0, colon);
    const known = NAMESPACES[scope.get(prefix) ?? ""];
    return known ? `${known}:${qualifiedName.slice(colon + 1)}` : qualifiedName;
  };
  const tags = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (let match = tags.exec(xml); match; match = tags.exec(xml)) {
    const [, closing, qualifiedName, attributeText = "", selfClosing] = match;
    if (!qualifiedName) continue;
    const position = { start: match.index, end: match.index + match[0].length };
    if (closing) {
      const scope = scopes.length > 1 ? scopes.pop()! : scopes[0]!;
      visit({ name: canonical(qualifiedName, scope), attributes: new Map(), closing: true, selfClosing: false, ...position });
      continue;
    }
    const raw: Array<[string, string]> = Array.from(attributeText.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g), attribute => [attribute[1]!, decodeXml(attribute[2] ?? attribute[3] ?? "")]);
    let scope = scopes.at(-1)!;
    for (const [name, value] of raw) {
      if (name === "xmlns" || name.startsWith("xmlns:")) {
        if (scope === scopes.at(-1)) scope = new Map(scope);
        scope.set(name === "xmlns" ? "" : name.slice(6), value);
      }
    }
    // Unprefixed attributes have no namespace (VML fillcolor, relationship Type and Target).
    const attributes = new Map(raw.map(([name, value]) => [name.includes(":") ? canonical(name, scope) : name, value]));
    if (!selfClosing) scopes.push(scope);
    visit({ name: canonical(qualifiedName, scope), attributes, closing: false, selfClosing: Boolean(selfClosing), ...position });
  }
}

/** What one layer of run formatting says; keys left unset inherit from the layer below. */
type RunLayer = Partial<Record<"w:vanish" | "w:specVanish" | "w:webHidden" | "white" | "shading" | "highlight", boolean> & { size: number }>;

const isColour = (value: string | undefined) => value !== undefined && /^[0-9a-f]{6}$/i.test(value) && !/^ffffff$/i.test(value);

/** w:shd paints a colour: a fill, or a pattern drawn in a colour other than white. */
function shadingIsColoured(tag: XmlTag) {
  const pattern = tag.attributes.get("w:val") ?? "clear";
  if (pattern === "nil") return false;
  return isColour(tag.attributes.get("w:fill")) || (pattern !== "clear" && !/^ffffff$/i.test(tag.attributes.get("w:color") ?? "auto"));
}

function applyRunProperty(layer: RunLayer, tag: XmlTag) {
  const value = tag.attributes.get("w:val");
  if (tag.name === "w:vanish" || tag.name === "w:specVanish" || tag.name === "w:webHidden") layer[tag.name] = value === undefined || !/^(false|0|off)$/i.test(value);
  else if (tag.name === "w:sz" && value && /^\d+$/.test(value)) layer.size = Number(value);
  else if (tag.name === "w:color" && value) layer.white = /^ffffff$/i.test(value);
  else if (tag.name === "w:shd") layer.shading = shadingIsColoured(tag);
  else if (tag.name === "w:highlight") layer.highlight = value !== undefined && !/^(none|white)$/i.test(value);
}

type StyleDefinition = { basedOn?: string; run: RunLayer; paragraphShading: boolean; anyShading: boolean };
type Styles = { byId: Map<string, StyleDefinition>; defaultIds: Map<string, string>; defaults: RunLayer };

function readStyles(xml: string | undefined): Styles {
  const styles: Styles = { byId: new Map(), defaultIds: new Map(), defaults: {} };
  const path: string[] = [];
  let current: StyleDefinition | null = null;
  visitXmlTags(xml ?? "", tag => {
    if (tag.closing) {
      if (path.pop() === "w:style") current = null;
      return;
    }
    const parent = path.at(-1);
    const grandParent = path.at(-2);
    if (tag.name === "w:style") {
      current = { run: {}, paragraphShading: false, anyShading: false };
      const id = tag.attributes.get("w:styleId");
      const type = tag.attributes.get("w:type") ?? "paragraph";
      if (id) styles.byId.set(id, current);
      if (id && /^(1|true|on)$/i.test(tag.attributes.get("w:default") ?? "")) styles.defaultIds.set(type, id);
    } else if (current && parent === "w:style" && tag.name === "w:basedOn") {
      current.basedOn = tag.attributes.get("w:val");
    } else if (parent === "w:rPr" && grandParent === "w:rPrDefault") {
      applyRunProperty(styles.defaults, tag);
    } else if (current && parent === "w:rPr" && grandParent === "w:style") {
      applyRunProperty(current.run, tag);
    }
    if (current && tag.name === "w:shd" && shadingIsColoured(tag)) {
      current.anyShading = true;
      if (parent === "w:pPr" && grandParent === "w:style") current.paragraphShading = true;
    }
    if (!tag.selfClosing) path.push(tag.name);
  });
  return styles;
}

/** A style and the ones it is based on, the base first; the type's default style when none is named. */
function styleChain(styles: Styles, id: string | undefined, type: string) {
  const chain: StyleDefinition[] = [];
  const seen = new Set<string>();
  for (let current = id ?? styles.defaultIds.get(type); current && !seen.has(current); ) {
    seen.add(current);
    const style = styles.byId.get(current);
    if (!style) break;
    chain.unshift(style);
    current = style.basedOn;
  }
  return chain;
}

type Frame = { name: string; background: boolean; style?: string; layer?: RunLayer; texts?: Array<[number, number]>; passage?: string[] };

/** The main document part without the text of its invisible runs, and that text, paragraph by paragraph. */
function cutInvisibleRuns(xml: string, styles: Styles, layerBehindText: boolean) {
  const stack: Frame[] = [];
  const cuts: Array<[number, number]> = [];
  const passages: string[] = [];
  let textStart: number | null = null;
  const nearest = (name: string) => stack.findLast(frame => frame.name === name);
  const hasBackground = (frame: Frame) =>
    frame.background ||
    (frame.name === "w:p" && styleChain(styles, frame.style, "paragraph").some(style => style.paragraphShading)) ||
    (frame.name === "w:tbl" && styleChain(styles, frame.style, "table").some(style => style.anyShading));
  // Decided once the whole run is read, inside its paragraph, cell, table and text box.
  const isInvisible = (run: Frame) => {
    const effective: RunLayer = Object.assign({}, styles.defaults,
      ...styleChain(styles, nearest("w:p")?.style, "paragraph").map(style => style.run),
      ...styleChain(styles, run.style, "character").map(style => style.run),
      run.layer);
    return Boolean(effective["w:vanish"] || effective["w:specVanish"] || effective["w:webHidden"]) ||
      (effective.size !== undefined && effective.size < 8) ||
      (Boolean(effective.white) && !layerBehindText && !effective.shading && !effective.highlight && !stack.some(hasBackground));
  };
  visitXmlTags(xml, tag => {
    if (tag.closing) {
      const frame = stack.pop();
      if (frame?.name === "w:t" && textStart !== null) {
        stack.at(-1)?.texts?.push([textStart, tag.start]);
        textStart = null;
      } else if (frame?.name === "w:r" && frame.texts?.length && isInvisible(frame)) {
        cuts.push(...frame.texts);
        // mammoth reads text boxes from mc:Fallback only: what mc:Choice repeats is not counted.
        if (!stack.some(item => item.name === "mc:Choice")) nearest("w:p")?.passage?.push(...frame.texts.map(([start, end]) => decodeXml(xml.slice(start, end))));
      } else if (frame?.name === "w:p" && frame.passage?.length) {
        passages.push(frame.passage.join(""));
      }
      return;
    }
    const parent = stack.at(-1);
    const grandParent = stack.at(-2);
    const frame: Frame = { name: tag.name, background: false };
    if (tag.name === "w:p") frame.passage = [];
    if (tag.name === "w:r") Object.assign(frame, { layer: {}, texts: [] });
    if (VML_SHAPES.has(tag.name)) {
      const fill = tag.attributes.get("fillcolor")?.trim();
      frame.background = fill !== undefined && !/^(#?fff(fff)?|white)\b/i.test(fill) && !/^(f|false)$/i.test(tag.attributes.get("filled") ?? "");
    }
    if (tag.name === "w:background" && parent?.name === "w:document") parent.background = isColour(tag.attributes.get("w:color"));
    if (parent?.name === "w:pPr" && grandParent?.name === "w:p") {
      if (tag.name === "w:pStyle") grandParent.style = tag.attributes.get("w:val");
      if (tag.name === "w:shd") grandParent.background = shadingIsColoured(tag);
    }
    if (tag.name === "w:shd" && ((parent?.name === "w:tcPr" && grandParent?.name === "w:tc") || (parent?.name === "w:tblPr" && grandParent?.name === "w:tbl"))) grandParent.background = shadingIsColoured(tag);
    if (tag.name === "w:tblStyle" && parent?.name === "w:tblPr" && grandParent?.name === "w:tbl") grandParent.style = tag.attributes.get("w:val");
    if (parent?.name === "w:rPr" && grandParent?.name === "w:r") {
      if (tag.name === "w:rStyle") grandParent.style = tag.attributes.get("w:val");
      else applyRunProperty(grandParent.layer!, tag);
    }
    if (tag.name === "w:t" && !tag.selfClosing && parent?.name === "w:r") textStart = tag.end;
    if (!tag.selfClosing) stack.push(frame);
  });
  let visible = "";
  let from = 0;
  for (const [start, end] of cuts.sort((left, right) => left[0] - right[0])) {
    visible += xml.slice(from, start);
    from = end;
  }
  return { xml: visible + xml.slice(from), invisibleText: passages };
}

/** The first existing target of a relationship of that type, resolved as mammoth resolves it. */
function relatedPart(parts: Map<string, Buffer>, relationshipsPath: string, type: string, basePath: string) {
  let found: string | undefined;
  visitXmlTags(parts.get(relationshipsPath)?.toString("utf8") ?? "", tag => {
    if (found || tag.closing || tag.name !== "relationships:Relationship" || tag.attributes.get("Type") !== type) return;
    const target = tag.attributes.get("Target") ?? "";
    const path = (target.startsWith("/") || !basePath ? target : `${basePath}/${target}`).replace(/^\//, "");
    if (parts.has(path)) found = path;
  });
  return found;
}

/** A ZIP of `parts`, stored without compression: it is only read back by mammoth, in memory. */
function storedZip(parts: Map<string, Buffer>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  parts.forEach((content, name) => {
    const fileName = Buffer.from(name, "utf8");
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, fileName, content);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + content.length;
  });
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.size, 8);
  end.writeUInt16LE(parts.size, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/**
 * The DOCX to hand to mammoth, without its invisible text, and that text.
 * Also bounds the decompression (inspectDocxArchive). An unchanged file is
 * returned as is.
 */
export function withoutInvisibleDocxText(buffer: Buffer, limits = DOCUMENT_DECOMPRESSION_LIMITS): { buffer: Buffer; invisibleText: string[] } {
  const parts = new Map<string, Buffer>();
  inspectDocxArchive(buffer, limits, (name, content) => parts.set(name, content));
  const mainDocument = relatedPart(parts, "_rels/.rels", OFFICE_DOCUMENT_RELATIONSHIP, "") ?? "word/document.xml";
  const xml = parts.get(mainDocument)?.toString("utf8");
  if (!xml) return { buffer, invisibleText: [] };
  const folder = mainDocument.includes("/") ? mainDocument.slice(0, mainDocument.lastIndexOf("/")) : "";
  const relationships = `${folder ? `${folder}/` : ""}_rels/${mainDocument.slice(folder ? folder.length + 1 : 0)}.rels`;
  const stylesPart = relatedPart(parts, relationships, STYLES_RELATIONSHIP, folder) ?? "word/styles.xml";
  // A drawing behind the text (wp:anchor behindDoc, VML z-index below 0), in the body or a header.
  const layerBehindText = Array.from(parts.keys()).some(name =>
    (name === mainDocument || /(^|\/)header\d*\.xml$/i.test(name)) &&
    /\bbehindDoc\s*=\s*["'](1|true|on)["']|z-index\s*:\s*-\d/i.test(parts.get(name)!.toString("utf8")));
  const visible = cutInvisibleRuns(xml, readStyles(parts.get(stylesPart)?.toString("utf8")), layerBehindText);
  if (visible.invisibleText.length === 0) return { buffer, invisibleText: [] };
  parts.set(mainDocument, Buffer.from(visible.xml, "utf8"));
  return { buffer: storedZip(parts), invisibleText: visible.invisibleText };
}
