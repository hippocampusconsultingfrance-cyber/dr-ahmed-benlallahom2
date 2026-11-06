import { createHash } from "node:crypto";
import { recruitmentCvRefusalReason, type RecruitmentCvRefusalReason } from "../shared/recruitmentCvLimits";
import { inspectDocxArchive, inspectPdfStructure } from "./documentDecompressionLimits";

const PDF_SIGNATURE = Buffer.from("%PDF-");
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const MAX_PDF_PAGES = 25;
const SECURITY_SCAN_VERSION = "document-safety-v4";

/**
 * Formats accepted for new applications. The legacy Word format (.doc) is
 * refused: its macros cannot be inspected reliably (CAND-22). Files already
 * stored in that format are still processed (`allowLegacyDoc`), with a VBA
 * check, so existing dossiers stay readable.
 */
export const RECRUITMENT_CV_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
const LEGACY_DOC_MIME_TYPE = "application/msword";

function matchesSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "application/pdf") return buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
  if (mimeType === "application/msword") return buffer.subarray(0, OLE_SIGNATURE.length).equals(OLE_SIGNATURE);
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return buffer.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE);
  return false;
}

export type CvFileValidation = {
  checksum: string;
  notes: string;
  mimeType: string;
  pageCount: number | null;
  securityScanVersion: string;
  warnings: string[];
};

/**
 * Reads the object streams too (bounded inflation, see inspectPdfStructure):
 * pdf-lib, Acrobat "optimised" or Word put the pages and actions there, and
 * a JavaScript action may hide there or behind #xx-escaped names (REC-02).
 */
function validatePdfSafety(buffer: Buffer): number {
  const pdf = inspectPdfStructure(buffer);
  if (pdf.encrypted) throw new Error("cv_validation_pdf_encrypted");
  if (pdf.activeContent) throw new Error("cv_validation_pdf_active_content");
  if (pdf.unreadableObjectStreams > 0) throw new Error("cv_validation_pdf_object_stream_unreadable");
  if (pdf.pageCount === 0) throw new Error("cv_validation_pdf_page_structure_invalid");
  if (pdf.pageCount > MAX_PDF_PAGES) throw new Error("cv_validation_pdf_page_limit_exceeded");
  return pdf.pageCount;
}

/** External relationships that make Word run an object: always refused. */
const EXTERNAL_OBJECT_RELATIONSHIP = /\/(?:oleObject|package)$/i;
/**
 * External relationships that make Word load another document when the file
 * opens: refused unless the target is a file on the author's own disk. Word
 * records the template a CV was created from (`file:///C:/Users/…/x.dotx`,
 * `file:///Users/…` on a Mac); a server target (http(s), UNC `\\host`,
 * `file://host`) would be fetched by the recruiter's Word.
 */
const EXTERNAL_DOCUMENT_RELATIONSHIP = /\/(?:attachedTemplate|frame|subDocument)$/i;
/** Start of a `<Relationship …>` element. */
const RELATIONSHIP_START = /<(?:[\w.-]+:)?Relationship\b/gi;

/**
 * The `<Relationship …>` elements of a relationship part, read once from
 * left to right (attribute values may contain `>`); null when one never
 * ends, which Word cannot read either. A regular expression for the whole
 * element was tried again from every later start: 200 KB of
 * "<Relationship " (a 1.5 KB DOCX) took 3 s, and the inflated parts may reach 20 MB.
 */
function relationshipElements(xml: string): string[] | null {
  const elements: string[] = [];
  const start = new RegExp(RELATIONSHIP_START.source, RELATIONSHIP_START.flags);
  for (let match = start.exec(xml); match; match = start.exec(xml)) {
    let end = match.index + match[0].length;
    for (; end < xml.length && xml[end] !== ">"; end += 1) {
      const char = xml[end];
      if (char === "\"" || char === "'") end = xml.indexOf(char, end + 1);
      if (end === -1) return null;
    }
    if (end >= xml.length) return null;
    elements.push(xml.slice(match.index, end + 1));
    start.lastIndex = end + 1;
  }
  return elements;
}

function decodeXmlEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
    if (entity[0] !== "#") return named[entity.toLowerCase()]!;
    const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

function xmlAttribute(element: string, name: string) {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(element);
  return match ? decodeXmlEntities(match[1] ?? match[2] ?? "").trim() : null;
}

function isLocalFileTarget(target: string) {
  return /^file:\/\/\/[A-Za-z0-9]/i.test(target) || /^[A-Za-z]:[\\/]/.test(target);
}

function isDangerousExternalRelationship(element: string) {
  if (!element.includes("TargetMode") || xmlAttribute(element, "TargetMode")?.toLowerCase() !== "external") return false;
  const type = xmlAttribute(element, "Type") ?? "";
  if (EXTERNAL_OBJECT_RELATIONSHIP.test(type)) return true;
  return EXTERNAL_DOCUMENT_RELATIONSHIP.test(type) && !isLocalFileTarget(xmlAttribute(element, "Target") ?? "");
}

function validateDocxSafety(buffer: Buffer) {
  const archiveText = buffer.toString("latin1", 0, Math.min(buffer.length, 256 * 1024));
  if (/(?:vbaProject\.bin|TargetMode="External"|word\/embeddings\/)/i.test(archiveText)) {
    throw new Error("cv_validation_docx_active_content");
  }
  // Inflates every entry with a hard cap (decompression bomb) and inspects
  // the real entry names and relationships, not only the raw bytes.
  const archive = inspectDocxArchive(buffer);
  if (!archive.entryNames.includes("[Content_Types].xml")) throw new Error("cv_validation_docx_container_invalid");
  if (archive.entryNames.some(name => /(?:vbaProject\.bin|vbaData\.xml|^word\/embeddings\/|^word\/activeX\/)/i.test(name))) {
    throw new Error("cv_validation_docx_active_content");
  }
  for (const relationships of archive.relationships) {
    const elements = relationshipElements(relationships);
    if (!elements) throw new Error("cv_validation_docx_container_invalid");
    if (elements.some(isDangerousExternalRelationship)) throw new Error("cv_validation_docx_active_content");
  }
  return archive;
}

/**
 * VBA project streams of an OLE (.doc) file. Directory entry names are
 * UTF-16LE; `_VBA_PROJECT` and `PROJECTwm` exist in every VBA project, while
 * a CV merely mentioning "VBA" in its text does not contain them.
 */
function legacyDocHasMacros(buffer: Buffer) {
  return /_VBA_PROJECT|PROJECTwm/.test(buffer.toString("utf16le")) || /_VBA_PROJECT|Attribute VB_Name/.test(buffer.toString("latin1"));
}

/**
 * Defensive validation. This is not an antivirus engine; it verifies declared
 * type, file signature, size and basic container plausibility before storage.
 */
export function validateCvFile(input: { buffer: Buffer; mimeType: string; originalName: string; size: number; allowLegacyDoc?: boolean }): CvFileValidation {
  const extension = input.originalName.toLowerCase().split(".").pop();
  const expectedExtension = input.mimeType === "application/pdf" ? "pdf"
    : input.mimeType === LEGACY_DOC_MIME_TYPE ? "doc"
      : "docx";
  if (input.mimeType === LEGACY_DOC_MIME_TYPE && !input.allowLegacyDoc) {
    throw new Error("cv_validation_legacy_doc_refused");
  }
  const allowed = (RECRUITMENT_CV_MIME_TYPES as readonly string[]).includes(input.mimeType) || (input.allowLegacyDoc && input.mimeType === LEGACY_DOC_MIME_TYPE);
  if (!allowed || extension !== expectedExtension) {
    throw new Error("cv_validation_type_mismatch");
  }
  if (input.size < 256 || input.buffer.length !== input.size) {
    throw new Error("cv_validation_size_invalid");
  }
  if (!matchesSignature(input.buffer, input.mimeType)) {
    throw new Error("cv_validation_signature_invalid");
  }
  const pageCount = input.mimeType === "application/pdf" ? validatePdfSafety(input.buffer) : null;
  if (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") validateDocxSafety(input.buffer);
  if (input.mimeType === LEGACY_DOC_MIME_TYPE && legacyDocHasMacros(input.buffer)) throw new Error("cv_validation_doc_active_content");
  const warnings = input.mimeType === LEGACY_DOC_MIME_TYPE
    ? ["legacy_doc_format_limited_security_inspection"]
    : [];
  return {
    checksum: createHash("sha256").update(input.buffer).digest("hex"),
    notes: [
      "signature_verified",
      `mime=${input.mimeType}`,
      `bytes=${input.size}`,
      `security_scan=${SECURITY_SCAN_VERSION}`,
      pageCount !== null ? `pages=${pageCount}` : null,
      ...warnings,
    ].filter(Boolean).join("; "),
    mimeType: input.mimeType,
    pageCount,
    securityScanVersion: SECURITY_SCAN_VERSION,
    warnings,
  };
}

export const RECRUITMENT_CV_FORMAT_MESSAGE = "Format de CV non accepté. Utilisez un PDF ou un DOCX (le format Word ancien .doc n’est plus accepté).";

/** What a candidate can always do with a CV the checks refuse (REC-02). */
const RECRUITMENT_CV_RESAVE_ADVICE = "Réenregistrez votre CV en DOCX ou imprimez-le en PDF depuis votre navigateur, puis réessayez.";

const RECRUITMENT_CV_REFUSAL_MESSAGES: Record<RecruitmentCvRefusalReason, string> = {
  legacyFormat: RECRUITMENT_CV_FORMAT_MESSAGE,
  tooLargeWhenOpened: "Le CV est trop volumineux une fois ouvert. Enregistrez-le de nouveau en PDF (par exemple « Fichier > Exporter en PDF ») puis réessayez.",
  pageLimit: "Le CV ne doit pas dépasser 25 pages.",
  passwordProtected: "Le CV est protégé par un mot de passe. Envoyez une version non protégée.",
  activeContent: `Le CV contient des macros, du JavaScript, une commande de lancement ou des fichiers intégrés. ${RECRUITMENT_CV_RESAVE_ADVICE}`,
  invalidContent: `Le contenu du CV ne correspond pas à un document PDF ou DOCX valide. ${RECRUITMENT_CV_RESAVE_ADVICE}`,
};

/** Clear French message for a CV refused by the content checks (the forms translate it from the same code). */
export function recruitmentCvValidationMessage(code: string) {
  return RECRUITMENT_CV_REFUSAL_MESSAGES[recruitmentCvRefusalReason(code)];
}
