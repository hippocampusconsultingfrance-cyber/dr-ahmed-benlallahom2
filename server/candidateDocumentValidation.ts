import { createHash } from "node:crypto";
import { CANDIDATE_DOCUMENT_MAX_BYTES, candidateDocumentRefusalReason, type CandidateDocumentRefusalReason } from "../shared/candidateDocumentLimits";
import { inspectPdfStructure } from "./documentDecompressionLimits";

export { CANDIDATE_DOCUMENT_MAX_BYTES, CANDIDATE_DOCUMENT_TOO_LARGE_MESSAGE } from "../shared/candidateDocumentLimits";

const PDF_SIGNATURE = Buffer.from("%PDF-");
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);

/** The legacy Word format (application/msword, .doc) is refused, as for CVs: its macros cannot be inspected reliably (REC-15). */
export const candidateDocumentMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

const expectedExtensions: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};

export type CandidateDocumentValidation = {
  checksum: string;
  notes: string;
  mimeType: string;
  securityScanVersion: string;
};

/** Longest stored file name, in characters. */
const FILE_NAME_MAX_LENGTH = 180;

/**
 * A file name cut to `maxLength` characters from the end of its base name: its
 * extension stays, so a long name is still read as the type it declares
 * instead of being refused as another one (vault, /api/recruitment/apply).
 */
export function shortenFileName(name: string, maxLength = FILE_NAME_MAX_LENGTH): string {
  if (name.length <= maxLength) return name;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : "";
  // Never half of a character written with two code units (an emoji, a rare ideogram).
  return `${name.slice(0, maxLength - extension.length).replace(/[\uD800-\uDBFF]$/, "").replace(/[. ]+$/, "")}${extension}`;
}

/**
 * C0 and C1 controls, DEL, the direction controls that show a name other than
 * the one stored (« CV », U+202E, « fdp.exe » reads « CVexe.pdf »), and the
 * invisible characters with which two different names look the same or a name
 * breaks its line: zero-width space, soft hyphen, word joiner and invisible
 * operators, byte order mark, line and paragraph separators, tag characters.
 * The zero-width non-joiner and joiner (U+200C, U+200D) stay: Persian words
 * and composed emoji need them. Written as escapes: none of them appears as
 * such in the source.
 */
const FILE_NAME_INVISIBLE_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B\u200E\u200F\u2028-\u202E\u2060-\u2069\uFEFF\u{E0000}-\u{E007F}]/gu;
/** Path separators and the other characters Windows refuses in a file name. */
const FILE_NAME_FORBIDDEN_CHARACTERS = /[\\/<>:"|?*]/g;

/**
 * Name of a file as its sender gave it, to store, show and copy to Google
 * Drive (INTL-07): composed (NFC), its Arabic, Chinese or accented letters kept
 * (« 王小明简历.pdf », « Céline.pdf »), without control or direction characters,
 * path separators and characters Windows refuses (each written « _ »), cut to
 * 180 characters, extension kept; `fallback` when nothing is left.
 */
export function displayFileName(value: string, fallback: string): string {
  return shortenFileName(value
    .toWellFormed()
    .normalize("NFC")
    .replace(FILE_NAME_INVISIBLE_CHARACTERS, "")
    .replace(FILE_NAME_FORBIDDEN_CHARACTERS, "_")
    .replace(/\.{2,}/g, ".")
    .trim()) || fallback;
}

/**
 * The same name in ASCII letters, digits, « . », « _ » and « - », for a storage
 * key and the filename= of a download, never shown (INTL-07): accents dropped
 * (« Céline.pdf » : « Celine.pdf »), any other character written « _ »; a name
 * left without an ASCII letter or digit (« 王小明简历.pdf ») is `fallback` with
 * its extension (« cv.pdf »).
 */
export function asciiFileName(value: string, fallback: string): string {
  const name = shortenFileName(displayFileName(value, fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_"));
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : "";
  return /[a-zA-Z0-9]/.test(name.slice(0, name.length - extension.length)) ? name : `${fallback}${extension}`;
}

/** Name of a vault document as stored and shown: see displayFileName. */
export function safeCandidateDocumentName(value: string): string {
  return displayFileName(value, "document");
}

/** Same reading as the CV check: object streams and #xx-escaped names included, bounded inflation (REC-02). */
function validatePdf(buffer: Buffer) {
  const pdf = inspectPdfStructure(buffer);
  if (pdf.encrypted) throw new Error("candidate_document_pdf_encrypted");
  if (pdf.activeContent) throw new Error("candidate_document_pdf_active_content");
  if (pdf.unreadableObjectStreams > 0) throw new Error("candidate_document_pdf_object_stream_unreadable");
  if (pdf.pageCount === 0) throw new Error("candidate_document_pdf_page_structure_invalid");
  if (pdf.pageCount > 25) throw new Error("candidate_document_pdf_page_limit");
}

function validateDocx(buffer: Buffer) {
  const container = buffer.toString("latin1", 0, Math.min(buffer.length, 256 * 1024));
  if (!container.includes("[Content_Types].xml")) throw new Error("candidate_document_docx_container_invalid");
  if (/(?:vbaProject\.bin|TargetMode="External"|word\/embeddings\/)/i.test(container)) throw new Error("candidate_document_docx_active_content");
}

function hasExpectedSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") return buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return buffer.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE);
  if (mimeType === "image/jpeg") return buffer.subarray(0, JPEG_PREFIX.length).equals(JPEG_PREFIX);
  if (mimeType === "image/png") return buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  return false;
}

/**
 * Defense-in-depth validation before private storage. It is deliberately not
 * labelled antivirus: suspicious files are rejected, and accepted documents
 * still require human review before any administrative decision.
 */
export function validateCandidateDocument(input: { buffer: Buffer; mimeType: string; originalName: string; size: number }): CandidateDocumentValidation {
  const originalName = safeCandidateDocumentName(input.originalName);
  const extension = originalName.toLowerCase().split(".").pop();
  if (!candidateDocumentMimeTypes.has(input.mimeType) || !expectedExtensions[input.mimeType]?.includes(extension ?? "")) throw new Error("candidate_document_type_mismatch");
  if (input.size < 256 || input.size > CANDIDATE_DOCUMENT_MAX_BYTES || input.buffer.length !== input.size) throw new Error("candidate_document_size_invalid");
  if (!hasExpectedSignature(input.buffer, input.mimeType)) throw new Error("candidate_document_signature_invalid");
  if (input.mimeType === "application/pdf") validatePdf(input.buffer);
  if (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") validateDocx(input.buffer);
  return {
    checksum: createHash("sha256").update(input.buffer).digest("hex"),
    notes: ["signature_verified", `mime=${input.mimeType}`, `bytes=${input.size}`, "security_scan=candidate-document-safety-v2"].join("; "),
    mimeType: input.mimeType,
    securityScanVersion: "candidate-document-safety-v2",
  };
}

/** What a candidate can always do with a document the checks refuse (REC-02). */
const CANDIDATE_DOCUMENT_RESAVE_ADVICE = "Réenregistrez-le en DOCX, imprimez-le en PDF depuis votre navigateur ou envoyez-en une photo (JPEG ou PNG), puis réessayez.";

const CANDIDATE_DOCUMENT_REFUSAL_MESSAGES: Record<CandidateDocumentRefusalReason, string> = {
  tooLargeWhenOpened: `Le document est trop volumineux une fois ouvert. ${CANDIDATE_DOCUMENT_RESAVE_ADVICE}`,
  pageLimit: "Le document ne doit pas dépasser 25 pages.",
  passwordProtected: "Le document est protégé par un mot de passe. Envoyez une version non protégée.",
  activeContent: `Le document contient des macros, du JavaScript, une commande de lancement ou des fichiers intégrés. ${CANDIDATE_DOCUMENT_RESAVE_ADVICE}`,
  invalidContent: `Le contenu du document ne correspond pas à un fichier PDF, DOCX, JPEG ou PNG valide. ${CANDIDATE_DOCUMENT_RESAVE_ADVICE}`,
};

/** Clear French message for a document refused by validateCandidateDocument (the portal translates it from the same code). */
export function candidateDocumentValidationMessage(code: string) {
  return CANDIDATE_DOCUMENT_REFUSAL_MESSAGES[candidateDocumentRefusalReason(code) ?? "invalidContent"];
}
