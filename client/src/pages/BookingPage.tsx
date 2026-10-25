import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { Calendar, Clock, User, Mail, Phone, FileText, CheckCircle, AlertCircle } from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { SEOHead } from "@/components/SEOHead";
import Footer from "@/components/Footer";
import BookingLegalNotice from "@/components/BookingLegalNotice";
import LanguageMenu from "@/components/LanguageMenu";
import { formatVisitorTime, getBookingDateTimeFormat, getBookingLocale } from "@/lib/bookingTime";
import { getBookingFormCopy } from "@/lib/publicFormCopy";
import {
  clearBookingDraft,
  clearPendingBooking,
  loadBookingDraft,
  loadPendingBooking,
  saveBookingDraft,
  savePendingBooking,
  type PendingBooking,
} from "@/lib/pendingBooking";
import {
  BOOKING_HORIZON_DAYS,
  BOOKING_MIN_LEAD_TIME_HOURS,
  BOOKING_REQUEST_SUBJECT_MAX_LENGTH,
  BOOKING_HORIZON_MS,
  getBookingWindowIssue,
  isBookingRefusalReason,
  isPlausiblePhoneNumber,
  type BookingRefusalReason,
} from "@shared/bookingPolicy";

// Délai minimal et horizon : même texte pour la vérification de la page et pour
// le refus du serveur (EN-06).
const bookingWindowMessages = {
  fr: {
    tooSoon: `Ce créneau n’est plus réservable : réservez au moins ${BOOKING_MIN_LEAD_TIME_HOURS} h à l’avance.`,
    tooFar: `Les réservations sont ouvertes jusqu’à ${BOOKING_HORIZON_DAYS} jours à l’avance.`,
  },
  en: {
    tooSoon: `This time slot can no longer be booked: please book at least ${BOOKING_MIN_LEAD_TIME_HOURS} hours ahead.`,
    tooFar: `Bookings are open up to ${BOOKING_HORIZON_DAYS} days ahead.`,
  },
  de: {
    tooSoon: `Dieser Termin kann nicht mehr gebucht werden: Bitte buchen Sie mindestens ${BOOKING_MIN_LEAD_TIME_HOURS} Stunden im Voraus.`,
    tooFar: `Buchungen sind bis zu ${BOOKING_HORIZON_DAYS} Tage im Voraus möglich.`,
  },
  zh: {
    tooSoon: `该时段已无法预约：请至少提前 ${BOOKING_MIN_LEAD_TIME_HOURS} 小时预约。`,
    tooFar: `最多可提前 ${BOOKING_HORIZON_DAYS} 天预约。`,
  },
};

export const bookingContent = {
  fr: {
    title: "Réserver une Consultation",
    subtitle: "Conseil en santé - 30 minutes",
    form: {
      name: "Nom complet",
      email: "Email",
      phone: "Numéro de téléphone",
      date: "Date et heure",
      day: "Jour",
      dayPlaceholder: "Choisissez un jour",
      slotsLegend: "Horaire (heure de Paris)",
      openingHours: "Disponibilités (heure de Paris)",
      noBookableDay: `Aucun créneau n’est disponible dans les ${BOOKING_HORIZON_DAYS} prochains jours.`,
      noSlotsThisDay: "Tous les horaires de ce jour sont déjà réservés. Choisissez un autre jour.",
      noSlotsLeftThisDay: "Plus aucun horaire n’est disponible ce jour-là. Choisissez un autre jour.",
      slotsError: "Les horaires de ce jour n’ont pas pu être chargés.",
      retry: "Réessayer",
      priceError: "Le tarif de cet horaire n’a pas pu être calculé. Réessayez avant de procéder au paiement.",
      parisTime: "heure de Paris",
      localTime: (time: string) => `soit ${time} chez vous`,
      localTimeShort: (time: string) => `${time} chez vous`,
      dateHint: "Choisissez un jour, puis un horaire libre. Les horaires sont en heure de Paris ; l’heure de chez vous s’affiche dessous lorsqu’elle diffère.",
      windowHint: `Réservation au moins ${BOOKING_MIN_LEAD_TIME_HOURS} h à l’avance et jusqu’à ${BOOKING_HORIZON_DAYS} jours.`,
      tooSoon: bookingWindowMessages.fr.tooSoon,
      tooFar: bookingWindowMessages.fr.tooFar,
      invalidPhone: "Saisissez un numéro de téléphone valide (8 à 15 chiffres, indicatif international accepté, ex. +33 6 12 34 56 78).",
      details: "Objet de la demande (sans information médicale)",
      detailsPlaceholder: "Ex. : demande d’avis, questions d’organisation, préparation de la consultation",
      detailsWarning: "N’indiquez ici aucune information de santé (symptômes, diagnostic, traitement, antécédents, résultats d’examens). Ces éléments seront abordés uniquement pendant la consultation.",
      submit: "Procéder au paiement",
      loading: "Traitement...",
      checkingAvailability: "Vérification du créneau...",
      availabilityError: "La disponibilité ne peut pas être confirmée pour le moment. Veuillez réessayer avant de procéder au paiement.",
      available: "Créneau disponible",
      blocked: "Date indisponible",
      alreadyBooked: "Ce créneau est déjà réservé",
      selectDate: "Sélectionnez une date et une heure",
      noAvailability: "Aucun créneau de consultation n’est configuré pour le moment.",
      outsideSchedule: "Ce créneau est en dehors des horaires de consultation disponibles.",
    },
    // Refus du serveur, traduits à partir de leur motif stable (EN-06).
    refusals: {
      slot_taken: "Ce créneau vient d’être réservé par un autre patient. Choisissez-en un autre.",
      too_soon: bookingWindowMessages.fr.tooSoon,
      too_far: bookingWindowMessages.fr.tooFar,
      outside_schedule: "Ce créneau ne fait plus partie des horaires de consultation. Choisissez-en un autre.",
      no_availability: "Aucun horaire de consultation n’est ouvert pour le moment.",
      date_blocked: "Cette date n’est plus disponible. Choisissez un autre jour.",
      rate_limited: "Trop de tentatives de réservation ont été effectuées. Réessayez dans une heure ou contactez-nous directement.",
      too_many_holds: "Vous avez déjà deux réservations en attente de paiement. Finalisez ou annulez l’un de ces paiements, ou patientez une trentaine de minutes avant de réserver un nouveau créneau.",
      payment_unavailable: "Le service de paiement est momentanément indisponible. Votre créneau n’a pas été réservé : réessayez dans quelques minutes ou contactez-nous.",
    },
    pricing: {
      title: "Tarification",
      dayRate: "Tarif jour (8h-18h)",
      nightRate: "Tarif nuit (18h-8h)",
      eur: "€",
      total: "Total",
    },
    success: "Réservation créée avec succès!",
    error: "Erreur lors de la création de la réservation",
    paymentSuccess: "Paiement réussi! Votre consultation a été confirmée.",
    paymentCanceled: "Paiement annulé. Votre réservation n'a pas été finalisée.",
    confirmationNextSteps: "Un email de confirmation et votre facture vous seront envoyés après validation du paiement.",
    canceledNextSteps: "Vous pouvez modifier vos informations puis relancer le paiement lorsque vous êtes prêt.",
    restartBooking: "Nouvelle réservation",
    paymentError: "Une erreur est survenue pendant le paiement.",
    bookingError: "Une erreur est survenue pendant la création de la réservation.",
    invalidInput: "Certaines informations sont invalides : vérifiez votre nom, votre email, votre téléphone et la date choisie.",
          trackingId: "Numéro de suivi:",
      cancellation: "Remboursement intégral au-delà de 24 h avant le rendez-vous. Après ce délai, la réservation n’est pas remboursable.",
      paymentTrust: "Paiement sécurisé par Stripe · Confirmation et facture envoyées par email",
      availabilityLabel: "Disponibilité",
      emergencyTitle: "En cas d’urgence",
      emergencyNote: "En cas d’urgence médicale ou de danger immédiat, appelez immédiatement les secours. Cette consultation programmée ne remplace pas une prise en charge d’urgence.",
      pending: {
        title: "Un paiement est en attente",
        description: "Votre créneau est réservé temporairement pendant le paiement. Reprenez le paiement pour confirmer la consultation, ou annulez pour choisir un autre créneau.",
        slot: "Créneau",
        remaining: "Temps restant pour payer",
        remainingValue: (minutes: number) => (minutes < 1 ? "moins d’une minute" : `encore ${minutes} min`),
        reference: "Référence",
        // Ponctuation des libellés de l’encart : espace avant les deux-points en français seulement.
        labelSeparator: " : ",
        resume: "Reprendre le paiement",
        cancel: "Annuler et choisir un autre créneau",
        cancelled: "Le créneau a été libéré. Vos informations sont conservées : choisissez une nouvelle date ou heure.",
        closed: "Cette réservation n’est plus en attente. Si vous avez finalisé le paiement, vous recevrez une confirmation par email ; sinon, choisissez à nouveau votre créneau.",
        resumeError: "Le paiement ne peut plus être repris (session expirée). Choisissez à nouveau votre créneau.",
        resumeUnavailable: "Le service de paiement est momentanément indisponible. Votre créneau reste réservé pendant le temps restant : réessayez de reprendre le paiement dans quelques minutes ou contactez-nous.",
        cancelError: "L’annulation n’a pas pu être confirmée. Réessayez dans un instant.",
      },

  },
  en: {
    title: "Book a Consultation",
    subtitle: "Health Advice - 30 minutes",
    form: {
      name: "Full Name",
      email: "Email",
      phone: "Phone Number",
      date: "Date and Time",
      day: "Day",
      dayPlaceholder: "Choose a day",
      slotsLegend: "Time (Paris time)",
      openingHours: "Availability (Paris time)",
      noBookableDay: `No time slot is available in the next ${BOOKING_HORIZON_DAYS} days.`,
      noSlotsThisDay: "All times on this day are already booked. Please choose another day.",
      noSlotsLeftThisDay: "No times are available on this day any more. Please choose another day.",
      slotsError: "The times for this day could not be loaded.",
      retry: "Try again",
      priceError: "The price for this time could not be calculated. Please try again before proceeding to payment.",
      parisTime: "Paris time",
      localTime: (time: string) => `that is ${time} your time`,
      localTimeShort: (time: string) => `${time} your time`,
      dateHint: "Choose a day, then a free time. Times are in Paris time; your own time is shown below when it differs.",
      windowHint: `Book at least ${BOOKING_MIN_LEAD_TIME_HOURS} hours ahead and up to ${BOOKING_HORIZON_DAYS} days ahead.`,
      tooSoon: bookingWindowMessages.en.tooSoon,
      tooFar: bookingWindowMessages.en.tooFar,
      invalidPhone: "Enter a valid phone number (8 to 15 digits, international prefix accepted, e.g. +33 6 12 34 56 78).",
      details: "Purpose of your request (no medical information)",
      detailsPlaceholder: "E.g. request for advice, practical questions, preparing the consultation",
      detailsWarning: "Do not enter any health information here (symptoms, diagnosis, treatment, medical history, test results). These will only be discussed during the consultation.",
      submit: "Proceed to Payment",
      loading: "Processing...",
      checkingAvailability: "Checking availability...",
      availabilityError: "Availability cannot be confirmed at the moment. Please try again before proceeding to payment.",
      available: "Time slot available",
      blocked: "Date unavailable",
      alreadyBooked: "This time slot is already booked",
      selectDate: "Select a date and time",
      noAvailability: "No consultation time slots are currently configured.",
      outsideSchedule: "This time slot is outside the available consultation hours.",
    },
    refusals: {
      slot_taken: "This time slot has just been booked by another patient. Please choose another one.",
      too_soon: bookingWindowMessages.en.tooSoon,
      too_far: bookingWindowMessages.en.tooFar,
      outside_schedule: "This time slot is no longer part of the consultation hours. Please choose another one.",
      no_availability: "No consultation hours are open at the moment.",
      date_blocked: "This date is no longer available. Please choose another day.",
      rate_limited: "Too many booking attempts have been made. Please try again in an hour or contact us directly.",
      too_many_holds: "You already have two bookings awaiting payment. Complete or cancel one of these payments, or wait about thirty minutes before booking a new time slot.",
      payment_unavailable: "The payment service is temporarily unavailable. Your time slot has not been booked: please try again in a few minutes or contact us.",
    },
    pricing: {
      title: "Pricing",
      dayRate: "Day Rate (8am-6pm)",
      nightRate: "Night Rate (6pm-8am)",
      eur: "€",
      total: "Total",
    },
    success: "Booking created successfully!",
    error: "Error creating booking",
    paymentSuccess: "Payment successful! Your consultation has been confirmed.",
    paymentCanceled: "Payment canceled. Your booking was not finalized.",
    confirmationNextSteps: "A confirmation email and your invoice will be sent after the payment is validated.",
    canceledNextSteps: "You can update your information and restart the payment whenever you are ready.",
    restartBooking: "Start a new booking",
    paymentError: "An error occurred during payment.",
    bookingError: "An error occurred while creating your booking.",
    invalidInput: "Some information is invalid: please check your name, email, phone number and chosen date.",
          trackingId: "Tracking ID:",
      cancellation: "Full refund is available more than 24 hours before the appointment. After that deadline, the booking is non-refundable.",
      paymentTrust: "Secure payment by Stripe · Confirmation and invoice sent by email",
      availabilityLabel: "Availability",
      emergencyTitle: "In an emergency",
      emergencyNote: "For a medical emergency or immediate danger, call emergency services immediately. This scheduled consultation does not replace emergency care.",
      pending: {
        title: "A payment is pending",
        description: "Your time slot is held temporarily during payment. Resume the payment to confirm the consultation, or cancel to choose another time slot.",
        slot: "Time slot",
        remaining: "Time left to pay",
        remainingValue: (minutes: number) => (minutes < 1 ? "less than a minute" : `${minutes} min left`),
        reference: "Reference",
        labelSeparator: ": ",
        resume: "Resume payment",
        cancel: "Cancel and choose another time slot",
        cancelled: "The time slot has been released. Your details are kept: choose a new date or time.",
        closed: "This booking is no longer pending. If you completed the payment, you will receive a confirmation email; otherwise, choose your time slot again.",
        resumeError: "The payment can no longer be resumed (session expired). Please choose your time slot again.",
        resumeUnavailable: "The payment service is temporarily unavailable. Your time slot remains held for the time left: please try resuming the payment in a few minutes or contact us.",
        cancelError: "The cancellation could not be confirmed. Please try again in a moment.",
      },

  },
  de: {
    title: "Beratung buchen",
    subtitle: "Gesundheitsberatung - 30 Minuten",
    form: {
      name: "Vollständiger Name",
      email: "E-Mail",
      phone: "Telefonnummer",
      date: "Datum und Uhrzeit",
      day: "Tag",
      dayPlaceholder: "Tag wählen",
      slotsLegend: "Uhrzeit (Pariser Zeit)",
      openingHours: "Verfügbarkeit (Pariser Zeit)",
      noBookableDay: `In den nächsten ${BOOKING_HORIZON_DAYS} Tagen ist kein Termin verfügbar.`,
      noSlotsThisDay: "Alle Uhrzeiten an diesem Tag sind bereits gebucht. Bitte wählen Sie einen anderen Tag.",
      noSlotsLeftThisDay: "An diesem Tag ist keine Uhrzeit mehr verfügbar. Bitte wählen Sie einen anderen Tag.",
      slotsError: "Die Uhrzeiten für diesen Tag konnten nicht geladen werden.",
      retry: "Erneut versuchen",
      priceError: "Der Preis für diese Uhrzeit konnte nicht berechnet werden. Bitte versuchen Sie es erneut, bevor Sie zur Zahlung übergehen.",
      parisTime: "Pariser Zeit",
      localTime: (time: string) => `also ${time} bei Ihnen`,
      localTimeShort: (time: string) => `${time} bei Ihnen`,
      dateHint: "Wählen Sie einen Tag und dann eine freie Uhrzeit. Die Uhrzeiten sind in Pariser Zeit; Ihre Ortszeit wird darunter angezeigt, wenn sie abweicht.",
      windowHint: `Buchung mindestens ${BOOKING_MIN_LEAD_TIME_HOURS} Stunden im Voraus und bis zu ${BOOKING_HORIZON_DAYS} Tage im Voraus.`,
      tooSoon: bookingWindowMessages.de.tooSoon,
      tooFar: bookingWindowMessages.de.tooFar,
      invalidPhone: "Geben Sie eine gültige Telefonnummer ein (8 bis 15 Ziffern, internationale Vorwahl möglich, z. B. +49 30 1234567).",
      details: "Anlass Ihrer Anfrage (ohne medizinische Angaben)",
      detailsPlaceholder: "z. B. Bitte um Rat, organisatorische Fragen, Vorbereitung der Beratung",
      detailsWarning: "Geben Sie hier keine Gesundheitsdaten an (Symptome, Diagnose, Behandlung, Vorgeschichte, Untersuchungsergebnisse). Diese werden ausschließlich während der Beratung besprochen.",
      submit: "Zur Zahlung übergehen",
      loading: "Verarbeitung...",
      checkingAvailability: "Verfügbarkeit wird geprüft...",
      availabilityError: "Die Verfügbarkeit kann derzeit nicht bestätigt werden. Bitte versuchen Sie es erneut, bevor Sie zur Zahlung übergehen.",
      available: "Termin verfügbar",
      blocked: "Datum nicht verfügbar",
      alreadyBooked: "Dieser Termin ist bereits reserviert",
      selectDate: "Wählen Sie Datum und Uhrzeit",
      noAvailability: "Derzeit sind keine Beratungszeiten konfiguriert.",
      outsideSchedule: "Dieser Termin liegt außerhalb der verfügbaren Beratungszeiten.",
    },
    refusals: {
      slot_taken: "Dieser Termin wurde soeben von einer anderen Person gebucht. Bitte wählen Sie einen anderen.",
      too_soon: bookingWindowMessages.de.tooSoon,
      too_far: bookingWindowMessages.de.tooFar,
      outside_schedule: "Dieser Termin liegt nicht mehr innerhalb der Beratungszeiten. Bitte wählen Sie einen anderen.",
      no_availability: "Derzeit sind keine Beratungszeiten freigeschaltet.",
      date_blocked: "Dieses Datum ist nicht mehr verfügbar. Bitte wählen Sie einen anderen Tag.",
      rate_limited: "Es wurden zu viele Buchungsversuche unternommen. Bitte versuchen Sie es in einer Stunde erneut oder kontaktieren Sie uns direkt.",
      too_many_holds: "Sie haben bereits zwei Buchungen, die auf Zahlung warten. Schließen Sie eine dieser Zahlungen ab oder stornieren Sie sie, oder warten Sie etwa dreißig Minuten, bevor Sie einen neuen Termin buchen.",
      payment_unavailable: "Der Zahlungsdienst ist vorübergehend nicht verfügbar. Ihr Termin wurde nicht reserviert: Bitte versuchen Sie es in einigen Minuten erneut oder kontaktieren Sie uns.",
    },
    pricing: {
      title: "Preisgestaltung",
      dayRate: "Tagessatz (8:00-18:00)",
      nightRate: "Nachtsatz (18:00-8:00)",
      eur: "€",
      total: "Gesamt",
    },
    success: "Buchung erfolgreich erstellt!",
    error: "Fehler beim Erstellen der Buchung",
    paymentSuccess: "Zahlung erfolgreich! Ihre Beratung wurde bestätigt.",
    paymentCanceled: "Zahlung abgebrochen. Ihre Buchung wurde nicht abgeschlossen.",
    confirmationNextSteps: "Nach erfolgreicher Zahlung erhalten Sie eine Bestätigungs-E-Mail und Ihre Rechnung.",
    canceledNextSteps: "Sie können Ihre Angaben ändern und die Zahlung erneut starten, sobald Sie bereit sind.",
    restartBooking: "Neue Buchung",
    paymentError: "Bei der Zahlung ist ein Fehler aufgetreten.",
    bookingError: "Bei der Erstellung der Buchung ist ein Fehler aufgetreten.",
    invalidInput: "Einige Angaben sind ungültig: Bitte prüfen Sie Name, E-Mail, Telefonnummer und gewähltes Datum.",
          trackingId: "Verfolgungsnummer:",
      cancellation: "Eine vollständige Rückerstattung ist mehr als 24 Stunden vor dem Termin möglich. Danach ist die Buchung nicht erstattungsfähig.",
      paymentTrust: "Sichere Zahlung über Stripe · Bestätigung und Rechnung per E-Mail",
      availabilityLabel: "Verfügbarkeit",
      emergencyTitle: "Im Notfall",
      emergencyNote: "Bei einem medizinischen Notfall oder unmittelbarer Gefahr rufen Sie sofort den Rettungsdienst an. Diese geplante Beratung ersetzt keine Notfallversorgung.",
      pending: {
        title: "Eine Zahlung ist ausstehend",
        description: "Ihr Termin ist während der Zahlung vorübergehend reserviert. Setzen Sie die Zahlung fort, um die Beratung zu bestätigen, oder stornieren Sie, um einen anderen Termin zu wählen.",
        slot: "Termin",
        remaining: "Verbleibende Zeit zum Bezahlen",
        remainingValue: (minutes: number) => (minutes < 1 ? "weniger als eine Minute" : `noch ${minutes} Min.`),
        reference: "Referenz",
        labelSeparator: ": ",
        resume: "Zahlung fortsetzen",
        cancel: "Stornieren und anderen Termin wählen",
        cancelled: "Der Termin wurde freigegeben. Ihre Angaben bleiben erhalten: Wählen Sie ein neues Datum oder eine neue Uhrzeit.",
        closed: "Diese Buchung ist nicht mehr ausstehend. Wenn Sie die Zahlung abgeschlossen haben, erhalten Sie eine Bestätigung per E-Mail; andernfalls wählen Sie Ihren Termin erneut.",
        resumeError: "Die Zahlung kann nicht mehr fortgesetzt werden (Sitzung abgelaufen). Bitte wählen Sie Ihren Termin erneut.",
        resumeUnavailable: "Der Zahlungsdienst ist vorübergehend nicht verfügbar. Ihr Termin bleibt für die verbleibende Zeit reserviert: Bitte versuchen Sie in einigen Minuten erneut, die Zahlung fortzusetzen, oder kontaktieren Sie uns.",
        cancelError: "Die Stornierung konnte nicht bestätigt werden. Bitte versuchen Sie es gleich noch einmal.",
      },

  },
  zh: {
    title: "预订咨询",
    subtitle: "健康咨询 - 30 分钟",
    form: {
      name: "全名",
      email: "电子邮件",
      phone: "电话号码",
      date: "日期和时间",
      day: "日期",
      dayPlaceholder: "请选择日期",
      slotsLegend: "时间（巴黎时间）",
      openingHours: "可预约时间（巴黎时间）",
      noBookableDay: `未来 ${BOOKING_HORIZON_DAYS} 天内没有可预约的时段。`,
      noSlotsThisDay: "当天所有时间均已被预订，请选择其他日期。",
      noSlotsLeftThisDay: "当天已没有可预约的时间，请选择其他日期。",
      slotsError: "无法加载当天的时间。",
      retry: "重试",
      priceError: "无法计算该时间的费用。请重试后再继续付款。",
      parisTime: "巴黎时间",
      localTime: (time: string) => `即您当地时间 ${time}`,
      localTimeShort: (time: string) => `当地 ${time}`,
      dateHint: "请先选择日期，再选择空闲时间。时间均为巴黎时间；如与您当地时间不同，将在下方显示当地时间。",
      windowHint: `请至少提前 ${BOOKING_MIN_LEAD_TIME_HOURS} 小时预约，最多可提前 ${BOOKING_HORIZON_DAYS} 天。`,
      tooSoon: bookingWindowMessages.zh.tooSoon,
      tooFar: bookingWindowMessages.zh.tooFar,
      invalidPhone: "请输入有效的电话号码（8 至 15 位数字，可含国际区号，例如 +33 6 12 34 56 78）。",
      details: "咨询事由（请勿填写医疗信息）",
      detailsPlaceholder: "例如：寻求建议、组织安排问题、咨询准备",
      detailsWarning: "请勿在此填写任何健康信息（症状、诊断、治疗、病史、检查结果）。这些内容仅在咨询过程中讨论。",
      submit: "继续付款",
      loading: "处理中...",
      checkingAvailability: "正在检查可用性...",
      availabilityError: "目前无法确认可用性。请重试后再继续付款。",
      available: "时间段可用",
      blocked: "日期不可用",
      alreadyBooked: "该时间段已被预订",
      selectDate: "请选择日期和时间",
      noAvailability: "目前尚未配置可预约的咨询时段。",
      outsideSchedule: "该时间不在可预约的咨询时间范围内。",
    },
    refusals: {
      slot_taken: "该时段刚刚被其他患者预订，请选择其他时段。",
      too_soon: bookingWindowMessages.zh.tooSoon,
      too_far: bookingWindowMessages.zh.tooFar,
      outside_schedule: "该时段已不在咨询时间范围内，请选择其他时段。",
      no_availability: "目前没有开放的咨询时段。",
      date_blocked: "该日期已不可预约，请选择其他日期。",
      rate_limited: "预约尝试次数过多。请一小时后再试，或直接联系我们。",
      too_many_holds: "您已有两笔待付款的预约。请完成或取消其中一笔付款，或等待约三十分钟后再预约新的时段。",
      payment_unavailable: "支付服务暂时不可用，您的时段尚未预订：请几分钟后重试或联系我们。",
    },
    pricing: {
      title: "价格",
      dayRate: "日间费率 (8:00-18:00)",
      nightRate: "夜间费率 (18:00-8:00)",
      eur: "€",
      total: "总计",
    },
    success: "预订成功创建!",
    error: "创建预订时出错",
    paymentSuccess: "付款成功！您的咨询已确认。",
    paymentCanceled: "付款已取消。您的预订未最终确定。",
    confirmationNextSteps: "付款确认后，您将通过电子邮件收到确认信息和发票。",
    canceledNextSteps: "您可以修改信息，并在准备好后重新开始付款。",
    restartBooking: "新建预约",
    paymentError: "付款过程中发生错误。",
    bookingError: "创建预约时发生错误。",
    invalidInput: "部分信息无效：请检查您的姓名、电子邮件、电话号码和所选日期。",
          trackingId: "跟踪 ID:",
      cancellation: "预约前24小时以上可全额退款，超过此期限后不可退款。",
      paymentTrust: "Stripe安全支付 · 确认信息和发票将通过电子邮件发送",
      availabilityLabel: "可用性",
      emergencyTitle: "紧急情况",
      emergencyNote: "如遇医疗紧急情况或面临即时危险，请立即联系急救服务。本次预约咨询不能替代紧急医疗救治。",
      pending: {
        title: "有一笔付款待完成",
        description: "付款期间您的时段已被临时保留。继续付款以确认咨询，或取消后选择其他时段。",
        slot: "时段",
        remaining: "剩余付款时间",
        remainingValue: (minutes: number) => (minutes < 1 ? "不到 1 分钟" : `还剩 ${minutes} 分钟`),
        reference: "编号",
        labelSeparator: "：",
        resume: "继续付款",
        cancel: "取消并选择其他时段",
        cancelled: "该时段已释放。您的信息已保留：请选择新的日期或时间。",
        closed: "此预约已不再处于待付款状态。如果您已完成付款，将收到确认邮件；否则请重新选择时段。",
        resumeError: "无法继续付款（会话已过期）。请重新选择时段。",
        resumeUnavailable: "支付服务暂时不可用。在剩余时间内，您的时段仍为您保留：请几分钟后再次尝试继续付款，或联系我们。",
        cancelError: "无法确认取消。请稍后重试。",
      },

  },
};

export type BookingAvailabilitySlot = { dayOfWeek: number; startTime: string; endTime: string };

/** A 30-minute start offered in the grid: exact instant, Paris calendar day and Paris time. */
export type BookingSlotOption = { start: Date; dayKey: string; time: string };

const PARIS_BOOKING_DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Un seul formateur, lu une fois par heure UTC (getParisOffsetMs) pour les créneaux des 90 jours.
const PARIS_BOOKING_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Paris",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type ParisBookingParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: string };

const BOOKING_HOUR_MS = 60 * 60 * 1000;
const BOOKING_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Décalage de Paris par heure UTC : il ne change qu'à 01:00 UTC (passage à l'heure d'été ou
// d'hiver), donc un seul formatage par heure sert à tous les créneaux des 90 jours de la grille.
const parisOffsetByUtcHour = new Map<number, number>();
const PARIS_OFFSET_CACHE_LIMIT = 20_000;

function getParisOffsetMs(time: number): number {
  const utcHour = Math.floor(time / BOOKING_HOUR_MS);
  const cached = parisOffsetByUtcHour.get(utcHour);
  if (cached !== undefined) return cached;
  const hourStart = utcHour * BOOKING_HOUR_MS;
  const values = Object.fromEntries(PARIS_BOOKING_PARTS.formatToParts(new Date(hourStart)).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  const offset = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute) - hourStart;
  if (parisOffsetByUtcHour.size >= PARIS_OFFSET_CACHE_LIMIT) parisOffsetByUtcHour.clear();
  parisOffsetByUtcHour.set(utcHour, offset);
  return offset;
}

function getParisBookingParts(date: Date): ParisBookingParts {
  const time = date.getTime();
  const paris = new Date(time + getParisOffsetMs(time));
  return {
    year: paris.getUTCFullYear(), month: paris.getUTCMonth() + 1, day: paris.getUTCDate(),
    hour: paris.getUTCHours(), minute: paris.getUTCMinutes(), weekday: BOOKING_WEEKDAYS[paris.getUTCDay()],
  };
}

export function toParisBookingDateKey(date: Date): string {
  const parts = getParisBookingParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function bookingTimeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : Number.NaN;
}

function minutesToBookingTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Paris calendar day `days` days after `dayKey` ("2026-11-05"). */
function addBookingDays(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Instant of a Paris wall-clock time ("2026-11-05", "19:00"), whatever the
 * visitor's time zone; null for a time that does not exist in Paris (the hour
 * skipped when clocks go forward) or an impossible date.
 */
export function parisBookingSlotStart(dayKey: string, time: string): Date | null {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dayMatch || !timeMatch) return null;
  const [year, month, day] = dayMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  const wallClockMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMs = wallClockMs;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getParisBookingParts(new Date(utcMs));
    const representedWallClockMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const offsetErrorMs = representedWallClockMs - wallClockMs;
    if (offsetErrorMs === 0) break;
    utcMs -= offsetErrorMs;
  }

  const parsed = new Date(utcMs);
  const verified = getParisBookingParts(parsed);
  return verified.year === year && verified.month === month && verified.day === day && verified.hour === hour && verified.minute === minute
    ? parsed
    : null;
}

/**
 * Every 30-minute start the server accepts (RES-02): drawn from the opening
 * hours in Paris time (a range past midnight also opens the early hours of the
 * next day), within the booking window (2 h ahead, 90 days at most), minus the
 * blocked dates. Booked slots are removed per day with removeBookedSlots.
 */
export function listBookableSlots(
  slots: BookingAvailabilitySlot[],
  blockedDateKeys: Iterable<string>,
  now: number = Date.now(),
): BookingSlotOption[] {
  const blocked = new Set(blockedDateKeys);
  const lastDayKey = toParisBookingDateKey(new Date(now + BOOKING_HORIZON_MS));
  const options = new Map<number, BookingSlotOption>();
  // Dès la veille : une plage de nuit (22:00–02:00) ouvre aussi le début de la journée.
  for (let dayKey = addBookingDays(toParisBookingDateKey(new Date(now)), -1); dayKey <= lastDayKey; dayKey = addBookingDays(dayKey, 1)) {
    const [year, month, day] = dayKey.split("-").map(Number);
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    for (const slot of slots) {
      if (slot.dayOfWeek !== dayOfWeek) continue;
      const slotStart = bookingTimeToMinutes(slot.startTime);
      const rawSlotEnd = bookingTimeToMinutes(slot.endTime);
      if (!Number.isFinite(slotStart) || !Number.isFinite(rawSlotEnd)) continue;
      const slotEnd = rawSlotEnd <= slotStart ? rawSlotEnd + 24 * 60 : rawSlotEnd;
      for (let minutes = slotStart; minutes + 30 <= slotEnd; minutes += 30) {
        const optionDayKey = minutes >= 24 * 60 ? addBookingDays(dayKey, 1) : dayKey;
        const time = minutesToBookingTime(minutes % (24 * 60));
        const start = parisBookingSlotStart(optionDayKey, time);
        if (!start || options.has(start.getTime()) || blocked.has(optionDayKey) || getBookingWindowIssue(start, now)) continue;
        // Même contrôle que le serveur (isBookableAppointmentTime) avant de proposer l’horaire.
        if (!isWithinBookingAvailability(start, slots, 30)) continue;
        options.set(start.getTime(), { start, dayKey: optionDayKey, time });
      }
    }
  }
  return Array.from(options.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Whether a consultation starting at `start` overlaps a held or confirmed appointment of the day (availability.getBookedSlots). */
export function overlapsBookedSlot(start: Date, booked: Array<Date | string>, durationMinutes = 30): boolean {
  const durationMs = durationMinutes * 60 * 1000;
  return booked.some(value => {
    const bookedStart = new Date(value).getTime();
    return start.getTime() < bookedStart + durationMs && bookedStart < start.getTime() + durationMs;
  });
}

/** The day's starts that are still free. */
export function removeBookedSlots(options: BookingSlotOption[], booked: Array<Date | string>): BookingSlotOption[] {
  return options.filter(({ start }) => !overlapsBookedSlot(start, booked));
}

/**
 * Starts of a sorted list still inside the booking window at `now`, as a
 * [first, end) range: the same slots as filtering each one with
 * getBookingWindowIssue (too soon at the front, too far at the back), but the
 * page clock only changes the range when a slot actually leaves the window.
 */
export function bookableSlotRange(options: BookingSlotOption[], now: number): [number, number] {
  let first = 0;
  while (first < options.length && getBookingWindowIssue(options[first].start, now)) first += 1;
  let end = options.length;
  while (end > first && getBookingWindowIssue(options[end - 1].start, now)) end -= 1;
  return [first, end];
}

/**
 * Opening hours shown as soon as the page opens (RES-02), Monday to Sunday,
 * in Paris time: [{ day: "lun.", ranges: ["09:00–12:00", "18:00–22:00"] }].
 */
export function summarizeBookingAvailability(slots: BookingAvailabilitySlot[], locale: string) {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return [1, 2, 3, 4, 5, 6, 0].flatMap(dayOfWeek => {
    const ranges = Array.from(new Set(slots
      .filter(slot => slot.dayOfWeek === dayOfWeek)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map(slot => `${slot.startTime}–${slot.endTime === "00:00" ? "24:00" : slot.endTime}`)));
    // Le 4 janvier 1970 est un dimanche.
    return ranges.length ? [{ day: weekday.format(new Date(Date.UTC(1970, 0, 4 + dayOfWeek))), ranges }] : [];
  });
}

/** "jeudi 29 octobre 2026" for a Paris day key, in the page language. */
export function formatBookingDay(dayKey: string, locale: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return getBookingDateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

const BOOKING_SLOT_LIST_REFRESH_MS = 30 * 60 * 1000;

/** Whole minutes left before the held slot is released (RES-04). */
export function getHoldRemainingMinutes(holdExpiresAt: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - now) / 60_000));
}

/**
 * What the page clock changes on screen at `time`: the half-hour of the 90-day
 * list, the slots still inside the booking window, the window issue of the
 * chosen slot and the minutes left to pay a held slot. A tick that changes none
 * of them does not render the page again (RES-02, RES-04).
 */
export function getBookingClockSignature(
  time: number,
  { openSlots, selectedDate, holdExpiresAt }: { openSlots: BookingSlotOption[]; selectedDate: Date | null; holdExpiresAt: string | null },
): string {
  const parts: Array<string | number | null> = [Math.floor(time / BOOKING_SLOT_LIST_REFRESH_MS), ...bookableSlotRange(openSlots, time), selectedDate ? getBookingWindowIssue(selectedDate, time) : null];
  if (holdExpiresAt) parts.push(getHoldRemainingMinutes(holdExpiresAt, time), new Date(holdExpiresAt).getTime() <= time ? "expired" : "held");
  return parts.join("|");
}

export function isWithinBookingAvailability(
  date: Date,
  slots: BookingAvailabilitySlot[],
  durationMinutes = 30
): boolean {
  if (slots.length === 0) return false;
  const parts = getParisBookingParts(date);
  const dayOfWeek = PARIS_BOOKING_DAY_INDEX[parts.weekday];
  const previousDayOfWeek = (dayOfWeek + 6) % 7;
  const candidateStart = parts.hour * 60 + parts.minute;

  return slots.some(slot => {
    const slotStart = bookingTimeToMinutes(slot.startTime);
    const rawSlotEnd = bookingTimeToMinutes(slot.endTime);
    if (!Number.isFinite(slotStart) || !Number.isFinite(rawSlotEnd)) return false;
    const crossesMidnight = rawSlotEnd <= slotStart;
    const slotEnd = crossesMidnight ? rawSlotEnd + 24 * 60 : rawSlotEnd;
    let normalizedCandidateStart = candidateStart;
    if (!crossesMidnight) {
      if (slot.dayOfWeek !== dayOfWeek) return false;
    } else if (slot.dayOfWeek === dayOfWeek && candidateStart >= slotStart) {
      normalizedCandidateStart = candidateStart;
    } else if (slot.dayOfWeek === previousDayOfWeek && candidateStart < rawSlotEnd) {
      normalizedCandidateStart = candidateStart + 24 * 60;
    } else {
      return false;
    }
    const offsetFromStart = normalizedCandidateStart - slotStart;
    return offsetFromStart >= 0 && normalizedCandidateStart + durationMinutes <= slotEnd && offsetFromStart % durationMinutes === 0;
  });
}

export type BookingAvailabilityState = "select" | "checking" | "unavailable" | "available";

export function getBookingAvailabilityState({
  selected,
  pending,
  blocked,
  booked,
}: {
  selected: boolean;
  pending: boolean;
  blocked: boolean;
  booked: boolean;
}): BookingAvailabilityState {
  if (!selected) return "select";
  if (pending) return "checking";
  if (blocked || booked) return "unavailable";
  return "available";
}

/** Input rejected by validation (BAD_REQUEST): a localized hint instead of the raw validation report. */
export function isBookingInputError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { data?: { code?: unknown } | null }).data?.code === "BAD_REQUEST";
}

/** Stable reason of a refused booking sent by the server (slot taken, too soon…), or null (EN-06). */
export function getBookingRefusalReason(error: unknown): BookingRefusalReason | null {
  if (!error || typeof error !== "object") return null;
  const reason = (error as { data?: { reason?: unknown } | null }).data?.reason;
  return isBookingRefusalReason(reason) ? reason : null;
}

/**
 * Alert of a refused booking, always in the page language (EN-06): the
 * translation of its stable reason, a hint for rejected input, otherwise the
 * generic message. The French text written by the server is never shown, nor
 * any technical detail.
 */
export function getBookingErrorMessage(
  error: unknown,
  copy: { refusals: Record<BookingRefusalReason, string>; invalidInput: string; bookingError: string },
): string {
  const refusal = getBookingRefusalReason(error);
  if (refusal) return copy.refusals[refusal];
  return isBookingInputError(error) ? copy.invalidInput : copy.bookingError;
}

export default function BookingPage() {
  const { language } = useLanguage();
  const [location, setLocation] = useLocation();
  const content = bookingContent[language as keyof typeof bookingContent] || bookingContent.en;
  const bookingFormCopy = getBookingFormCopy(language);
  const bookingRailCopy = {
    fr: { label: "Consultation", note: "Une consultation structurée, confidentielle et adaptée à votre demande." },
    en: { label: "Consultation", note: "A structured, confidential consultation tailored to your request." },
    de: { label: "Beratung", note: "Eine strukturierte, vertrauliche Beratung, die auf Ihre Anfrage zugeschnitten ist." },
    zh: { label: "咨询", note: "为您的需求量身定制的结构化、保密咨询。" },
  }[language] ?? { label: "Consultation", note: "A structured, confidential consultation tailored to your request." };
  const bookingBrandCopy = {
    fr: "Médecin anesthésiste-réanimateur · Conseil médical",
    en: "Anaesthesiologist & intensive care physician · Medical advisory",
    de: "Anästhesist und Intensivmediziner · Medizinische Beratung",
    zh: "麻醉与重症医学医师 · 医疗咨询",
  }[language] ?? "Medical advisory";

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    details: "",
  });

  // Jour choisi (clé de Paris « 2026-11-05 ») puis créneau choisi dans la grille.
  const [dayKey, setDayKey] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"success" | "canceled" | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  // Horloge de la page : délai de 2 h des créneaux proposés et temps restant du paiement en attente.
  const [now, setNow] = useState(() => Date.now());
  const clockSignatureRef = useRef<(time: number) => string>(() => "");
  const paymentSubmissionRef = useRef(false);
  const draftSlotRef = useRef<string | null>(null);
  // Grille des horaires : jour dont les réservations sont en cours de nouvel essai, et
  // jour dont la grille reçoit le focus quand ce nouvel essai se termine (RES-02).
  const slotsFieldsetRef = useRef<HTMLFieldSetElement>(null);
  const [slotsRetryDay, setSlotsRetryDay] = useState<string | null>(null);
  const slotsRetryFocusRef = useRef<string | null>(null);
  const locale = getBookingLocale(language);
  const parisDateTimeFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }), [locale]);
  const localizedDate = selectedDate ? `${parisDateTimeFormat.format(selectedDate)} (${content.form.parisTime})` : null;
  const selectedLocalTime = selectedDate ? formatVisitorTime(selectedDate, locale) : null;
  const pendingLocalTime = pendingBooking ? formatVisitorTime(new Date(pendingBooking.appointmentDate), locale) : null;

  useEffect(() => {
    // Tic sans effet à l’écran (voir getBookingClockSignature) : même état, pas de nouveau rendu.
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow((current) => (clockSignatureRef.current(time) === clockSignatureRef.current(current) ? current : time));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Handle Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const canceled = params.get("canceled");
    const tid = params.get("trackingId");

    if (success === "true") {
      setPaymentStatus("success");
      setTrackingId(tid);
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (canceled === "true") {
      setPaymentStatus("canceled");
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const dateKey = selectedDate ? toParisBookingDateKey(selectedDate) : dayKey;
  const blockedDates = trpc.availability.getBlockedDates.useQuery();
  const bookedSlots = trpc.availability.getBookedSlots.useQuery(
    { date: dateKey },
    { enabled: Boolean(dateKey) }
  );
  const availabilitySlots = trpc.availability.getSlots.useQuery();
  const calculatePrice = trpc.appointments.calculatePrice.useQuery(
    { appointmentDate: selectedDate?.toISOString() || "" },
    { enabled: !!selectedDate }
  );

  const isBlockedDate = Boolean(dateKey && blockedDates.data?.some((item) => item.date === dateKey));
  const isBookedSlot = Boolean(selectedDate && bookedSlots.data && overlapsBookedSlot(selectedDate, bookedSlots.data));
  const availabilityPending = blockedDates.isLoading || bookedSlots.isLoading || availabilitySlots.isLoading;
  const availabilityQueryError = blockedDates.isError || bookedSlots.isError || availabilitySlots.isError;
  const configuredSlots = availabilitySlots.data ?? [];
  const hasConfiguredSlots = configuredSlots.length > 0;
  const isOutsideConfiguredAvailability = Boolean(
    selectedDate && availabilitySlots.data && !isWithinBookingAvailability(selectedDate, configuredSlots, 30)
  );
  // Grille (RES-02) : jours ouverts des 90 prochains jours, moins les dates
  // bloquées et le délai de 2 h, puis horaires libres du jour choisi. La liste
  // (90 jours relus en heure de Paris) n’est recalculée que toutes les 30 min ;
  // le délai de 2 h, lui, suit l’horloge de la page, qui ne recopie la liste
  // (et ne recalcule la grille) que lorsqu’un horaire sort de la fenêtre.
  const slotListClock = Math.floor(now / BOOKING_SLOT_LIST_REFRESH_MS) * BOOKING_SLOT_LIST_REFRESH_MS;
  const openSlots = useMemo(
    () => listBookableSlots(availabilitySlots.data ?? [], (blockedDates.data ?? []).map((item) => item.date), slotListClock),
    [availabilitySlots.data, blockedDates.data, slotListClock]
  );
  const [firstBookableSlot, endBookableSlot] = bookableSlotRange(openSlots, now);
  const bookableSlots = useMemo(() => openSlots.slice(firstBookableSlot, endBookableSlot), [openSlots, firstBookableSlot, endBookableSlot]);
  const scheduleLoaded = Boolean(availabilitySlots.data && blockedDates.data);
  const nothingToBook = scheduleLoaded && bookableSlots.length === 0;
  const dayOptions = useMemo(
    () => Array.from(new Set([...bookableSlots.map((slot) => slot.dayKey), ...(dayKey ? [dayKey] : [])])).sort().map((key) => ({ key, label: formatBookingDay(key, locale) })),
    [bookableSlots, dayKey, locale]
  );
  // Horaires du jour choisi avant et après les réservations : une grille vide
  // ne dit « déjà réservés » que si ce sont bien les réservations qui l’ont vidée.
  const dayOpenSlots = useMemo(() => bookableSlots.filter((slot) => slot.dayKey === dayKey), [bookableSlots, dayKey]);
  const daySlots = useMemo(
    () => (bookedSlots.data ? removeBookedSlots(dayOpenSlots, bookedSlots.data) : []).map((option) => ({ ...option, localTime: formatVisitorTime(option.start, locale) })),
    [dayOpenSlots, bookedSlots.data, locale]
  );
  const openingHours = useMemo(() => summarizeBookingAvailability(availabilitySlots.data ?? [], locale), [availabilitySlots.data, locale]);
  // Délai minimal (2 h, passé compris) et horizon (90 jours) : mêmes règles que le serveur.
  const bookingWindowIssue = selectedDate ? getBookingWindowIssue(selectedDate, now) : null;
  // Tarif de l’horaire coché non calculé (souvent dans la même requête groupée que
  // l’agenda) : « Procéder au paiement » reste désactivé, et le statut le dit au lieu
  // de « Créneau disponible ». Le dernier résultat reçu pour cet horaire reste un échec
  // pendant un nouvel essai (« Réessayer », retour sur l’onglet), même quand React Query
  // efface l’erreur faute de tarif déjà reçu : l’alerte et son bouton restent en place,
  // et le statut dit « Vérification… » comme le bouton, jusqu’à la réponse.
  const priceLastFailed = Boolean(selectedDate) && calculatePrice.errorUpdatedAt > calculatePrice.dataUpdatedAt;
  const priceFailed = priceLastFailed && !calculatePrice.isFetching;
  const priceRetrying = priceLastFailed && calculatePrice.isFetching && !availabilityQueryError;
  const availabilityLabel = availabilityQueryError
    ? bookingFormCopy.availabilityError
    : availabilitySlots.data && !hasConfiguredSlots
    ? bookingFormCopy.noAvailability
    : nothingToBook && !selectedDate
    ? content.form.noBookableDay
    : !selectedDate
    ? bookingFormCopy.selectDate
    : bookingWindowIssue === "too_soon"
    ? content.form.tooSoon
    : bookingWindowIssue === "too_far"
    ? content.form.tooFar
    : availabilityPending || priceRetrying
      ? bookingFormCopy.checkingAvailability
      : isBlockedDate
      ? bookingFormCopy.blocked
      : isBookedSlot
        ? bookingFormCopy.alreadyBooked
        : !hasConfiguredSlots
          ? bookingFormCopy.noAvailability
          : isOutsideConfiguredAvailability
            ? bookingFormCopy.outsideSchedule
            : priceFailed
              ? content.form.priceError
              : bookingFormCopy.available;
  const availabilityState = getBookingAvailabilityState({
    // « Aucun créneau ouvert » et l’échec du chargement de l’agenda sont des
    // états indisponibles dès l’arrivée, sans attendre une sélection.
    selected: Boolean(selectedDate) || nothingToBook || availabilityQueryError,
    pending: (availabilityPending || priceRetrying) && !bookingWindowIssue,
    blocked: isBlockedDate || availabilityQueryError || isOutsideConfiguredAvailability || Boolean(bookingWindowIssue) || nothingToBook || priceFailed,
    booked: isBookedSlot,
  });
  const availabilityError = availabilityQueryError || priceLastFailed;

  const createAppointment = trpc.appointments.create.useMutation();
  const resumeCheckout = trpc.appointments.createCheckoutSession.useMutation();
  const cancelPendingBooking = trpc.appointments.cancelPending.useMutation();

  // Bouton « Réessayer » de la grille : relance chaque donnée d’agenda dont le chargement a échoué,
  // et le tarif de l’horaire coché s’il a échoué avec elles (même requête groupée) : sinon la
  // grille reviendrait avec « Procéder au paiement » toujours désactivé.
  // Pendant le nouvel essai, l’encadré d’erreur reste affiché et son bouton garde le focus
  // (aria-disabled, pas disabled) ; s’il réussit, le focus passe dans la grille qui le remplace
  // au lieu de retomber au début du document, sinon il reste sur le bouton.
  const slotsRetrying = Boolean(dateKey) && slotsRetryDay === dateKey;
  const retryAvailability = () => {
    if (slotsRetrying) return;
    const retriedDay = dateKey;
    setSlotsRetryDay(retriedDay);
    for (const query of [blockedDates, availabilitySlots, calculatePrice]) if (query.isError) void query.refetch();
    void bookedSlots.refetch().finally(() => {
      slotsRetryFocusRef.current = retriedDay;
      setSlotsRetryDay((current) => (current === retriedDay ? null : current));
    });
  };

  // Focus dans la grille : horaire coché, sinon premier horaire, sinon le message « aucun horaire ».
  const focusSlotGrid = () => {
    const grid = slotsFieldsetRef.current;
    const target = grid?.querySelector<HTMLElement>("input[name='booking-slot']:checked")
      ?? grid?.querySelector<HTMLElement>("input[name='booking-slot']")
      ?? grid?.querySelector<HTMLElement>("[data-slots-empty]");
    target?.focus();
  };

  // Tarif seul en échec (agenda chargé, grille affichée) : son propre « Réessayer ». Le bouton
  // disparaît avec l’alerte quand le tarif arrive : le focus passe alors dans la grille, sauf si
  // le visiteur est allé ailleurs pendant l’attente (jusqu’à plusieurs secondes avec les nouveaux essais).
  const priceRetryOnly = priceLastFailed && !availabilityQueryError;
  const retryPrice = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (calculatePrice.isFetching) return;
    const button = event.currentTarget;
    void calculatePrice.refetch().then(({ isError }) => {
      if (!isError && (document.activeElement === button || document.activeElement === document.body)) focusSlotGrid();
    });
  };

  useEffect(() => {
    if (slotsRetrying || !dateKey || slotsRetryFocusRef.current !== dateKey) return;
    slotsRetryFocusRef.current = null;
    if (bookedSlots.isError) return;
    focusSlotGrid();
  }, [slotsRetrying]);

  const chooseDay = (nextDayKey: string) => {
    // Choix du patient : il remplace le créneau du brouillon pas encore repris.
    draftSlotRef.current = null;
    setDayKey(nextDayKey);
    if (selectedDate && toParisBookingDateKey(selectedDate) !== nextDayKey) setSelectedDate(null);
  };

  // Retour depuis Stripe (bouton Précédent, rechargement, page restaurée du
  // cache) : saisie conservée et réservation en attente proposée à la reprise
  // ou à l’annulation, au lieu d’un créneau bloqué par son propre maintien.
  const restorePendingBooking = useCallback(() => {
    paymentSubmissionRef.current = false;
    setPendingBooking(loadPendingBooking());
  }, []);

  useEffect(() => {
    restorePendingBooking();
    const draft = loadBookingDraft();
    if (draft) {
      setFormData((current) => ({ ...current, name: draft.name, email: draft.email, phone: draft.phone, details: draft.details }));
      draftSlotRef.current = draft.appointmentDate || null;
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restorePendingBooking();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [restorePendingBooking]);

  // Créneau du brouillon : repris une fois l’agenda chargé, s’il est encore proposé.
  useEffect(() => {
    const draftSlot = draftSlotRef.current;
    if (!draftSlot || !scheduleLoaded) return;
    draftSlotRef.current = null;
    const option = bookableSlots.find((slot) => slot.start.toISOString() === draftSlot);
    if (option) {
      setDayKey(option.dayKey);
      setSelectedDate(option.start);
    }
  }, [scheduleLoaded, bookableSlots]);

  const appointmentDate = selectedDate?.toISOString() ?? "";
  useEffect(() => {
    const draft = { name: formData.name, email: formData.email, phone: formData.phone, appointmentDate, details: formData.details };
    if (!Object.values(draft).some(Boolean)) return;
    // Agenda pas encore chargé : le créneau du brouillon, en attente de reprise, est gardé.
    saveBookingDraft({ ...draft, appointmentDate: appointmentDate || draftSlotRef.current || "" });
  }, [formData.name, formData.email, formData.phone, formData.details, appointmentDate]);

  const forgetPendingBooking = (notice: string) => {
    clearPendingBooking();
    setPendingBooking(null);
    setPendingNotice(notice);
    // Jour affiché rechargé pour reproposer le créneau libéré ; sans jour choisi,
    // pas de requête (un jour vide est refusé par le serveur).
    if (dateKey) void bookedSlots.refetch();
  };

  useEffect(() => {
    clockSignatureRef.current = (time) => getBookingClockSignature(time, { openSlots, selectedDate, holdExpiresAt: pendingBooking?.holdExpiresAt ?? null });
  });

  // Maintien écoulé pendant que la page reste ouverte : le créneau est libéré côté serveur.
  const pendingHoldExpired = Boolean(pendingBooking && new Date(pendingBooking.holdExpiresAt).getTime() <= now);
  useEffect(() => {
    if (pendingHoldExpired) forgetPendingBooking(content.pending.closed);
  }, [pendingHoldExpired]);

  const handleResumePayment = async () => {
    if (!pendingBooking || paymentSubmissionRef.current) return;
    paymentSubmissionRef.current = true;
    try {
      const result = await resumeCheckout.mutateAsync({
        trackingId: pendingBooking.trackingId,
        finalPrice: pendingBooking.finalPrice,
        customerEmail: pendingBooking.customerEmail,
        customerName: pendingBooking.customerName,
      });
      if (!result.checkoutUrl) throw new Error("checkout_url_missing");
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      paymentSubmissionRef.current = false;
      // Stripe indisponible : le serveur garde le créneau, le paiement en attente
      // reste donc proposé à la reprise au lieu d’être oublié.
      if (getBookingRefusalReason(error) === "payment_unavailable") setPendingNotice(content.pending.resumeUnavailable);
      else forgetPendingBooking(content.pending.resumeError);
    }
  };

  const handleCancelPendingBooking = async () => {
    if (!pendingBooking) return;
    try {
      const result = await cancelPendingBooking.mutateAsync({ sessionId: pendingBooking.checkoutSessionId });
      forgetPendingBooking(result.cancelled ? content.pending.cancelled : content.pending.closed);
    } catch {
      setPendingNotice(content.pending.cancelError);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (paymentSubmissionRef.current || isLoading) return;

    if (!selectedDate) {
      alert(content.form.date);
      return;
    }

    if (getBookingWindowIssue(selectedDate) || isBlockedDate || isBookedSlot || isOutsideConfiguredAvailability || availabilityError) {
      alert(availabilityLabel);
      return;
    }

    if (!isPlausiblePhoneNumber(formData.phone)) {
      setPhoneError(content.form.invalidPhone);
      document.getElementById("booking-phone")?.focus();
      return;
    }

    if (!calculatePrice.data) {
      alert(content.error);
      return;
    }

    paymentSubmissionRef.current = true;
    try {
      const appointmentResult = await createAppointment.mutateAsync({
        customerName: formData.name,
        customerEmail: formData.email,
        customerPhone: formData.phone,
        appointmentDate: selectedDate.toISOString(),
        requestDetails: formData.details,
        language,
      });

      if (appointmentResult.success && appointmentResult.checkoutUrl) {
        savePendingBooking({
          trackingId: appointmentResult.trackingId,
          checkoutSessionId: appointmentResult.checkoutSessionId,
          customerName: formData.name,
          customerEmail: formData.email,
          finalPrice: appointmentResult.finalPrice,
          appointmentDate: selectedDate.toISOString(),
          holdExpiresAt: appointmentResult.holdExpiresAt,
        });
        window.location.assign(appointmentResult.checkoutUrl);
      } else {
        paymentSubmissionRef.current = false;
        alert(content.paymentError);
      }
    } catch (error) {
      paymentSubmissionRef.current = false;
      console.error("Booking error:", error);
      // Message dans la langue de la page (EN-06), jamais le texte français du serveur.
      alert(getBookingErrorMessage(error, content));
      // Créneau pris entre-temps, date fermée… : agenda rechargé pour que la grille ne le propose plus.
      if (getBookingRefusalReason(error)) void Promise.all([bookedSlots.refetch(), blockedDates.refetch(), availabilitySlots.refetch()]);
    }
  };

  const handleReset = () => {
    paymentSubmissionRef.current = false;
    clearBookingDraft();
    draftSlotRef.current = null;
    setFormData({ name: "", email: "", phone: "", details: "" });
    setDayKey("");
    setSelectedDate(null);
    setPhoneError(null);
    setPaymentStatus(null);
    setTrackingId(null);
  };

  const isLoading = createAppointment.isPending;

  // Progress steps
  const steps = [
    { label: language === "fr" ? "Informations" : language === "de" ? "Informationen" : language === "zh" ? "信息" : "Information", icon: User },
    { label: language === "fr" ? "Date & Heure" : language === "de" ? "Datum & Uhrzeit" : language === "zh" ? "日期和时间" : "Date & Time", icon: Calendar },
    { label: language === "fr" ? "Paiement" : language === "de" ? "Zahlung" : language === "zh" ? "支付" : "Payment", icon: Clock },
  ];

  const currentStep = paymentStatus === "success" ? 3 : (isLoading || (selectedDate && formData.details)) ? 2 : (formData.name && formData.email && formData.phone) ? 1 : 0;

  const seoDescription = {
    fr: "Réservez une consultation de conseil en santé de 30 minutes avec le Dr. Ahmed Ben Lallahom, avec paiement Stripe sécurisé.",
    en: "Book a 30-minute health consultation with Dr. Ahmed Ben Lallahom using secure Stripe payment.",
    de: "Buchen Sie eine 30-minütige Gesundheitsberatung bei Dr. Ahmed Ben Lallahom mit sicherer Stripe-Zahlung.",
    zh: "预约 Ahmed Ben Lallahom 医生的 30 分钟健康咨询，并使用 Stripe 安全付款。",
  }[language];

  return (
    <>
    <div className="min-h-screen bg-background py-8 sm:py-12 px-4">
      <SEOHead
        title={`${content.title} | Dr. Ahmed Ben Lallahom`}
        description={seoDescription}
        ogUrl="https://drahmedbenlallahom.com/booking"
      />
      <div id="main-content" role="main" tabIndex={-1} className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: content.title }]} />

        <div className="mb-6 flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-4 py-3 shadow-sm shadow-black/10">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 font-display text-sm font-bold tracking-tight text-primary" aria-hidden="true">
            ABL
          </span>
          <div className="min-w-0">
            <p className="font-display text-base font-semibold tracking-tight text-foreground">Dr. Ahmed Ben Lallahom</p>
            <p className="text-xs leading-5 text-muted-foreground">{bookingBrandCopy}</p>
          </div>
          <span className="ml-auto hidden h-2 w-2 shrink-0 rounded-full bg-[#c9a96e] sm:block" aria-hidden="true" />
          <LanguageMenu className="ml-auto shrink-0 sm:ml-0" />
        </div>

        {/* Progress Indicator */}
        {!paymentStatus && (
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => {
                const StepIcon = step.icon;
                const isCompleted = index < currentStep;
                const isCurrent = index === currentStep;
                const isActive = isCompleted || isCurrent;
                return (
                  <div key={index} className="flex items-center flex-1">
                    <div className={`flex items-center gap-2 ${isCompleted ? 'text-primary' : isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${isCompleted ? 'bg-primary text-primary-foreground' : isCurrent ? 'bg-primary/20 text-primary border-2 border-primary' : 'bg-muted text-muted-foreground'}`}>
                        <StepIcon size={14} />
                      </div>
                      <span className="text-xs font-medium hidden sm:inline">{step.label}</span>
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 transition-all duration-300 ${index < currentStep ? 'bg-primary' : 'bg-muted'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pending payment after a return from Stripe */}
        {!paymentStatus && pendingBooking && (
          <Card className="payment-state payment-state-canceled mb-6 p-5 sm:p-6" role="region" aria-labelledby="pending-booking-title">
            <div className="flex items-start gap-4">
              <span className="payment-state-icon" aria-hidden="true">
                <Clock className="w-6 h-6" />
              </span>
              <div className="min-w-0">
                <h2 id="pending-booking-title" className="font-display text-xl font-bold mb-2">{content.pending.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{content.pending.description}</p>
                <dl className="mt-3 grid gap-1 text-sm">
                  <div><dt className="inline font-medium">{content.pending.slot}{content.pending.labelSeparator}</dt><dd className="inline">{parisDateTimeFormat.format(new Date(pendingBooking.appointmentDate))} ({content.form.parisTime}){pendingLocalTime && `, ${content.form.localTime(pendingLocalTime)}`}</dd></div>
                  {/* Temps restant plutôt qu’une heure de Paris qui semble déjà passée à l’étranger (RES-04). */}
                  <div><dt className="inline font-medium">{content.pending.remaining}{content.pending.labelSeparator}</dt><dd className="inline">{content.pending.remainingValue(getHoldRemainingMinutes(pendingBooking.holdExpiresAt, now))}</dd></div>
                  <div><dt className="inline font-medium">{content.pending.reference}{content.pending.labelSeparator}</dt><dd className="inline font-mono text-primary">{pendingBooking.trackingId}</dd></div>
                </dl>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button type="button" onClick={handleResumePayment} disabled={resumeCheckout.isPending || cancelPendingBooking.isPending} className="cta-primary">
                    {content.pending.resume}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCancelPendingBooking} disabled={resumeCheckout.isPending || cancelPendingBooking.isPending} className="cta-secondary">
                    {content.pending.cancel}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}
        {!paymentStatus && pendingNotice && (
          <p className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground" role="status" aria-live="polite">{pendingNotice}</p>
        )}

        {/* Payment Success Message */}
        {paymentStatus === "success" && (
          <Card className="payment-state payment-state-success mb-6 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="payment-state-icon" aria-hidden="true">
                <CheckCircle className="w-6 h-6" />
              </span>
              <div className="min-w-0">
                <span className="eyebrow-label mb-3">{content.pricing.total}</span>
                <h3 className="font-display text-2xl font-bold mb-3">{content.paymentSuccess}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{content.confirmationNextSteps}</p>
                {trackingId && (
                  <p className="mt-4 text-sm text-foreground">
                    {content.trackingId} <span className="font-mono text-primary">{trackingId}</span>
                  </p>
                )}
                <Button type="button" onClick={handleReset} className="cta-secondary mt-6">
                  {content.restartBooking}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Payment Canceled Message */}
        {paymentStatus === "canceled" && (
          <Card className="payment-state payment-state-canceled mb-6 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="payment-state-icon" aria-hidden="true">
                <AlertCircle className="w-6 h-6" />
              </span>
              <div className="min-w-0">
                <span className="eyebrow-label mb-3">{content.pricing.title}</span>
                <h3 className="font-display text-2xl font-bold mb-3">{content.paymentCanceled}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{content.canceledNextSteps}</p>
                <Button type="button" onClick={handleReset} className="cta-secondary mt-6">
                  {content.restartBooking}
                </Button>
              </div>
            </div>
          </Card>
        )}

        <div className="grid lg:grid-cols-[0.72fr_1.28fr] gap-6 items-start">
          <aside className="booking-rail rounded-2xl border border-border/60 bg-card/60 p-5 sm:p-6" aria-label={bookingRailCopy.label}>
            <span className="eyebrow-label mb-5">{bookingRailCopy.label}</span>
            <h2 className="font-display text-2xl font-bold tracking-tight mb-3">{content.subtitle}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              {bookingRailCopy.note}
            </p>
            <img
              src="/assets/booking-care.svg"
              sizes="(min-width: 1024px) 30vw, 100vw"
              loading="lazy"
              decoding="async"
              alt=""
              aria-hidden="true"
              className="mb-6 h-32 w-full rounded-xl border border-border/40 object-cover opacity-70 saturate-75"
            />
            <div className="booking-rail-list">
              {steps.map((step, index) => {
                const StepIcon = step.icon;
                const active = index <= currentStep;
                return (
                  <div key={step.label} className={`booking-rail-item ${active ? "is-active" : ""}`}>
                    <span className="booking-rail-marker"><StepIcon aria-hidden="true" className="h-3.5 w-3.5" /></span>
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 pt-5 border-t border-border/50 text-sm text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>{content.pricing.dayRate}</span>
                <strong className="text-foreground">100 {content.pricing.eur}</strong>
              </div>
              <div className="flex items-center justify-between gap-3 mt-2">
                <span>{content.pricing.nightRate}</span>
                <strong className="text-foreground">150 {content.pricing.eur}</strong>
              </div>
            </div>
          </aside>

        <Card className="p-5 sm:p-8 border-border/60 bg-card/90 shadow-xl shadow-black/5">
          <div className="section-heading mb-8">
            <span className="eyebrow-label mb-4">Hippocampus Consulting</span>
            <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-3">{content.title}</h1>
            <p className="text-muted-foreground leading-relaxed">{content.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label htmlFor="booking-name" className="block text-sm font-medium mb-2 flex items-center gap-2">
                <User className="w-4 h-4" aria-hidden="true" />
                {content.form.name}
              </label>
              <input
                id="booking-name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                autoComplete="name"
                enterKeyHint="next"
                className="form-field-premium w-full px-4 py-2 border"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="booking-email" className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4" aria-hidden="true" />
                {content.form.email}
              </label>
              <input
                id="booking-email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                autoComplete="email"
                inputMode="email"
                enterKeyHint="next"
                className="form-field-premium w-full px-4 py-2 border"
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="booking-phone" className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Phone className="w-4 h-4" aria-hidden="true" />
                {content.form.phone}
              </label>
              <input
                id="booking-phone"
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value });
                  if (phoneError && isPlausiblePhoneNumber(e.target.value)) setPhoneError(null);
                }}
                onBlur={() => setPhoneError(formData.phone.trim() && !isPlausiblePhoneNumber(formData.phone) ? content.form.invalidPhone : null)}
                autoComplete="tel"
                inputMode="tel"
                enterKeyHint="next"
                maxLength={50}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? "booking-phone-error" : undefined}
                className="form-field-premium w-full px-4 py-2 border"
              />
              {phoneError && <p id="booking-phone-error" className="mt-2 text-sm text-destructive" role="alert">{phoneError}</p>}
            </div>

            {/* Date : jour puis horaire libre, choisis dans l’agenda (RES-02) */}
            <fieldset>
              <legend className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" aria-hidden="true" />
                {content.form.date}
              </legend>
              <div id="booking-opening-hours" className="mb-4 rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
                <p className="font-semibold text-foreground">{content.form.openingHours}</p>
                {availabilitySlots.isLoading ? (
                  <p>{bookingFormCopy.checkingAvailability}</p>
                ) : openingHours.length > 0 ? (
                  <ul className="mt-1 grid gap-0.5">
                    {openingHours.map(({ day, ranges }) => (
                      <li key={day}><span className="font-medium text-foreground">{day}</span> {ranges.join(", ")}</li>
                    ))}
                  </ul>
                ) : availabilitySlots.data ? (
                  <p>{bookingFormCopy.noAvailability}</p>
                ) : null}
              </div>
              <label htmlFor="booking-day" className="block text-xs font-medium mb-2">{content.form.day}</label>
              <select
                id="booking-day"
                required
                value={dayKey}
                onChange={(e) => chooseDay(e.target.value)}
                disabled={dayOptions.length === 0}
                aria-describedby="booking-opening-hours availability-status"
                className="form-field-premium h-11 w-full border px-4 py-2"
              >
                <option value="">{content.form.dayPlaceholder}</option>
                {dayOptions.map(({ key, label }) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              {dayKey && (
                // Boutons radio natifs : Tab entre dans la grille, les flèches changent d’horaire.
                <fieldset ref={slotsFieldsetRef} className="mt-4" aria-describedby="availability-status">
                  <legend className="block text-xs font-medium mb-2">{content.form.slotsLegend}</legend>
                  {bookedSlots.isLoading && !slotsRetrying ? (
                    <p className="text-sm text-muted-foreground">{bookingFormCopy.checkingAvailability}</p>
                  ) : bookedSlots.isError || slotsRetrying ? (
                    // Réservations du jour non chargées : erreur explicite et nouvel essai, au lieu d’une grille vide.
                    <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
                      <p>{content.form.slotsError}</p>
                      <Button type="button" variant="outline" onClick={retryAvailability} aria-disabled={slotsRetrying || undefined} className="min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
                        {slotsRetrying ? bookingFormCopy.checkingAvailability : content.form.retry}
                      </Button>
                    </div>
                  ) : daySlots.length === 0 ? (
                    <p data-slots-empty tabIndex={-1} className="text-sm text-muted-foreground focus:outline-none">{dayOpenSlots.length > 0 ? content.form.noSlotsThisDay : content.form.noSlotsLeftThisDay}</p>
                  ) : (
                    <div id="booking-slots" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {daySlots.map((option) => (
                        <label key={option.start.toISOString()} className="block cursor-pointer">
                          <input
                            type="radio"
                            name="booking-slot"
                            value={option.start.toISOString()}
                            checked={selectedDate?.getTime() === option.start.getTime()}
                            onChange={() => setSelectedDate(option.start)}
                            className="peer sr-only"
                          />
                          <span className="flex min-h-11 flex-col items-center justify-center rounded-xl border border-border/70 bg-background/40 px-2 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/60 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
                            <span>{option.time}</span>
                            {option.localTime && <span className="text-[11px] font-normal leading-4 opacity-80">{content.form.localTimeShort(option.localTime)}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{content.form.dateHint} {content.form.windowHint}</p>
              {localizedDate && (
                <p className="mt-2 text-sm font-medium text-primary" aria-live="polite">
                  {localizedDate}
                  {selectedLocalTime && <span className="block text-xs font-normal text-muted-foreground">{content.form.localTime(selectedLocalTime)}</span>}
                </p>
              )}
              <div id="availability-status" className={`availability-status availability-${availabilityState} mt-3 flex items-center gap-2`} role="status" aria-live="polite" data-state={availabilityState}>
                {availabilityState === "select" && <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary" aria-hidden="true"><Calendar className="h-4 w-4" /></span>}
                <span className="availability-dot" aria-hidden="true" />
                <span>{availabilityLabel}</span>
              </div>
            </fieldset>

            {/* Price Display */}
            {selectedDate && calculatePrice.isLoading && !priceLastFailed && <PublicContentSkeleton cards={1} label={bookingFormCopy.checkingAvailability} />}
            {selectedDate && availabilityError && (priceRetryOnly ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
                <p>{content.form.priceError}</p>
                <Button type="button" variant="outline" onClick={retryPrice} aria-disabled={calculatePrice.isFetching || undefined} className="min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
                  {calculatePrice.isFetching ? bookingFormCopy.checkingAvailability : content.form.retry}
                </Button>
              </div>
            ) : (
              <p className="rounded-xl border border-destructive/35 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{bookingFormCopy.availabilityError}</p>
            ))}
            {calculatePrice.data && (
              <Card className="summary-card-premium p-4 sm:p-5">
                <h3 className="font-semibold mb-3">{content.pricing.title}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{content.pricing.dayRate}:</span>
                    <span>100 {content.pricing.eur}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{content.pricing.nightRate}:</span>
                    <span>150 {content.pricing.eur}</span>
                  </div>
                  <div className="border-t border-border pt-2 mt-2 flex justify-between font-bold">
                    <span>{content.pricing.total}:</span>
                    <span>{calculatePrice.data.finalPrice} {content.pricing.eur}</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Details */}
            <div>
              <label htmlFor="booking-details" className="block text-sm font-medium mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" aria-hidden="true" />
                {content.form.details}
              </label>
              <p id="booking-details-warning" className="mb-2 flex gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                <span>{content.form.detailsWarning}</span>
              </p>
              <textarea
                id="booking-details"
                required
                maxLength={BOOKING_REQUEST_SUBJECT_MAX_LENGTH}
                value={formData.details}
                onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                placeholder={content.form.detailsPlaceholder}
                aria-describedby="booking-details-warning"
                rows={3}
                enterKeyHint="done"
                className="form-field-premium w-full px-4 py-2 border"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading || availabilityPending || availabilityError || isBlockedDate || isBookedSlot || isOutsideConfiguredAvailability || Boolean(bookingWindowIssue) || !selectedDate || !calculatePrice.data}
              className="cta-primary w-full"
              size="lg"
            >
              {isLoading ? bookingFormCopy.loading : bookingFormCopy.submit}
            </Button>
            <BookingLegalNotice className="-mt-2" />
            <div className="booking-notes grid gap-3 sm:grid-cols-2 mt-2" aria-label={content.pricing.title}>
              <div className="booking-note">
                <span className="text-xs uppercase tracking-[0.14em] text-primary font-bold">{content.availabilityLabel}</span>
                <p>{content.paymentTrust}</p>
              </div>
              <div className="booking-note">
                <span className="text-xs uppercase tracking-[0.14em] text-primary font-bold">{language === "fr" ? "Annulation" : language === "de" ? "Stornierung" : language === "zh" ? "取消政策" : "Cancellation"}</span>
                <p>{content.cancellation}</p>
              </div>
            </div>
            <aside role="note" aria-label={content.emergencyTitle} className="mt-4 flex gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-foreground">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
              <div><p className="font-semibold">{content.emergencyTitle}</p><p className="mt-1 leading-6 text-muted-foreground">{content.emergencyNote}</p></div>
            </aside>
          </form>

          {paymentStatus && (
            <Button
              onClick={handleReset}
              variant="outline"
              className="w-full mt-4"
            >
              {language === "fr" ? "Nouvelle réservation" : language === "de" ? "Neue Buchung" : language === "zh" ? "新预约" : "New Booking"}
            </Button>
          )}
        </Card>
        </div>
      </div>
    </div>
    <Footer />
    </>
  );
}
