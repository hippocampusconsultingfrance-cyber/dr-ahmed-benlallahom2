import { createHash } from "node:crypto";

const PDF_SIGNATURE = Buffer.from("%PDF-");
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const MAX_PDF_PAGES = 25;
const SECURITY_SCAN_VERSION = "document-safety-v2";

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

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

function validatePdfSafety(buffer: Buffer): number {
  const source = buffer.toString("latin1");
  if (/\/Encrypt\b/.test(source)) throw new Error("cv_validation_pdf_encrypted");
  if (/(?:\/JavaScript\b|\/JS\b|\/Launch\b|\/OpenAction\b|\/EmbeddedFile\b)/.test(source)) {
    throw new Error("cv_validation_pdf_active_content");
  }
  const pageCount = (source.match(/\/Type\s*\/Page\b/g) ?? []).length;
  if (pageCount === 0) throw new Error("cv_validation_pdf_page_structure_invalid");
  if (pageCount > MAX_PDF_PAGES) throw new Error("cv_validation_pdf_page_limit_exceeded");
  return pageCount;
}

function validateDocxSafety(buffer: Buffer) {
  const archiveText = buffer.toString("latin1", 0, Math.min(buffer.length, 256 * 1024));
  if (!archiveText.includes("[Content_Types].xml")) throw new Error("cv_validation_docx_container_invalid");
  if (/(?:vbaProject\.bin|TargetMode="External"|word\/embeddings\/)/i.test(archiveText)) {
    throw new Error("cv_validation_docx_active_content");
  }
}

/**
 * Defensive validation. This is not an antivirus engine; it verifies declared
 * type, file signature, size and basic container plausibility before storage.
 */
export function validateCvFile(input: { buffer: Buffer; mimeType: string; originalName: string; size: number }): CvFileValidation {
  const extension = input.originalName.toLowerCase().split(".").pop();
  const expectedExtension = input.mimeType === "application/pdf" ? "pdf"
    : input.mimeType === "application/msword" ? "doc"
      : "docx";
  if (!allowedMimeTypes.has(input.mimeType) || extension !== expectedExtension) {
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
  const warnings = input.mimeType === "application/msword"
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
