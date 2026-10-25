/**
 * Upload size limit of the candidate document vault, shared by the browser
 * check, the multer limit and the validation (OPS-09 / CAND-06). A Vercel
 * Function rejects request bodies above 4.5 MB before the application sees
 * them, so the limit stays below it with room for the multipart envelope.
 * Owner decision: 4 MB.
 */
export const CANDIDATE_DOCUMENT_MAX_MEGABYTES = 4;
export const CANDIDATE_DOCUMENT_MAX_BYTES = CANDIDATE_DOCUMENT_MAX_MEGABYTES * 1024 * 1024;

/** French error shown when a candidate document is too large (server and browser). */
export const CANDIDATE_DOCUMENT_TOO_LARGE_MESSAGE = `Le document dépasse la taille maximale de ${CANDIDATE_DOCUMENT_MAX_MEGABYTES} Mo. Réduisez sa taille (scan en 150 à 200 dpi, PDF compressé ou photo moins lourde) puis réessayez.`;

/** Why the vault refused a document after opening it, read from the code /api/candidate/documents returns (REC-02). */
export type CandidateDocumentRefusalReason = "tooLargeWhenOpened" | "pageLimit" | "passwordProtected" | "activeContent" | "invalidContent";

/** Null for a code that is not a content refusal (size limit, retired category…). The PDF bounds keep their cv_validation_* codes. */
export function candidateDocumentRefusalReason(code: string): CandidateDocumentRefusalReason | null {
  if (code.endsWith("_decompressed_size_exceeded") || code === "cv_validation_pdf_image_too_large") return "tooLargeWhenOpened";
  if (code === "candidate_document_pdf_page_limit") return "pageLimit";
  if (code === "candidate_document_pdf_encrypted") return "passwordProtected";
  if (code.endsWith("_active_content")) return "activeContent";
  if (/^(?:cv_validation_|candidate_document_(?:type_mismatch|size_invalid|signature_invalid|pdf_|docx_|validation_failed))/.test(code)) return "invalidContent";
  return null;
}
