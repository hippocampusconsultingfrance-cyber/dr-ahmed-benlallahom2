import { isPublicFormRefusalReason, type PublicFormRefusalReason } from "@shared/publicFormRefusalReasons";

export type PublicFormLanguage = "fr" | "en" | "de" | "zh";

const fallbackLanguage = (language: string): PublicFormLanguage =>
  language === "en" || language === "de" || language === "zh" ? language : "fr";

/** Retours réutilisables des formulaires publics, avec repli explicite vers le français. */
export const publicFormCopy = {
  contact: {
    fr: { phone: "Téléphone", email: "Email", sent: "Message envoyé avec succès !", sendError: "L’envoi du message a échoué. Veuillez réessayer.", consentRequired: "Veuillez accepter la politique de confidentialité.", successTitle: "Message envoyé !", successDescription: "Merci pour votre message. Je vous répondrai dans les meilleurs délais.", sendAnother: "Envoyer un autre message", sending: "Envoi en cours...", refusals: { rate_limited: "Trop d’envois depuis cette connexion. Réessayez dans une heure.", security_check_failed: "La vérification anti-robot a échoué. Rechargez la page, puis renvoyez votre message." } },
    en: { phone: "Phone", email: "Email", sent: "Message sent successfully!", sendError: "The message could not be sent. Please try again.", consentRequired: "Please accept the privacy policy.", successTitle: "Message sent!", successDescription: "Thank you for your message. I will get back to you as soon as possible.", sendAnother: "Send another message", sending: "Sending...", refusals: { rate_limited: "Too many submissions from this connection. Please try again in an hour.", security_check_failed: "The anti-bot check failed. Reload the page, then send your message again." } },
    de: { phone: "Telefon", email: "E-Mail", sent: "Nachricht erfolgreich gesendet!", sendError: "Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut.", consentRequired: "Bitte akzeptieren Sie die Datenschutzerklärung.", successTitle: "Nachricht gesendet!", successDescription: "Vielen Dank für Ihre Nachricht. Ich werde Ihnen schnellstmöglich antworten.", sendAnother: "Weitere Nachricht senden", sending: "Wird gesendet...", refusals: { rate_limited: "Zu viele Anfragen über diese Verbindung. Bitte versuchen Sie es in einer Stunde erneut.", security_check_failed: "Die Bot-Prüfung ist fehlgeschlagen. Laden Sie die Seite neu und senden Sie Ihre Nachricht erneut." } },
    zh: { phone: "电话", email: "电子邮箱", sent: "消息发送成功！", sendError: "无法发送消息，请重试。", consentRequired: "请接受隐私政策。", successTitle: "消息已发送！", successDescription: "感谢您的留言，我会尽快回复您。", sendAnother: "发送另一条消息", sending: "正在发送...", refusals: { rate_limited: "此网络连接的提交次数过多。请一小时后再试。", security_check_failed: "反机器人验证失败。请刷新页面，然后重新发送您的消息。" } },
  },
  gdpr: {
    fr: { submitted: "Demande RGPD soumise avec succès !", error: "La demande n’a pas pu être envoyée. Veuillez réessayer.", back: "Retour", received: "Demande reçue !", another: "Soumettre une autre demande", sending: "Envoi en cours...", refusals: { rate_limited: "Trop de demandes depuis cette connexion. Réessayez dans 24 heures, ou écrivez directement à {email}.", security_check_failed: "La vérification anti-robot a échoué. Rechargez la page, puis renvoyez votre demande." } },
    en: { submitted: "GDPR request submitted successfully!", error: "The request could not be sent. Please try again.", back: "Back", received: "Request received!", another: "Submit another request", sending: "Submitting...", refusals: { rate_limited: "Too many requests from this connection. Please try again in 24 hours, or write directly to {email}.", security_check_failed: "The anti-bot check failed. Reload the page, then submit your request again." } },
    de: { submitted: "DSGVO-Anfrage erfolgreich übermittelt!", error: "Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.", back: "Zurück", received: "Anfrage eingegangen!", another: "Weitere Anfrage senden", sending: "Wird gesendet...", refusals: { rate_limited: "Zu viele Anfragen über diese Verbindung. Bitte versuchen Sie es in 24 Stunden erneut oder schreiben Sie direkt an {email}.", security_check_failed: "Die Bot-Prüfung ist fehlgeschlagen. Laden Sie die Seite neu und senden Sie Ihre Anfrage erneut." } },
    zh: { submitted: "GDPR 请求已成功提交！", error: "无法发送请求，请重试。", back: "返回", received: "已收到请求！", another: "提交另一项请求", sending: "正在提交...", refusals: { rate_limited: "此网络连接的请求次数过多。请 24 小时后再试，或直接发送邮件至 {email}。", security_check_failed: "反机器人验证失败。请刷新页面，然后重新提交您的请求。" } },
  },
  booking: {
    fr: { submit: "Procéder au paiement", loading: "Traitement...", checkingAvailability: "Vérification du créneau...", availabilityError: "La disponibilité ne peut pas être confirmée pour le moment. Veuillez réessayer avant de procéder au paiement.", available: "Créneau disponible", blocked: "Date indisponible", alreadyBooked: "Ce créneau est déjà réservé", noAvailability: "Aucun horaire de consultation n’est actuellement ouvert.", outsideSchedule: "Cet horaire ne fait pas partie des disponibilités ouvertes.", selectDate: "Sélectionnez une date et une heure" },
    en: { submit: "Proceed to Payment", loading: "Processing...", checkingAvailability: "Checking availability...", availabilityError: "Availability cannot be confirmed at the moment. Please try again before proceeding to payment.", available: "Time slot available", blocked: "Date unavailable", alreadyBooked: "This time slot is already booked", noAvailability: "No consultation hours are currently open.", outsideSchedule: "This time is outside the open consultation schedule.", selectDate: "Select a date and time" },
    de: { submit: "Zur Zahlung übergehen", loading: "Verarbeitung...", checkingAvailability: "Verfügbarkeit wird geprüft...", availabilityError: "Die Verfügbarkeit kann derzeit nicht bestätigt werden. Bitte versuchen Sie es erneut, bevor Sie zur Zahlung übergehen.", available: "Termin verfügbar", blocked: "Datum nicht verfügbar", alreadyBooked: "Dieser Termin ist bereits reserviert", noAvailability: "Derzeit sind keine Beratungszeiten freigeschaltet.", outsideSchedule: "Diese Uhrzeit liegt außerhalb der freigegebenen Beratungszeiten.", selectDate: "Wählen Sie Datum und Uhrzeit" },
    zh: { submit: "继续付款", loading: "处理中...", checkingAvailability: "正在检查可用性...", availabilityError: "目前无法确认可用性。请重试后再继续付款。", available: "时间段可用", blocked: "日期不可用", alreadyBooked: "该时间段已被预订", noAvailability: "目前没有开放的咨询时段。", outsideSchedule: "该时间不在已开放的咨询时段内。", selectDate: "请选择日期和时间" },
  },
  turnstile: {
    fr: { label: "Vérification anti-bot", unavailable: "La vérification anti-bot est indisponible. Veuillez réessayer ultérieurement.", loadError: "La vérification de sécurité n’a pas pu être chargée. L’envoi reste bloqué afin de protéger vos données ; réessayez dans quelques instants.", retry: "Réessayer" },
    en: { label: "Anti-bot verification", unavailable: "The anti-bot verification is unavailable. Please try again later.", loadError: "The security check could not be loaded. Sending stays blocked to protect your data; try again in a few moments.", retry: "Try again" },
    de: { label: "Bot-Prüfung", unavailable: "Die Bot-Prüfung ist nicht verfügbar. Bitte versuchen Sie es später erneut.", loadError: "Die Sicherheitsprüfung konnte nicht geladen werden. Zum Schutz Ihrer Daten bleibt das Senden gesperrt; versuchen Sie es in wenigen Augenblicken erneut.", retry: "Erneut versuchen" },
    zh: { label: "反机器人验证", unavailable: "反机器人验证暂不可用，请稍后重试。", loadError: "无法加载安全验证。为保护您的数据，发送仍被阻止；请稍后重试。", retry: "重试" },
  },
  // Message d'un formulaire refusé avant l'envoi : {fields} reçoit les noms des champs à reprendre (A11Y-03).
  fieldsToCorrect: {
    fr: { list: "À compléter ou corriger : {fields}.", separator: ", ", sentenceSeparator: " " },
    en: { list: "Please complete or correct: {fields}.", separator: ", ", sentenceSeparator: " " },
    de: { list: "Bitte ergänzen oder korrigieren: {fields}.", separator: ", ", sentenceSeparator: " " },
    zh: { list: "请填写或更正：{fields}。", separator: "、", sentenceSeparator: "" },
  },
} as const;

export const getContactFormCopy = (language: string) => publicFormCopy.contact[fallbackLanguage(language)];
export const getGdprRequestCopy = (language: string) => publicFormCopy.gdpr[fallbackLanguage(language)];
export const getBookingFormCopy = (language: string) => publicFormCopy.booking[fallbackLanguage(language)];
export const getTurnstileWidgetCopy = (language: string) => publicFormCopy.turnstile[fallbackLanguage(language)];
export const getFieldsToCorrectCopy = (language: string) => publicFormCopy.fieldsToCorrect[fallbackLanguage(language)];

/**
 * Message d'un envoi refusé du contact ou du RGPD, dans la langue de la page
 * (ABUS-01) : la traduction du motif stable envoyé par le serveur (limite par
 * connexion atteinte, avec le délai avant un nouvel essai, ou anti-robot
 * refusé), sinon le message d'échec générique. Le texte français écrit par le
 * serveur n'est jamais affiché.
 */
export function publicFormErrorMessage(error: unknown, refusals: Record<PublicFormRefusalReason, string>, fallback: string): string {
  const reason = error && typeof error === "object" ? (error as { data?: { reason?: unknown } | null }).data?.reason : undefined;
  return isPublicFormRefusalReason(reason) ? refusals[reason] : fallback;
}
