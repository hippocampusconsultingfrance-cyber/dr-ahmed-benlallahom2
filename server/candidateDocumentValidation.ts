import { createHash } from "node:crypto";
import { CANDIDATE_DOCUMENT_MAX_BYTES, candidateDocumentRefusalReason, type CandidateDocumentRefusalReason } from "../shared/candidateDocumentLimits";
import { inspectPdfStructure } from "./documentDecompressionLimits";

export { CANDIDATE_DOCUMENT_MAX_BYTES, CANDIDATE_DOCUMENT_TOO_LARGE_MESSAGE } from "../shared/candidateDocumentLimits";

const PDF_SIGNATURE = Buffer.from("%PDF-");
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);

export const candidateDocumentMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

const expectedExtensions: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};

export type CandidateDocumentValidation = {
  checksum: string;
  notes: string;
  mimeType: string;
  securityScanVersion: string;
  warnings: string[];
};

export function safeCandidateDocumentName(value: string): string {
  const safe = value
    .normalize("NFKC")
    .replace(/[\\/\0]/g, "_")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\.{2,}/g, ".")
    .trim()
    .slice(0, 180);
  return safe || "document";
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
  if (mimeType === "application/msword") return buffer.subarray(0, OLE_SIGNATURE.length).equals(OLE_SIGNATURE);
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
  const warnings = input.mimeType === "application/msword" ? ["legacy_doc_format_limited_security_inspection"] : [];
  return {
    checksum: createHash("sha256").update(input.buffer).digest("hex"),
    notes: ["signature_verified", `mime=${input.mimeType}`, `bytes=${input.size}`, "security_scan=candidate-document-safety-v2", ...warnings].join("; "),
    mimeType: input.mimeType,
    securityScanVersion: "candidate-document-safety-v2",
    warnings,
  };
}

/** What a candidate can always do with a document the checks refuse (REC-02). */
const CANDIDATE_DOCUMENT_RESAVE_ADVICE = "Réenregistrez-le en DOCX, imprimez-le en PDF depuis votre navigateur ou envoyez-en une photo (JPEG ou PNG), puis réessayez.";

const CANDIDATE_DOCUMENT_REFUSAL_MESSAGES: Record<CandidateDocumentRefusalReason, string> = {
  tooLargeWhenOpened: `Le document est trop volumineux une fois ouvert. ${CANDIDATE_DOCUMENT_RESAVE_ADVICE}`,
  pageLimit: "Le document ne doit pas dépasser 25 pages.",
  passwordProtected: "Le document est protégé par un mot de passe. Envoyez une version non protégée.",
  activeContent: `Le document contient des macros, du JavaScript, une commande de lancement ou des fichiers intégrés. ${CANDIDATE_DOCUMENT_RESAVE_ADVICE}`,
  invalidContent: `Le contenu du document ne correspond pas à un fichier PDF, DOC, DOCX, JPEG ou PNG valide. ${CANDIDATE_DOCUMENT_RESAVE_ADVICE}`,
};

/** Clear French message for a document refused by validateCandidateDocument (the portal translates it from the same code). */
export function candidateDocumentValidationMessage(code: string) {
  return CANDIDATE_DOCUMENT_REFUSAL_MESSAGES[candidateDocumentRefusalReason(code) ?? "invalidContent"];
}
