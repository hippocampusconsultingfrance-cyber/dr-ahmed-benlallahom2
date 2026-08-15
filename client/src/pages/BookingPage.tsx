import { useEffect, useState } from "react";
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

  },
  en: {
    title: "Book a Consultation",
    subtitle: "Health Advice - 30 minutes",
    form: {
      name: "Full Name",
      email: "Email",
      phone: "Phone Number",
      date: "Date and Time",
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

  },
  de: {
    title: "Beratung buchen",
    subtitle: "Gesundheitsberatung - 30 Minuten",
    form: {
      name: "Vollständiger Name",
      email: "E-Mail",
      phone: "Telefonnummer",
      date: "Datum und Uhrzeit",
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

  },
  zh: {
    title: "预订咨询",
    subtitle: "健康咨询 - 30 分钟",
    form: {
      name: "全名",
      email: "电子邮件",
      phone: "电话号码",
      date: "日期和时间",
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

  },
};

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

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    date: "",
    details: "",
  });

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"success" | "canceled" | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);

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
        alert(content.paymentError);
      }
    },
    onError: (error) => {
      alert(`${content.paymentError} ${error.message}`);
      console.error("Checkout session error:", error);
    },
  });

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateStr = e.target.value;
    if (dateStr) {
      const date = new Date(dateStr);
      setSelectedDate(date);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      console.error("Booking error:", error);
      alert(`${content.bookingError} ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handleReset = () => {
    setFormData({ name: "", email: "", phone: "", date: "", details: "" });
    setSelectedDate(null);
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
                className="form-field-premium w-full px-4 py-2 border"
              />
            </div>

            {/* Date */}
            <div>
              <label htmlFor="booking-date" className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" aria-hidden="true" />
                {content.form.date}
              </label>
              <input
                id="booking-date"
                type="datetime-local"
                required
                value={formData.date}
                onChange={(e) => {
                  setFormData({ ...formData, date: e.target.value });
                  handleDateChange(e);
                }}
                className="form-field-premium w-full px-4 py-2 border"
                aria-describedby="availability-status"
              />
              <div id="availability-status" className={`availability-status mt-3 ${isBlockedDate || isBookedSlot ? "is-unavailable" : "is-available"}`} role="status" aria-live="polite">
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
