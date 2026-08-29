export type PublicFormLanguage = "fr" | "en" | "de" | "zh";

const fallbackLanguage = (language: string): PublicFormLanguage =>
  language === "en" || language === "de" || language === "zh" ? language : "fr";

/** Retours réutilisables des formulaires publics, avec repli explicite vers le français. */
export const publicFormCopy = {
  contact: {
    fr: { phone: "Téléphone", email: "Email", sent: "Message envoyé avec succès !", sendError: "L’envoi du message a échoué. Veuillez réessayer.", consentRequired: "Veuillez accepter la politique de confidentialité.", successTitle: "Message envoyé !", successDescription: "Merci pour votre message. Je vous répondrai dans les meilleurs délais.", sendAnother: "Envoyer un autre message", sending: "Envoi en cours..." },
    en: { phone: "Phone", email: "Email", sent: "Message sent successfully!", sendError: "The message could not be sent. Please try again.", consentRequired: "Please accept the privacy policy.", successTitle: "Message sent!", successDescription: "Thank you for your message. I will get back to you as soon as possible.", sendAnother: "Send another message", sending: "Sending..." },
    de: { phone: "Telefon", email: "E-Mail", sent: "Nachricht erfolgreich gesendet!", sendError: "Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut.", consentRequired: "Bitte akzeptieren Sie die Datenschutzerklärung.", successTitle: "Nachricht gesendet!", successDescription: "Vielen Dank für Ihre Nachricht. Ich werde Ihnen schnellstmöglich antworten.", sendAnother: "Weitere Nachricht senden", sending: "Wird gesendet..." },
    zh: { phone: "电话", email: "电子邮箱", sent: "消息发送成功！", sendError: "无法发送消息，请重试。", consentRequired: "请接受隐私政策。", successTitle: "消息已发送！", successDescription: "感谢您的留言，我会尽快回复您。", sendAnother: "发送另一条消息", sending: "正在发送..." },
  },
  gdpr: {
    fr: { submitted: "Demande RGPD soumise avec succès !", error: "La demande n’a pas pu être envoyée. Veuillez réessayer.", back: "Retour", received: "Demande reçue !", another: "Soumettre une autre demande", sending: "Envoi en cours..." },
    en: { submitted: "GDPR request submitted successfully!", error: "The request could not be sent. Please try again.", back: "Back", received: "Request received!", another: "Submit another request", sending: "Submitting..." },
    de: { submitted: "DSGVO-Anfrage erfolgreich übermittelt!", error: "Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.", back: "Zurück", received: "Anfrage eingegangen!", another: "Weitere Anfrage senden", sending: "Wird gesendet..." },
    zh: { submitted: "GDPR 请求已成功提交！", error: "无法发送请求，请重试。", back: "返回", received: "已收到请求！", another: "提交另一项请求", sending: "正在提交..." },
  },
  booking: {
    fr: { invalidDate: "Saisissez une date valide au format JJ/MM/AAAA et une heure au format HH:MM.", submit: "Procéder au paiement", loading: "Traitement...", checkingAvailability: "Vérification du créneau...", availabilityError: "La disponibilité ne peut pas être confirmée pour le moment. Veuillez réessayer avant de procéder au paiement.", available: "Créneau disponible", blocked: "Date indisponible", alreadyBooked: "Ce créneau est déjà réservé", noAvailability: "Aucun horaire de consultation n’est actuellement ouvert.", outsideSchedule: "Cet horaire ne fait pas partie des disponibilités ouvertes.", selectDate: "Sélectionnez une date et une heure" },
    en: { invalidDate: "Enter a valid date in DD/MM/YYYY format and a time in HH:MM format.", submit: "Proceed to Payment", loading: "Processing...", checkingAvailability: "Checking availability...", availabilityError: "Availability cannot be confirmed at the moment. Please try again before proceeding to payment.", available: "Time slot available", blocked: "Date unavailable", alreadyBooked: "This time slot is already booked", noAvailability: "No consultation hours are currently open.", outsideSchedule: "This time is outside the open consultation schedule.", selectDate: "Select a date and time" },
    de: { invalidDate: "Geben Sie ein gültiges Datum im Format TT.MM.JJJJ und eine Uhrzeit im Format HH:MM ein.", submit: "Zur Zahlung übergehen", loading: "Verarbeitung...", checkingAvailability: "Verfügbarkeit wird geprüft...", availabilityError: "Die Verfügbarkeit kann derzeit nicht bestätigt werden. Bitte versuchen Sie es erneut, bevor Sie zur Zahlung übergehen.", available: "Termin verfügbar", blocked: "Datum nicht verfügbar", alreadyBooked: "Dieser Termin ist bereits reserviert", noAvailability: "Derzeit sind keine Beratungszeiten freigeschaltet.", outsideSchedule: "Diese Uhrzeit liegt außerhalb der freigegebenen Beratungszeiten.", selectDate: "Wählen Sie Datum und Uhrzeit" },
    zh: { invalidDate: "请输入有效日期（日/月/年）和时间（时:分）。", submit: "继续付款", loading: "处理中...", checkingAvailability: "正在检查可用性...", availabilityError: "目前无法确认可用性。请重试后再继续付款。", available: "时间段可用", blocked: "日期不可用", alreadyBooked: "该时间段已被预订", noAvailability: "目前没有开放的咨询时段。", outsideSchedule: "该时间不在已开放的咨询时段内。", selectDate: "请选择日期和时间" },
  },
} as const;

export const getContactFormCopy = (language: string) => publicFormCopy.contact[fallbackLanguage(language)];
export const getGdprRequestCopy = (language: string) => publicFormCopy.gdpr[fallbackLanguage(language)];
export const getBookingFormCopy = (language: string) => publicFormCopy.booking[fallbackLanguage(language)];
