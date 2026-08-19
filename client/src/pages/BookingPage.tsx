import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { Calendar, Clock, User, Mail, Phone, FileText, CheckCircle, AlertCircle } from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";
import { SEOHead } from "@/components/SEOHead";

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
      details: "Détails de votre demande",
      detailsPlaceholder: "Décrivez brièvement votre situation...",
      submit: "Procéder au paiement",
      loading: "Traitement...",
      checkingAvailability: "Vérification du créneau...",
      available: "Créneau disponible",
      blocked: "Date indisponible",
      alreadyBooked: "Ce créneau est déjà réservé",
      selectDate: "Sélectionnez une date et une heure",
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
      emergencyNote: "En cas d’urgence médicale ou de danger immédiat, appelez le 112 ou les services d’urgence locaux. Cette consultation programmée ne remplace pas une prise en charge d’urgence.",

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
      details: "Request Details",
      detailsPlaceholder: "Briefly describe your situation...",
      submit: "Proceed to Payment",
      loading: "Processing...",
      checkingAvailability: "Checking availability...",
      available: "Time slot available",
      blocked: "Date unavailable",
      alreadyBooked: "This time slot is already booked",
      selectDate: "Select a date and time",
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
      emergencyNote: "For a medical emergency or immediate danger, call 112 or your local emergency services. This scheduled consultation does not replace emergency care.",

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
      details: "Anforderungsdetails",
      detailsPlaceholder: "Beschreiben Sie Ihre Situation kurz...",
      submit: "Zur Zahlung übergehen",
      loading: "Verarbeitung...",
      checkingAvailability: "Verfügbarkeit wird geprüft...",
      available: "Termin verfügbar",
      blocked: "Datum nicht verfügbar",
      alreadyBooked: "Dieser Termin ist bereits reserviert",
      selectDate: "Wählen Sie Datum und Uhrzeit",
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
      emergencyNote: "Bei einem medizinischen Notfall oder unmittelbarer Gefahr rufen Sie 112 oder den örtlichen Rettungsdienst an. Diese geplante Beratung ersetzt keine Notfallversorgung.",

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
      details: "请求详情",
      detailsPlaceholder: "简要描述您的情况...",
      submit: "继续付款",
      loading: "处理中...",
      checkingAvailability: "正在检查可用性...",
      available: "时间段可用",
      blocked: "日期不可用",
      alreadyBooked: "该时间段已被预订",
      selectDate: "请选择日期和时间",
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
      emergencyNote: "如遇医疗紧急情况或面临即时危险，请拨打 112 或当地急救服务。本次预约咨询不能替代紧急医疗救治。",

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
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);

  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day && parsed.getHours() === hour && parsed.getMinutes() === minute
    ? parsed
    : null;
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

export default function BookingPage() {
  const { language } = useLanguage();
  const [location, setLocation] = useLocation();
  const content = bookingContent[language as keyof typeof bookingContent] || bookingContent.en;
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
  const [paymentStatus, setPaymentStatus] = useState<"success" | "canceled" | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
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

  const dateKey = formData.date ? formData.date.slice(0, 10) : "";
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
  const availabilityLabel = !selectedDate
    ? content.form.selectDate
    : availabilityPending
      ? content.form.checkingAvailability
      : isBlockedDate
      ? content.form.blocked
      : isBookedSlot
        ? content.form.alreadyBooked
        : content.form.available;
  const availabilityState = getBookingAvailabilityState({
    selected: Boolean(selectedDate),
    pending: availabilityPending,
    blocked: isBlockedDate,
    booked: isBookedSlot,
  });

  const calculatePrice = trpc.appointments.calculatePrice.useQuery(
    { appointmentDate: selectedDate?.toISOString() || "" },
    { enabled: !!selectedDate }
  );

  const createAppointment = trpc.appointments.create.useMutation();

  const createCheckoutSession = trpc.appointments.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        // Use window.location.assign instead of window.open to avoid popup blocking
        window.location.assign(data.checkoutUrl);
      } else {
        paymentSubmissionRef.current = false;
        alert(content.paymentError);
      }
    },
    onError: (error) => {
      paymentSubmissionRef.current = false;
      alert(content.paymentError);
      console.error("Checkout session error:", error);
    },
  });

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
      setDateError(content.form.invalidDate);
      setFormData((current) => ({ ...current, date: "" }));
      return;
    }

    setDateError(null);
    setSelectedDate(parsed);
    setFormData((current) => ({ ...current, date: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}T${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}` }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (paymentSubmissionRef.current || isLoading) return;

    if (!selectedDate) {
      alert(content.form.date);
      return;
    }

    if (isBlockedDate || isBookedSlot) {
      alert(availabilityLabel);
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

      if (appointmentResult.success) {
        await createCheckoutSession.mutateAsync({
          trackingId: appointmentResult.trackingId,
          finalPrice: appointmentResult.finalPrice,
          customerEmail: formData.email,
          customerName: formData.name,
        });
      }
    } catch (error) {
      paymentSubmissionRef.current = false;
      console.error("Booking error:", error);
      alert(content.bookingError);
    }
  };

  const handleReset = () => {
    paymentSubmissionRef.current = false;
    setFormData({ name: "", email: "", phone: "", date: "", details: "" });
    setSelectedDate(null);
    setDateText("");
    setTimeText("");
    setDateError(null);
    setPaymentStatus(null);
    setTrackingId(null);
  };

  const isLoading = createAppointment.isPending || createCheckoutSession.isPending;

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
              src="/manus-storage/booking-care-path_b41c3403.jpg"
              loading="lazy"
              alt=""
              aria-hidden="true"
              className="mb-6 h-32 w-full rounded-xl border border-border/40 object-cover opacity-90"
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
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                autoComplete="tel"
                inputMode="tel"
                enterKeyHint="next"
                className="form-field-premium w-full px-4 py-2 border"
              />
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
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{content.form.dateHint}</p>
              {dateError && <p id="booking-date-error" className="mt-2 text-sm text-destructive" role="alert">{dateError}</p>}
              {localizedDate && <p className="mt-2 text-sm font-medium text-primary" aria-live="polite">{localizedDate}</p>}
              <div id="availability-status" className={`availability-status availability-${availabilityState} mt-3`} role="status" aria-live="polite" data-state={availabilityState}>
                <span className="availability-dot" aria-hidden="true" />
                <span>{availabilityLabel}</span>
              </div>
            </div>

            {/* Price Display */}
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
              <textarea
                id="booking-details"
                required
                value={formData.details}
                onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                placeholder={content.form.detailsPlaceholder}
                rows={4}
                enterKeyHint="done"
                className="form-field-premium w-full px-4 py-2 border"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading || availabilityPending || isBlockedDate || isBookedSlot || !selectedDate || !calculatePrice.data}
              className="cta-primary w-full"
              size="lg"
            >
              {isLoading ? content.form.loading : content.form.submit}
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
