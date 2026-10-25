import { recruitmentCvRefusalReason } from "@shared/recruitmentCvLimits";

type Language = "fr" | "en" | "de" | "zh";

/** Translations of the French messages returned by /api/recruitment/apply, by cause. */
const serverErrorCopy = {
  en: {
    securityCheck: "The security check must be renewed before sending.",
    rateLimited: "Too many attempts have been made. Wait one hour before trying again.",
    invalidInformation: "The application details are invalid.",
    unavailable: "The application service is temporarily unavailable.",
    legacyFormat: "CV format not accepted. Use a PDF or a DOCX (the legacy Word .doc format is no longer accepted).",
    tooLargeWhenOpened: "The CV is too large once opened. Save it again as a PDF (for example “File > Export to PDF”) and try again.",
    pageLimit: "The CV must not exceed 25 pages.",
    passwordProtected: "The CV is password-protected. Send a version without a password.",
    activeContent: "The CV contains macros, active content or embedded objects. Save it as a PDF and try again.",
    invalidContent: "The CV content does not match a valid PDF or DOCX document.",
  },
  de: {
    securityCheck: "Die Sicherheitsprüfung muss vor dem Absenden erneuert werden.",
    rateLimited: "Es wurden zu viele Versuche unternommen. Warten Sie eine Stunde, bevor Sie es erneut versuchen.",
    invalidInformation: "Die Bewerbungsangaben sind ungültig.",
    unavailable: "Der Bewerbungsdienst ist vorübergehend nicht verfügbar.",
    legacyFormat: "CV-Format nicht akzeptiert. Verwenden Sie ein PDF oder DOCX (das alte Word-Format .doc wird nicht mehr akzeptiert).",
    tooLargeWhenOpened: "Der Lebenslauf ist nach dem Öffnen zu groß. Speichern Sie ihn erneut als PDF (zum Beispiel „Datei > Als PDF exportieren“) und versuchen Sie es erneut.",
    pageLimit: "Der Lebenslauf darf höchstens 25 Seiten umfassen.",
    passwordProtected: "Der Lebenslauf ist passwortgeschützt. Senden Sie eine Version ohne Passwort.",
    activeContent: "Der Lebenslauf enthält Makros, aktive Inhalte oder eingebettete Objekte. Speichern Sie ihn als PDF und versuchen Sie es erneut.",
    invalidContent: "Der Inhalt des Lebenslaufs entspricht keinem gültigen PDF- oder DOCX-Dokument.",
  },
  zh: {
    securityCheck: "发送前必须重新完成安全验证。",
    rateLimited: "尝试次数过多。请等待一小时后再试。",
    invalidInformation: "申请信息无效。",
    unavailable: "申请服务暂时不可用。",
    legacyFormat: "不接受该简历格式。请使用 PDF 或 DOCX（不再接受旧版 Word .doc 格式）。",
    tooLargeWhenOpened: "简历打开后体积过大。请重新另存为 PDF（例如“文件 > 导出为 PDF”）后重试。",
    pageLimit: "简历不得超过 25 页。",
    passwordProtected: "简历受密码保护。请发送未设密码的版本。",
    activeContent: "简历包含宏、活动内容或嵌入对象。请另存为 PDF 后重试。",
    invalidContent: "简历内容与有效的 PDF 或 DOCX 文档不符。",
  },
} as const;
type ServerErrorCause = keyof typeof serverErrorCopy.en;

/** Codes returned by /api/recruitment/apply next to its message (the CV checks use cv_validation_*). */
const serverErrorCauses = new Map<string, ServerErrorCause>([
  ["recruitment_security_check_required", "securityCheck"],
  ["recruitment_rate_limited", "rateLimited"],
  ["recruitment_application_invalid", "invalidInformation"],
  ["recruitment_service_unavailable", "unavailable"],
]);

/** After a 5xx answer without a known code (server error, gateway timeout), there is nothing for the candidate to correct. */
const serverFailureCopy: Record<Language, string> = {
  fr: "Le service de candidature est momentanément indisponible. Réessayez dans quelques instants.",
  en: "The application service is momentarily unavailable. Please try again in a few moments.",
  de: "Der Bewerbungsdienst ist momentan nicht verfügbar. Bitte versuchen Sie es in wenigen Augenblicken erneut.",
  zh: "申请服务暂时无法使用。请稍后再试。",
};

/**
 * Message shown when /api/recruitment/apply refuses an application, on the
 * standard and VVIP forms. A refusal the page knows (by its code, or a CV
 * refusal without one) shows the server's own message in French and its
 * translation in the other languages; a server failure asks to try again;
 * anything else, such as a technical upload error, stays generic.
 */
export function recruitmentSubmissionErrorMessage(
  payload: { error?: unknown; code?: unknown } | null | undefined,
  language: Language,
  pageCopy: { genericError: string; fileError: string },
  status?: number,
): string {
  const serverMessage = typeof payload?.error === "string" ? payload.error.trim() : "";
  const code = typeof payload?.code === "string" ? payload.code : "";
  const cause = !serverMessage ? undefined : code.startsWith("cv_validation_") ? recruitmentCvRefusalReason(code) : serverErrorCauses.get(code);
  if (cause) return language === "fr" ? serverMessage : serverErrorCopy[language][cause];
  if (status !== undefined && status >= 500) return serverFailureCopy[language];
  // CV size, format or missing file: refused before the content checks, without a code.
  if (serverMessage.includes("CV")) return language === "fr" ? serverMessage : pageCopy.fileError;
  return pageCopy.genericError;
}
