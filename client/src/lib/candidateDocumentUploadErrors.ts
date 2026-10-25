import { candidateDocumentRefusalReason, type CandidateDocumentRefusalReason } from "@shared/candidateDocumentLimits";

type Language = "fr" | "en" | "de" | "zh";

/** Translations of the French messages returned by /api/candidate/documents when the content checks refuse a file. */
const refusalCopy: Record<Exclude<Language, "fr">, Record<CandidateDocumentRefusalReason, string>> = {
  en: {
    tooLargeWhenOpened: "The document is too large once opened. Save it again as a DOCX, print it to PDF from your browser or send a photo of it (JPEG or PNG), then try again.",
    pageLimit: "The document must not exceed 25 pages.",
    passwordProtected: "The document is password-protected. Send a version without a password.",
    activeContent: "The document contains macros, JavaScript, a launch command or embedded files. Save it again as a DOCX, print it to PDF from your browser or send a photo of it (JPEG or PNG), then try again.",
    invalidContent: "The document content does not match a valid PDF, DOC, DOCX, JPEG or PNG file. Save it again as a DOCX, print it to PDF from your browser or send a photo of it (JPEG or PNG), then try again.",
  },
  de: {
    tooLargeWhenOpened: "Das Dokument ist nach dem Öffnen zu groß. Speichern Sie es erneut als DOCX, drucken Sie es in Ihrem Browser als PDF oder senden Sie ein Foto davon (JPEG oder PNG) und versuchen Sie es dann erneut.",
    pageLimit: "Das Dokument darf höchstens 25 Seiten umfassen.",
    passwordProtected: "Das Dokument ist passwortgeschützt. Senden Sie eine Version ohne Passwort.",
    activeContent: "Das Dokument enthält Makros, JavaScript, einen Startbefehl oder eingebettete Dateien. Speichern Sie es erneut als DOCX, drucken Sie es in Ihrem Browser als PDF oder senden Sie ein Foto davon (JPEG oder PNG) und versuchen Sie es dann erneut.",
    invalidContent: "Der Inhalt des Dokuments entspricht keiner gültigen PDF-, DOC-, DOCX-, JPEG- oder PNG-Datei. Speichern Sie es erneut als DOCX, drucken Sie es in Ihrem Browser als PDF oder senden Sie ein Foto davon (JPEG oder PNG) und versuchen Sie es dann erneut.",
  },
  zh: {
    tooLargeWhenOpened: "文件打开后体积过大。请重新另存为 DOCX、在浏览器中打印为 PDF，或发送文件照片（JPEG 或 PNG），然后重试。",
    pageLimit: "文件不得超过 25 页。",
    passwordProtected: "文件受密码保护。请发送未设密码的版本。",
    activeContent: "文件包含宏、JavaScript、启动命令或嵌入文件。请重新另存为 DOCX、在浏览器中打印为 PDF，或发送文件照片（JPEG 或 PNG），然后重试。",
    invalidContent: "文件内容与有效的 PDF、DOC、DOCX、JPEG 或 PNG 文件不符。请重新另存为 DOCX、在浏览器中打印为 PDF，或发送文件照片（JPEG 或 PNG），然后重试。",
  },
};

/**
 * Message shown when the vault refuses a document after opening it (REC-02):
 * the server's French text, or its translation found from the code. Null for
 * any other failure, which keeps the page's own message.
 */
export function candidateDocumentRefusalMessage(failure: { error?: unknown; code?: unknown } | null | undefined, language: Language): string | null {
  const serverMessage = typeof failure?.error === "string" ? failure.error.trim() : "";
  const reason = typeof failure?.code === "string" ? candidateDocumentRefusalReason(failure.code) : null;
  if (!serverMessage || !reason) return null;
  return language === "fr" ? serverMessage : refusalCopy[language][reason];
}
