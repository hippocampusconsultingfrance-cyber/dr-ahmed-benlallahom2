import {
  isPublicFormRefusalReason,
  type PublicFormRefusalReason,
} from "@shared/publicFormRefusalReasons";

export type PublicFormLanguage = "fr" | "en" | "de" | "zh";

const fallbackLanguage = (language: string): PublicFormLanguage =>
  language === "en" || language === "de" || language === "zh" ? language : "fr";

/**
 * Champ refusé pour ses caractères (INTL-05) : saut de ligne dans un champ sur
 * une ligne, caractère de contrôle ou inversion du sens du texte, souvent
 * laissés par un copier-coller. Le français est celui du serveur
 * (TEXT_INPUT_INVALID_CHARACTERS_MESSAGE, shared/textInput.ts).
 */
const invalidCharactersCopy = {
  fr: "Un champ contient un saut de ligne ou un caractère invisible qui n’y est pas accepté, souvent laissé par un copier-coller : retapez ce texte au clavier, puis renvoyez le formulaire.",
  en: "A field contains a line break or an invisible character that is not accepted there, often left by copying and pasting: type that text again on the keyboard, then send the form again.",
  de: "Ein Feld enthält einen Zeilenumbruch oder ein unsichtbares Zeichen, das dort nicht zulässig ist, oft ein Rest vom Kopieren und Einfügen: Geben Sie diesen Text erneut über die Tastatur ein und senden Sie das Formular dann erneut.",
  zh: "某个字段包含此处不允许的换行符或不可见字符，通常由复制粘贴带入：请用键盘重新输入该内容，然后重新提交表单。",
} as const;

/** Retours réutilisables des formulaires publics, avec repli explicite vers le français. */
export const publicFormCopy = {
  contact: {
    fr: {
      phone: "Téléphone",
      email: "Email",
      sent: "Message envoyé avec succès !",
      sendError: "L’envoi du message a échoué. Veuillez réessayer.",
      consentRequired: "Veuillez accepter la politique de confidentialité.",
      successTitle: "Message envoyé !",
      successDescription:
        "Merci pour votre message. Je vous répondrai dans les meilleurs délais.",
      sendAnother: "Envoyer un autre message",
      sending: "Envoi en cours...",
      refusals: {
        rate_limited:
          "Trop d’envois depuis cette connexion. Réessayez dans une heure.",
        security_check_failed:
          "La vérification anti-robot a échoué. Validez la nouvelle vérification ci-dessous, puis renvoyez votre message.",
        security_check_unavailable:
          "La vérification anti-robot est momentanément indisponible. Votre message n’a pas été envoyé : réessayez dans quelques minutes.",
        invalid_characters: invalidCharactersCopy.fr,
      },
      reference: "Votre référence :",
      categoryLegend: "Vous êtes",
      categories: {
        patient: "Patient",
        health_professional: "Professionnel de santé",
        institution: "Établissement",
        press_partner: "Presse ou partenaire",
      },
      categoryGuides: {
        patient:
          "Pour une consultation, réservez directement en ligne ; pour une question générale sur l’anesthésie, utilisez le service de questions gratuites.",
        health_professional:
          "Pour proposer votre candidature, déposez votre dossier dans l’espace recrutement.",
        institution:
          "Pour un besoin de recrutement, transmettez directement un brief de mission.",
        press_partner: "",
      },
      categoryLinks: {
        booking: "Réserver une consultation",
        medicalQuestions: "Poser une question gratuite",
        recruitment: "Déposer ma candidature",
        employers: "Transmettre un brief de mission",
      },
      medicalNotice: "N’indiquez pas d’information médicale ici.",
    },
    en: {
      phone: "Phone",
      email: "Email",
      sent: "Message sent successfully!",
      sendError: "The message could not be sent. Please try again.",
      consentRequired: "Please accept the privacy policy.",
      successTitle: "Message sent!",
      successDescription:
        "Thank you for your message. I will get back to you as soon as possible.",
      sendAnother: "Send another message",
      sending: "Sending...",
      refusals: {
        rate_limited:
          "Too many submissions from this connection. Please try again in an hour.",
        security_check_failed:
          "The anti-bot check failed. Complete the new check below, then send your message again.",
        security_check_unavailable:
          "The anti-bot check is temporarily unavailable. Your message has not been sent: please try again in a few minutes.",
        invalid_characters: invalidCharactersCopy.en,
      },
      reference: "Your reference:",
      categoryLegend: "You are",
      categories: {
        patient: "Patient",
        health_professional: "Healthcare professional",
        institution: "Institution",
        press_partner: "Press or partner",
      },
      categoryGuides: {
        patient:
          "For a consultation, book directly online; for a general question about anaesthesia, use the free question service.",
        health_professional:
          "To apply, submit your application in the recruitment area.",
        institution: "For a recruitment need, send a mission brief directly.",
        press_partner: "",
      },
      categoryLinks: {
        booking: "Book a consultation",
        medicalQuestions: "Ask a free question",
        recruitment: "Submit my application",
        employers: "Send a mission brief",
      },
      medicalNotice: "Do not include any medical information here.",
    },
    de: {
      phone: "Telefon",
      email: "E-Mail",
      sent: "Nachricht erfolgreich gesendet!",
      sendError:
        "Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
      consentRequired: "Bitte akzeptieren Sie die Datenschutzerklärung.",
      successTitle: "Nachricht gesendet!",
      successDescription:
        "Vielen Dank für Ihre Nachricht. Ich werde Ihnen schnellstmöglich antworten.",
      sendAnother: "Weitere Nachricht senden",
      sending: "Wird gesendet...",
      refusals: {
        rate_limited:
          "Zu viele Anfragen über diese Verbindung. Bitte versuchen Sie es in einer Stunde erneut.",
        security_check_failed:
          "Die Bot-Prüfung ist fehlgeschlagen. Bestätigen Sie die neue Prüfung unten und senden Sie Ihre Nachricht erneut.",
        security_check_unavailable:
          "Die Bot-Prüfung ist vorübergehend nicht verfügbar. Ihre Nachricht wurde nicht gesendet: Bitte versuchen Sie es in einigen Minuten erneut.",
        invalid_characters: invalidCharactersCopy.de,
      },
      reference: "Ihre Referenz:",
      categoryLegend: "Sie sind",
      categories: {
        patient: "Patient/in",
        health_professional: "Gesundheitsfachkraft",
        institution: "Einrichtung",
        press_partner: "Presse oder Partner",
      },
      categoryGuides: {
        patient:
          "Für eine Konsultation buchen Sie direkt online; für eine allgemeine Frage zur Anästhesie nutzen Sie den kostenlosen Fragenservice.",
        health_professional:
          "Für eine Bewerbung reichen Sie Ihre Unterlagen im Recruiting-Bereich ein.",
        institution:
          "Für einen Personalbedarf senden Sie direkt einen Einsatz-Brief.",
        press_partner: "",
      },
      categoryLinks: {
        booking: "Konsultation buchen",
        medicalQuestions: "Kostenlos eine Frage stellen",
        recruitment: "Bewerbung einreichen",
        employers: "Einsatz-Brief senden",
      },
      medicalNotice: "Geben Sie hier keine medizinischen Informationen an.",
    },
    zh: {
      phone: "电话",
      email: "电子邮箱",
      sent: "消息发送成功！",
      sendError: "无法发送消息，请重试。",
      consentRequired: "请接受隐私政策。",
      successTitle: "消息已发送！",
      successDescription: "感谢您的留言，我会尽快回复您。",
      sendAnother: "发送另一条消息",
      sending: "正在发送...",
      refusals: {
        rate_limited: "此网络连接的提交次数过多。请一小时后再试。",
        security_check_failed:
          "反机器人验证失败。请完成下方的新验证，然后重新发送您的消息。",
        security_check_unavailable:
          "反机器人验证暂时不可用，您的消息尚未发送：请几分钟后重试。",
        invalid_characters: invalidCharactersCopy.zh,
      },
      reference: "您的参考编号：",
      categoryLegend: "您是",
      categories: {
        patient: "患者",
        health_professional: "医疗专业人员",
        institution: "医疗机构",
        press_partner: "媒体或合作伙伴",
      },
      categoryGuides: {
        patient:
          "如需咨询，请直接在线预约；如有关于麻醉的一般性问题，请使用免费问答服务。",
        health_professional: "如需申请职位，请在招聘专区提交您的资料。",
        institution: "如有招聘需求，请直接提交任务需求。",
        press_partner: "",
      },
      categoryLinks: {
        booking: "预约咨询",
        medicalQuestions: "免费提问",
        recruitment: "提交申请",
        employers: "提交任务需求",
      },
      medicalNotice: "请勿在此填写任何医疗信息。",
    },
  },
  gdpr: {
    fr: {
      submitted: "Demande RGPD soumise avec succès !",
      error: "La demande n’a pas pu être envoyée. Veuillez réessayer.",
      back: "Retour",
      received: "Demande reçue !",
      another: "Soumettre une autre demande",
      sending: "Envoi en cours...",
      refusals: {
        rate_limited:
          "Trop de demandes depuis cette connexion. Réessayez dans 24 heures, ou écrivez directement à {email}.",
        security_check_failed:
          "La vérification anti-robot a échoué. Rechargez la page, puis renvoyez votre demande.",
        security_check_unavailable:
          "La vérification anti-robot est momentanément indisponible. Votre demande n’a pas été envoyée : réessayez dans quelques minutes, ou écrivez directement à {email}.",
        invalid_characters: invalidCharactersCopy.fr,
      },
    },
    en: {
      submitted: "GDPR request submitted successfully!",
      error: "The request could not be sent. Please try again.",
      back: "Back",
      received: "Request received!",
      another: "Submit another request",
      sending: "Submitting...",
      refusals: {
        rate_limited:
          "Too many requests from this connection. Please try again in 24 hours, or write directly to {email}.",
        security_check_failed:
          "The anti-bot check failed. Reload the page, then submit your request again.",
        security_check_unavailable:
          "The anti-bot check is temporarily unavailable. Your request has not been sent: please try again in a few minutes, or write directly to {email}.",
        invalid_characters: invalidCharactersCopy.en,
      },
    },
    de: {
      submitted: "DSGVO-Anfrage erfolgreich übermittelt!",
      error:
        "Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
      back: "Zurück",
      received: "Anfrage eingegangen!",
      another: "Weitere Anfrage senden",
      sending: "Wird gesendet...",
      refusals: {
        rate_limited:
          "Zu viele Anfragen über diese Verbindung. Bitte versuchen Sie es in 24 Stunden erneut oder schreiben Sie direkt an {email}.",
        security_check_failed:
          "Die Bot-Prüfung ist fehlgeschlagen. Laden Sie die Seite neu und senden Sie Ihre Anfrage erneut.",
        security_check_unavailable:
          "Die Bot-Prüfung ist vorübergehend nicht verfügbar. Ihre Anfrage wurde nicht gesendet: Bitte versuchen Sie es in einigen Minuten erneut oder schreiben Sie direkt an {email}.",
        invalid_characters: invalidCharactersCopy.de,
      },
    },
    zh: {
      submitted: "GDPR 请求已成功提交！",
      error: "无法发送请求，请重试。",
      back: "返回",
      received: "已收到请求！",
      another: "提交另一项请求",
      sending: "正在提交...",
      refusals: {
        rate_limited:
          "此网络连接的请求次数过多。请 24 小时后再试，或直接发送邮件至 {email}。",
        security_check_failed:
          "反机器人验证失败。请刷新页面，然后重新提交您的请求。",
        security_check_unavailable:
          "反机器人验证暂时不可用，您的请求尚未发送：请几分钟后重试，或直接发送邮件至 {email}。",
        invalid_characters: invalidCharactersCopy.zh,
      },
    },
  },
  booking: {
    fr: {
      submit: "Procéder au paiement",
      loading: "Traitement...",
      checkingAvailability: "Vérification du créneau...",
      availabilityError:
        "La disponibilité ne peut pas être confirmée pour le moment. Veuillez réessayer avant de procéder au paiement.",
      available: "Créneau disponible",
      blocked: "Date indisponible",
      alreadyBooked: "Ce créneau est déjà réservé",
      noAvailability:
        "Aucun horaire de consultation n’est actuellement ouvert.",
      outsideSchedule:
        "Cet horaire ne fait pas partie des disponibilités ouvertes.",
      selectDate: "Sélectionnez une date et une heure",
    },
    en: {
      submit: "Proceed to Payment",
      loading: "Processing...",
      checkingAvailability: "Checking availability...",
      availabilityError:
        "Availability cannot be confirmed at the moment. Please try again before proceeding to payment.",
      available: "Time slot available",
      blocked: "Date unavailable",
      alreadyBooked: "This time slot is already booked",
      noAvailability: "No consultation hours are currently open.",
      outsideSchedule: "This time is outside the open consultation schedule.",
      selectDate: "Select a date and time",
    },
    de: {
      submit: "Zur Zahlung übergehen",
      loading: "Verarbeitung...",
      checkingAvailability: "Verfügbarkeit wird geprüft...",
      availabilityError:
        "Die Verfügbarkeit kann derzeit nicht bestätigt werden. Bitte versuchen Sie es erneut, bevor Sie zur Zahlung übergehen.",
      available: "Termin verfügbar",
      blocked: "Datum nicht verfügbar",
      alreadyBooked: "Dieser Termin ist bereits reserviert",
      noAvailability: "Derzeit sind keine Beratungszeiten freigeschaltet.",
      outsideSchedule:
        "Diese Uhrzeit liegt außerhalb der freigegebenen Beratungszeiten.",
      selectDate: "Wählen Sie Datum und Uhrzeit",
    },
    zh: {
      submit: "继续付款",
      loading: "处理中...",
      checkingAvailability: "正在检查可用性...",
      availabilityError: "目前无法确认可用性。请重试后再继续付款。",
      available: "时间段可用",
      blocked: "日期不可用",
      alreadyBooked: "该时间段已被预订",
      noAvailability: "目前没有开放的咨询时段。",
      outsideSchedule: "该时间不在已开放的咨询时段内。",
      selectDate: "请选择日期和时间",
    },
  },
  // fallback : autre voie quand le défi ne passe pas (A11Y-09) ; {email} et {phone} deviennent des liens mailto: et tel:.
  turnstile: {
    fr: {
      label: "Vérification anti-bot",
      unavailable:
        "La vérification anti-bot est indisponible. Veuillez réessayer ultérieurement.",
      loadError:
        "La vérification de sécurité n’a pas pu être chargée. L’envoi reste bloqué afin de protéger vos données ; réessayez dans quelques instants.",
      retry: "Réessayer",
      fallback:
        "Vous pouvez aussi nous écrire à {email} ou nous appeler au {phone}.",
    },
    en: {
      label: "Anti-bot verification",
      unavailable:
        "The anti-bot verification is unavailable. Please try again later.",
      loadError:
        "The security check could not be loaded. Sending stays blocked to protect your data; try again in a few moments.",
      retry: "Try again",
      fallback: "You can also write to us at {email} or call us on {phone}.",
    },
    de: {
      label: "Bot-Prüfung",
      unavailable:
        "Die Bot-Prüfung ist nicht verfügbar. Bitte versuchen Sie es später erneut.",
      loadError:
        "Die Sicherheitsprüfung konnte nicht geladen werden. Zum Schutz Ihrer Daten bleibt das Senden gesperrt; versuchen Sie es in wenigen Augenblicken erneut.",
      retry: "Erneut versuchen",
      fallback:
        "Sie können uns auch an {email} schreiben oder unter {phone} anrufen.",
    },
    zh: {
      label: "反机器人验证",
      unavailable: "反机器人验证暂不可用，请稍后重试。",
      loadError: "无法加载安全验证。为保护您的数据，发送仍被阻止；请稍后重试。",
      retry: "重试",
      fallback: "您也可以发送邮件至 {email} 或致电 {phone} 联系我们。",
    },
  },
  invalidCharacters: invalidCharactersCopy,
  // Message d'un formulaire refusé avant l'envoi : {fields} reçoit les noms des champs à reprendre (A11Y-03).
  fieldsToCorrect: {
    fr: {
      list: "À compléter ou corriger : {fields}.",
      separator: ", ",
      sentenceSeparator: " ",
    },
    en: {
      list: "Please complete or correct: {fields}.",
      separator: ", ",
      sentenceSeparator: " ",
    },
    de: {
      list: "Bitte ergänzen oder korrigieren: {fields}.",
      separator: ", ",
      sentenceSeparator: " ",
    },
    zh: {
      list: "请填写或更正：{fields}。",
      separator: "、",
      sentenceSeparator: "",
    },
  },
} as const;

export const getContactFormCopy = (language: string) =>
  publicFormCopy.contact[fallbackLanguage(language)];
export const getGdprRequestCopy = (language: string) =>
  publicFormCopy.gdpr[fallbackLanguage(language)];
export const getBookingFormCopy = (language: string) =>
  publicFormCopy.booking[fallbackLanguage(language)];
export const getTurnstileWidgetCopy = (language: string) =>
  publicFormCopy.turnstile[fallbackLanguage(language)];
export const getFieldsToCorrectCopy = (language: string) =>
  publicFormCopy.fieldsToCorrect[fallbackLanguage(language)];
/** Message d'un champ refusé pour ses caractères (motif invalid_characters, INTL-05), pour les formulaires sans dictionnaire de motifs. */
export const getInvalidCharactersCopy = (language: string) =>
  publicFormCopy.invalidCharacters[fallbackLanguage(language)];

/**
 * Message d'un envoi refusé du contact ou du RGPD, dans la langue de la page
 * (ABUS-01) : la traduction du motif stable envoyé par le serveur (limite par
 * connexion atteinte, avec le délai avant un nouvel essai, anti-robot refusé,
 * ou indisponible chez Cloudflare, champ refusé pour ses caractères), sinon
 * le message d'échec générique. Le
 * texte français écrit par le serveur n'est jamais affiché.
 */
export function publicFormErrorMessage(
  error: unknown,
  refusals: Record<PublicFormRefusalReason, string>,
  fallback: string
): string {
  const reason =
    error && typeof error === "object"
      ? (error as { data?: { reason?: unknown } | null }).data?.reason
      : undefined;
  return isPublicFormRefusalReason(reason) ? refusals[reason] : fallback;
}
