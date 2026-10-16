import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { Calendar, Clock, User, Mail, Phone, FileText, CheckCircle, AlertCircle } from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { SEOHead } from "@/components/SEOHead";
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
  getBookingWindowIssue,
  isPlausiblePhoneNumber,
} from "@shared/bookingPolicy";

export const bookingContent = {
  fr: {
    title: "Réserver une Consultation",
    subtitle: "Conseil en santé - 30 minutes",
    form: {
      name: "Nom complet",
      email: "Email",
      phone: "Numéro de téléphone",
      date: "Date et heure",
      datePlaceholder: "JJ/MM/AAAA · HH:MM",
      dateOnlyPlaceholder: "JJ/MM/AAAA",
      timePlaceholder: "HH:MM",
      timeLabel: "Heure",
      invalidDate: "Saisissez une date valide au format JJ/MM/AAAA et une heure au format HH:MM.",
      dateHint: "Choisissez la date et l’heure de votre consultation. Le créneau est affiché en heure de Paris.",
      windowHint: `Réservation au moins ${BOOKING_MIN_LEAD_TIME_HOURS} h à l’avance et jusqu’à ${BOOKING_HORIZON_DAYS} jours.`,
      tooSoon: `Ce créneau n’est plus réservable : réservez au moins ${BOOKING_MIN_LEAD_TIME_HOURS} h à l’avance.`,
      tooFar: `Les réservations sont ouvertes jusqu’à ${BOOKING_HORIZON_DAYS} jours à l’avance.`,
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
        heldUntil: "Réservé jusqu’à",
        reference: "Référence",
        resume: "Reprendre le paiement",
        cancel: "Annuler et choisir un autre créneau",
        cancelled: "Le créneau a été libéré. Vos informations sont conservées : choisissez une nouvelle date ou heure.",
        closed: "Cette réservation n’est plus en attente. Si vous avez finalisé le paiement, vous recevrez une confirmation par email ; sinon, choisissez à nouveau votre créneau.",
        resumeError: "Le paiement ne peut plus être repris (session expirée). Choisissez à nouveau votre créneau.",
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
      datePlaceholder: "DD/MM/YYYY · HH:MM",
      dateOnlyPlaceholder: "DD/MM/YYYY",
      timePlaceholder: "HH:MM",
      timeLabel: "Time",
      invalidDate: "Enter a valid date in DD/MM/YYYY format and a time in HH:MM format.",
      dateHint: "Choose your consultation date and time. The slot is displayed in Paris time.",
      windowHint: `Book at least ${BOOKING_MIN_LEAD_TIME_HOURS} hours ahead and up to ${BOOKING_HORIZON_DAYS} days ahead.`,
      tooSoon: `This time slot can no longer be booked: please book at least ${BOOKING_MIN_LEAD_TIME_HOURS} hours ahead.`,
      tooFar: `Bookings are open up to ${BOOKING_HORIZON_DAYS} days ahead.`,
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
        heldUntil: "Held until",
        reference: "Reference",
        resume: "Resume payment",
        cancel: "Cancel and choose another time slot",
        cancelled: "The time slot has been released. Your details are kept: choose a new date or time.",
        closed: "This booking is no longer pending. If you completed the payment, you will receive a confirmation email; otherwise, choose your time slot again.",
        resumeError: "The payment can no longer be resumed (session expired). Please choose your time slot again.",
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
      datePlaceholder: "TT.MM.JJJJ · HH:MM",
      dateOnlyPlaceholder: "TT.MM.JJJJ",
      timePlaceholder: "HH:MM",
      timeLabel: "Uhrzeit",
      invalidDate: "Geben Sie ein gültiges Datum im Format TT.MM.JJJJ und eine Uhrzeit im Format HH:MM ein.",
      dateHint: "Wählen Sie Datum und Uhrzeit Ihrer Beratung. Der Termin wird in Pariser Zeit angezeigt.",
      windowHint: `Buchung mindestens ${BOOKING_MIN_LEAD_TIME_HOURS} Stunden im Voraus und bis zu ${BOOKING_HORIZON_DAYS} Tage im Voraus.`,
      tooSoon: `Dieser Termin kann nicht mehr gebucht werden: Bitte buchen Sie mindestens ${BOOKING_MIN_LEAD_TIME_HOURS} Stunden im Voraus.`,
      tooFar: `Buchungen sind bis zu ${BOOKING_HORIZON_DAYS} Tage im Voraus möglich.`,
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
        heldUntil: "Reserviert bis",
        reference: "Referenz",
        resume: "Zahlung fortsetzen",
        cancel: "Stornieren und anderen Termin wählen",
        cancelled: "Der Termin wurde freigegeben. Ihre Angaben bleiben erhalten: Wählen Sie ein neues Datum oder eine neue Uhrzeit.",
        closed: "Diese Buchung ist nicht mehr ausstehend. Wenn Sie die Zahlung abgeschlossen haben, erhalten Sie eine Bestätigung per E-Mail; andernfalls wählen Sie Ihren Termin erneut.",
        resumeError: "Die Zahlung kann nicht mehr fortgesetzt werden (Sitzung abgelaufen). Bitte wählen Sie Ihren Termin erneut.",
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
      datePlaceholder: "年/月/日 · 时:分",
      dateOnlyPlaceholder: "日/月/年",
      timePlaceholder: "时:分",
      timeLabel: "时间",
      invalidDate: "请输入有效日期（日/月/年）和时间（时:分）。",
      dateHint: "请选择咨询日期和时间。时段以巴黎时间显示。",
      windowHint: `请至少提前 ${BOOKING_MIN_LEAD_TIME_HOURS} 小时预约，最多可提前 ${BOOKING_HORIZON_DAYS} 天。`,
      tooSoon: `该时段已无法预约：请至少提前 ${BOOKING_MIN_LEAD_TIME_HOURS} 小时预约。`,
      tooFar: `最多可提前 ${BOOKING_HORIZON_DAYS} 天预约。`,
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
        heldUntil: "保留至",
        reference: "编号",
        resume: "继续付款",
        cancel: "取消并选择其他时段",
        cancelled: "该时段已释放。您的信息已保留：请选择新的日期或时间。",
        closed: "此预约已不再处于待付款状态。如果您已完成付款，将收到确认邮件；否则请重新选择时段。",
        resumeError: "无法继续付款（会话已过期）。请重新选择时段。",
        cancelError: "无法确认取消。请稍后重试。",
      },

  },
};

export function parseBookingDateTime(dateValue: string, timeValue: string): Date | null {
  const normalizedDate = dateValue.trim().replace(/[.\-]/g, "/");
  const dateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalizedDate);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeValue.trim());

  if (!dateMatch || !timeMatch) return null;

  const [, dayText, monthText, yearText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
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

const PARIS_BOOKING_DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getParisBookingParts(date: Date) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), weekday: String(values.weekday),
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

export function isWithinBookingAvailability(
  date: Date,
  slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
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

// Refus métier attendus (créneau déjà pris, trop de tentatives, réservations
// en attente) : le serveur renvoie un message français destiné au patient.
// Toute autre erreur garde le message générique pour ne rien exposer de technique.
const BOOKING_USER_FACING_ERROR_CODES = new Set(["CONFLICT", "TOO_MANY_REQUESTS", "UNPROCESSABLE_CONTENT"]);

export function getBookingServerErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { data, message } = error as { data?: { code?: unknown } | null; message?: unknown };
  if (typeof data?.code !== "string" || !BOOKING_USER_FACING_ERROR_CODES.has(data.code)) return null;
  return typeof message === "string" && message.trim() ? message.trim() : null;
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
    date: "",
    details: "",
  });

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dateText, setDateText] = useState("");
  const [timeText, setTimeText] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"success" | "canceled" | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const paymentSubmissionRef = useRef(false);
  const localizedDate = selectedDate
    ? new Intl.DateTimeFormat(
        language === "fr" ? "fr-FR" : language === "de" ? "de-DE" : language === "zh" ? "zh-CN" : "en-GB",
        { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }
      ).format(selectedDate)
    : null;

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

  const dateKey = selectedDate ? toParisBookingDateKey(selectedDate) : "";
  const blockedDates = trpc.availability.getBlockedDates.useQuery();
  const bookedSlots = trpc.availability.getBookedSlots.useQuery(
    { date: dateKey },
    { enabled: Boolean(dateKey) }
  );
  const availabilitySlots = trpc.availability.getSlots.useQuery();

  const isBlockedDate = Boolean(dateKey && blockedDates.data?.some((item) => item.date === dateKey));
  const isBookedSlot = Boolean(
    selectedDate &&
      bookedSlots.data?.some((slot) => new Date(slot).toISOString().slice(0, 16) === selectedDate.toISOString().slice(0, 16))
  );
  const availabilityPending = blockedDates.isLoading || bookedSlots.isLoading || availabilitySlots.isLoading;
  const availabilityQueryError = blockedDates.isError || bookedSlots.isError || availabilitySlots.isError;
  const configuredSlots = availabilitySlots.data ?? [];
  const hasConfiguredSlots = configuredSlots.length > 0;
  const isOutsideConfiguredAvailability = Boolean(
    selectedDate && availabilitySlots.data && !isWithinBookingAvailability(selectedDate, configuredSlots, 30)
  );
  // Délai minimal (2 h, passé compris) et horizon (90 jours) : mêmes règles que le serveur.
  const bookingWindowIssue = selectedDate ? getBookingWindowIssue(selectedDate) : null;
  const availabilityLabel = availabilityQueryError
    ? bookingFormCopy.availabilityError
    : !selectedDate
    ? bookingFormCopy.selectDate
    : bookingWindowIssue === "too_soon"
    ? content.form.tooSoon
    : bookingWindowIssue === "too_far"
    ? content.form.tooFar
    : availabilityPending
      ? bookingFormCopy.checkingAvailability
      : isBlockedDate
      ? bookingFormCopy.blocked
      : isBookedSlot
        ? bookingFormCopy.alreadyBooked
        : !hasConfiguredSlots
          ? bookingFormCopy.noAvailability
          : isOutsideConfiguredAvailability
            ? bookingFormCopy.outsideSchedule
            : bookingFormCopy.available;
  const availabilityState = getBookingAvailabilityState({
    selected: Boolean(selectedDate),
    pending: availabilityPending && !bookingWindowIssue,
    blocked: isBlockedDate || availabilityQueryError || isOutsideConfiguredAvailability || Boolean(bookingWindowIssue),
    booked: isBookedSlot,
  });

  const calculatePrice = trpc.appointments.calculatePrice.useQuery(
    { appointmentDate: selectedDate?.toISOString() || "" },
    { enabled: !!selectedDate }
  );
  const availabilityError = availabilityQueryError || calculatePrice.isError;

  const createAppointment = trpc.appointments.create.useMutation();
  const resumeCheckout = trpc.appointments.createCheckoutSession.useMutation();
  const cancelPendingBooking = trpc.appointments.cancelPending.useMutation();

  const synchronizeDateTime = (nextDateText: string, nextTimeText: string) => {
    setDateText(nextDateText);
    setTimeText(nextTimeText);

    if (!nextDateText.trim() || !nextTimeText.trim()) {
      setSelectedDate(null);
      setDateError(null);
      setFormData((current) => ({ ...current, date: "" }));
      return;
    }

    const parsed = parseBookingDateTime(nextDateText, nextTimeText);
    if (!parsed) {
      setSelectedDate(null);
      setDateError(bookingFormCopy.invalidDate);
      setFormData((current) => ({ ...current, date: "" }));
      return;
    }

    setDateError(null);
    setSelectedDate(parsed);
    setFormData((current) => ({ ...current, date: parsed.toISOString() }));
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
      if (draft.dateText || draft.timeText) synchronizeDateTime(draft.dateText, draft.timeText);
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restorePendingBooking();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [restorePendingBooking]);

  useEffect(() => {
    const draft = { name: formData.name, email: formData.email, phone: formData.phone, dateText, timeText, details: formData.details };
    if (Object.values(draft).some(Boolean)) saveBookingDraft(draft);
  }, [formData.name, formData.email, formData.phone, formData.details, dateText, timeText]);

  const forgetPendingBooking = (notice: string) => {
    clearPendingBooking();
    setPendingBooking(null);
    setPendingNotice(notice);
    void bookedSlots.refetch();
  };

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
    } catch {
      paymentSubmissionRef.current = false;
      forgetPendingBooking(content.pending.resumeError);
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
      const serverMessage = getBookingServerErrorMessage(error);
      if (serverMessage) {
        // Le message serveur est rédigé en français : on le précède du libellé
        // localisé pour les autres langues de l’interface.
        alert(language === "fr" ? serverMessage : `${content.bookingError}\n\n${serverMessage}`);
      } else {
        alert(content.bookingError);
      }
    }
  };

  const handleReset = () => {
    paymentSubmissionRef.current = false;
    clearBookingDraft();
    setFormData({ name: "", email: "", phone: "", date: "", details: "" });
    setSelectedDate(null);
    setDateText("");
    setTimeText("");
    setDateError(null);
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
    <div className="min-h-screen bg-background py-8 sm:py-12 px-4">
      <SEOHead
        title={`${content.title} | Dr. Ahmed Ben Lallahom`}
        description={seoDescription}
        ogUrl="https://drahmedbenlallahom.com/booking"
      />
      <div className="max-w-3xl mx-auto">
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
          <span className="ml-auto hidden h-2 w-2 shrink-0 rounded-full bg-[#c9a96e] sm:block" aria-label="Signature médicale" />
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
                  <div><dt className="inline font-medium">{content.pending.slot} : </dt><dd className="inline">{new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : language === "de" ? "de-DE" : language === "zh" ? "zh-CN" : "en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(pendingBooking.appointmentDate))}</dd></div>
                  <div><dt className="inline font-medium">{content.pending.heldUntil} : </dt><dd className="inline">{new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : language === "de" ? "de-DE" : language === "zh" ? "zh-CN" : "en-GB", { timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(pendingBooking.holdExpiresAt))}</dd></div>
                  <div><dt className="inline font-medium">{content.pending.reference} : </dt><dd className="inline font-mono text-primary">{pendingBooking.trackingId}</dd></div>
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

            {/* Date */}
            <div>
              <label htmlFor="booking-date" className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" aria-hidden="true" />
                {content.form.date}
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  id="booking-date"
                  type="text"
                  required
                  value={dateText}
                  onChange={(e) => synchronizeDateTime(e.target.value, timeText)}
                  inputMode="numeric"
                  autoComplete="off"
                  enterKeyHint="next"
                  placeholder={content.form.dateOnlyPlaceholder}
                  className="form-field-premium h-11 w-full border px-4 py-2"
                  aria-describedby="availability-status booking-date-error"
                  aria-label={content.form.date}
                />
                <input
                  id="booking-time"
                  type="text"
                  required
                  value={timeText}
                  onChange={(e) => synchronizeDateTime(dateText, e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  enterKeyHint="next"
                  placeholder={content.form.timePlaceholder}
                  className="form-field-premium h-11 w-full border px-4 py-2"
                  aria-describedby="availability-status booking-date-error"
                  aria-label={content.form.timeLabel}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{content.form.dateHint} {content.form.windowHint}</p>
              {dateError && <p id="booking-date-error" className="mt-2 text-sm text-destructive" role="alert">{dateError}</p>}
              {localizedDate && <p className="mt-2 text-sm font-medium text-primary" aria-live="polite">{localizedDate}</p>}
              <div id="availability-status" className={`availability-status availability-${availabilityState} mt-3 flex items-center gap-2`} role="status" aria-live="polite" data-state={availabilityState}>
                {availabilityState === "select" && <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary" aria-hidden="true"><Calendar className="h-4 w-4" /></span>}
                <span className="availability-dot" aria-hidden="true" />
                <span>{availabilityLabel}</span>
              </div>
            </div>

            {/* Price Display */}
            {selectedDate && calculatePrice.isLoading && <PublicContentSkeleton cards={1} label={bookingFormCopy.checkingAvailability} />}
            {selectedDate && availabilityError && <p className="rounded-xl border border-destructive/35 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{bookingFormCopy.availabilityError}</p>}
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
  );
}
