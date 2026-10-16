/**
 * CV upload policy shared by the recruitment forms and the API.
 * 4 MB keeps the multipart request under the 4.5 MB body limit of a Vercel
 * function. The legacy Word format (.doc) is refused: its macros cannot be
 * inspected reliably; PDF and DOCX are accepted.
 */
export const RECRUITMENT_CV_MAX_BYTES = 4 * 1024 * 1024;
export const RECRUITMENT_CV_ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const RECRUITMENT_CV_ACCEPTED_EXTENSIONS = ["pdf", "docx"] as const;
/** Value for the `accept` attribute of the CV file inputs. */
export const RECRUITMENT_CV_ACCEPT_ATTRIBUTE = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function isAcceptedRecruitmentCvFile(file: { name: string; size: number; type: string } | null): boolean {
  if (!file || file.size <= 0 || file.size > RECRUITMENT_CV_MAX_BYTES) return false;
  // iOS / Android pickers may give an empty or generic MIME type for a valid
  // file: the extension decides here; the server checks the signature and content.
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return (RECRUITMENT_CV_ACCEPTED_EXTENSIONS as readonly string[]).includes(extension);
}
