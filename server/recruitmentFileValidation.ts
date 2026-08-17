import { createHash } from "node:crypto";

const PDF_SIGNATURE = Buffer.from("%PDF-");
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

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
};

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
  if (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const archiveText = input.buffer.toString("latin1", 0, Math.min(input.buffer.length, 8192));
    if (!archiveText.includes("[Content_Types].xml")) throw new Error("cv_validation_docx_container_invalid");
  }
  return {
    checksum: createHash("sha256").update(input.buffer).digest("hex"),
    notes: `signature_verified; mime=${input.mimeType}; bytes=${input.size}`,
    mimeType: input.mimeType,
  };
}
