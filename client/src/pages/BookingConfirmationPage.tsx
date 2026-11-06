import { AlertCircle, ArrowRight, Calendar, CalendarPlus, CheckCircle, FileText, Home, Mail, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Breadcrumb from "@/components/Breadcrumb";
import { useLanguage } from "@/contexts/LanguageContext";
import { SEOHead } from "@/components/SEOHead";
import Footer from "@/components/Footer";
import BookingLegalNotice from "@/components/BookingLegalNotice";
import LanguageMenu from "@/components/LanguageMenu";
import { buildBookingIcs, downloadBookingIcs } from "@/lib/bookingCalendar";
import { formatVisitorTime, getBookingLocale } from "@/lib/bookingTime";
import { clearBookingDraft, clearPendingBooking } from "@/lib/pendingBooking";
import { siteConfig } from "@/data/site-config";

export const confirmationContent = {
  fr: {
    success: {
      eyebrow: "Paiement confirmé",
      title: "Votre consultation est confirmée",
      description: "Merci pour votre confiance. Votre demande a été enregistrée et le paiement a été validé par Stripe.",
      nextSteps: "Vous recevrez par email la confirmation détaillée, la facture PDF et les informations utiles à votre consultation.",
      status: "Référence de suivi",
    },
    canceled: {
      eyebrow: "Paiement interrompu",
      title: "Votre réservation n’est pas finalisée",
      description: "Aucun paiement n’a été confirmé. Votre créneau n’est donc pas réservé.",
      nextSteps: "Vous pouvez revenir au formulaire, vérifier vos informations et relancer le paiement lorsque vous êtes prêt.",
      status: "Réservation en attente",
    },
    unknown: {
      eyebrow: "Statut à vérifier",
      title: "Nous ne pouvons pas confirmer le paiement",
      description: "Cette page ne contient pas de confirmation de paiement valide.",
      nextSteps: "Vérifiez votre email ou revenez au formulaire avant de relancer le paiement.",
      status: "Vérification nécessaire",
    },
    processing: {
      eyebrow: "Paiement en cours de validation",
      title: "Votre paiement est en cours de validation",
      description: "Stripe a bien pris en compte votre paiement ; nous attendons sa confirmation définitive.",
      autoUpdate: "Cette page se met à jour automatiquement.",
      stalled: "La confirmation n’est pas encore arrivée : vérifiez votre email ou contactez-nous avec votre référence.",
      nextSteps: "Vous recevrez un email de confirmation dès la validation. Si rien n’arrive d’ici une heure, contactez-nous avec votre référence.",
      status: "Référence de suivi",
    },
    attention: {
      eyebrow: "Réservation à régulariser",
      title: "Paiement reçu, créneau non confirmé",
      description: "Votre paiement a bien été reçu, mais le créneau n’était plus réservé à votre nom au moment du paiement (réservation temporaire expirée ou créneau indisponible).",
      nextSteps: "Contactez-nous avec votre référence de suivi (coordonnées ci-dessous) : vous serez intégralement remboursé ou nous vous proposerons un autre créneau.",
      status: "Référence de suivi",
    },
    // Rendez-vous confirmé, rappelé sur la page et dans le fichier agenda (RES-05).
    appointment: {
      title: "Votre rendez-vous",
      date: "Date et heure",
      duration: "Durée",
      amount: "Montant réglé",
      parisTime: "heure de Paris",
      localTime: (time: string) => `soit ${time} chez vous`,
      minutes: (minutes: number) => `${minutes} minutes`,
      addToCalendar: "Ajouter à mon agenda",
      calendarTitle: "Consultation avec le Dr Ahmed Ben Lallahom",
      reference: "Référence",
      // Ponctuation des libellés (page et fichier agenda) : espace avant les deux-points en français seulement.
      labelSeparator: " : ",
    },
    contactTitle: "Nous contacter",
    stepsTitle: "Prochaines étapes",
    steps: ["Vérifiez votre email de confirmation.", "Conservez votre référence de suivi.", "Préparez votre demande pour la consultation."],
    privacy: "Vos données sont traitées de manière confidentielle et conformément à notre politique de confidentialité.",
    backHome: "Retour à l’accueil",
    newBooking: "Retour à la réservation",
    email: "Un email vous sera envoyé",
    invoice: "Facture PDF incluse",
    refund: {
      title: "Annulation et remboursement",
      text: "Une annulation demandée plus de 24 heures avant la consultation peut être éligible à un remboursement intégral selon les conditions applicables.",
      contact: "Pour demander une annulation après paiement, contactez-nous avec votre référence de suivi.",
    },
  },
  en: {
    success: {
      eyebrow: "Payment confirmed",
      title: "Your consultation is confirmed",
      description: "Thank you for your trust. Your request has been recorded and the payment was validated by Stripe.",
      nextSteps: "You will receive the detailed confirmation, PDF invoice and consultation information by email.",
      status: "Tracking reference",
    },
    canceled: {
      eyebrow: "Payment interrupted",
      title: "Your booking is not finalized",
      description: "No payment was confirmed, so the time slot has not been reserved.",
      nextSteps: "You can return to the form, review your information and restart payment whenever you are ready.",
      status: "Booking pending",
    },
    unknown: {
      eyebrow: "Status to verify",
      title: "We cannot confirm the payment",
      description: "This page does not contain a valid payment confirmation.",
      nextSteps: "Check your email or return to the form before restarting payment.",
      status: "Verification required",
    },
    processing: {
      eyebrow: "Payment being validated",
      title: "Your payment is being validated",
      description: "Stripe has registered your payment; we are waiting for its final confirmation.",
      autoUpdate: "This page updates automatically.",
      stalled: "The confirmation has not arrived yet: check your email or contact us with your reference.",
      nextSteps: "You will receive a confirmation email once it is validated. If nothing arrives within an hour, contact us with your reference.",
      status: "Tracking reference",
    },
    attention: {
      eyebrow: "Booking to be settled",
      title: "Payment received, time slot not confirmed",
      description: "Your payment was received, but the time slot was no longer held for you at the time of payment (temporary hold expired or slot unavailable).",
      nextSteps: "Contact us with your tracking reference (details below): you will be refunded in full or offered another time slot.",
      status: "Tracking reference",
    },
    appointment: {
      title: "Your appointment",
      date: "Date and time",
      duration: "Duration",
      amount: "Amount paid",
      parisTime: "Paris time",
      localTime: (time: string) => `that is ${time} your time`,
      minutes: (minutes: number) => `${minutes} minutes`,
      addToCalendar: "Add to my calendar",
      calendarTitle: "Consultation with Dr Ahmed Ben Lallahom",
      reference: "Reference",
      labelSeparator: ": ",
    },
    contactTitle: "Contact us",
    stepsTitle: "Next steps",
    steps: ["Check your confirmation email.", "Keep your tracking reference.", "Prepare your request for the consultation."],
    privacy: "Your data is handled confidentially and in accordance with our privacy policy.",
    backHome: "Back to home",
    newBooking: "Return to booking",
    email: "Email confirmation sent",
    invoice: "PDF invoice included",
    refund: {
      title: "Cancellation and refund",
      text: "A cancellation requested more than 24 hours before the consultation may be eligible for a full refund under the applicable terms.",
      contact: "To request a cancellation after payment, contact us with your tracking reference.",
    },
  },
  de: {
    success: {
      eyebrow: "Zahlung bestätigt",
      title: "Ihre Beratung ist bestätigt",
      description: "Vielen Dank für Ihr Vertrauen. Ihre Anfrage wurde gespeichert und die Zahlung über Stripe bestätigt.",
      nextSteps: "Sie erhalten die ausführliche Bestätigung, die PDF-Rechnung und die Informationen zur Beratung per E-Mail.",
      status: "Verfolgungsnummer",
    },
    canceled: {
      eyebrow: "Zahlung unterbrochen",
      title: "Ihre Buchung ist nicht abgeschlossen",
      description: "Es wurde keine Zahlung bestätigt; der Termin wurde daher nicht reserviert.",
      nextSteps: "Sie können zum Formular zurückkehren, Ihre Angaben prüfen und die Zahlung später erneut starten.",
      status: "Buchung ausstehend",
    },
    unknown: {
      eyebrow: "Status prüfen",
      title: "Wir können die Zahlung nicht bestätigen",
      description: "Diese Seite enthält keine gültige Zahlungsbestätigung.",
      nextSteps: "Prüfen Sie Ihre E-Mail oder kehren Sie zum Formular zurück, bevor Sie die Zahlung erneut starten.",
      status: "Überprüfung erforderlich",
    },
    processing: {
      eyebrow: "Zahlung wird bestätigt",
      title: "Ihre Zahlung wird bestätigt",
      description: "Stripe hat Ihre Zahlung erfasst; wir warten auf die endgültige Bestätigung.",
      autoUpdate: "Diese Seite aktualisiert sich automatisch.",
      stalled: "Die Bestätigung ist noch nicht eingetroffen: Prüfen Sie Ihre E-Mails oder kontaktieren Sie uns mit Ihrer Referenz.",
      nextSteps: "Sie erhalten eine Bestätigungs-E-Mail, sobald die Zahlung bestätigt ist. Falls innerhalb einer Stunde nichts ankommt, kontaktieren Sie uns mit Ihrer Referenz.",
      status: "Verfolgungsnummer",
    },
    attention: {
      eyebrow: "Buchung zu klären",
      title: "Zahlung erhalten, Termin nicht bestätigt",
      description: "Ihre Zahlung ist eingegangen, aber der Termin war zum Zeitpunkt der Zahlung nicht mehr für Sie reserviert (vorübergehende Reservierung abgelaufen oder Termin nicht verfügbar).",
      nextSteps: "Kontaktieren Sie uns mit Ihrer Verfolgungsnummer (Kontaktdaten unten): Sie erhalten den vollen Betrag zurück oder einen anderen Termin.",
      status: "Verfolgungsnummer",
    },
    appointment: {
      title: "Ihr Termin",
      date: "Datum und Uhrzeit",
      duration: "Dauer",
      amount: "Bezahlter Betrag",
      parisTime: "Pariser Zeit",
      localTime: (time: string) => `also ${time} bei Ihnen`,
      minutes: (minutes: number) => `${minutes} Minuten`,
      addToCalendar: "Zu meinem Kalender hinzufügen",
      calendarTitle: "Beratung mit Dr. Ahmed Ben Lallahom",
      reference: "Referenz",
      labelSeparator: ": ",
    },
    contactTitle: "Kontakt",
    stepsTitle: "Nächste Schritte",
    steps: ["Prüfen Sie Ihre Bestätigungs-E-Mail.", "Bewahren Sie Ihre Verfolgungsnummer auf.", "Bereiten Sie Ihre Anfrage für die Beratung vor."],
    privacy: "Ihre Daten werden vertraulich und gemäß unserer Datenschutzrichtlinie verarbeitet.",
    backHome: "Zur Startseite",
    newBooking: "Zur Buchung zurück",
    email: "Bestätigung per E-Mail",
    invoice: "PDF-Rechnung enthalten",
    refund: {
      title: "Stornierung und Rückerstattung",
      text: "Eine mehr als 24 Stunden vor der Beratung beantragte Stornierung kann nach den geltenden Bedingungen für eine vollständige Rückerstattung berechtigt sein.",
      contact: "Für eine Stornierung nach der Zahlung kontaktieren Sie uns bitte mit Ihrer Verfolgungsnummer.",
    },
  },
  zh: {
    success: {
      eyebrow: "付款已确认",
      title: "您的咨询已确认",
      description: "感谢您的信任。您的请求已记录，Stripe 已确认付款。",
      nextSteps: "您将通过电子邮件收到详细确认、PDF 发票和咨询相关信息。",
      status: "跟踪编号",
    },
    canceled: {
      eyebrow: "付款已中断",
      title: "您的预约尚未完成",
      description: "付款尚未确认，因此该时间段尚未预订。",
      nextSteps: "您可以返回表单，检查信息，并在准备好后重新开始付款。",
      status: "预约待处理",
    },
    unknown: {
      eyebrow: "状态待核实",
      title: "我们无法确认付款",
      description: "此页面不包含有效的付款确认信息。",
      nextSteps: "请查看您的电子邮件，或在重新付款前返回表单。",
      status: "需要核实",
    },
    processing: {
      eyebrow: "付款确认中",
      title: "您的付款正在确认中",
      description: "Stripe 已收到您的付款，我们正在等待最终确认。",
      autoUpdate: "此页面会自动更新。",
      stalled: "尚未收到确认：请查看您的电子邮件，或携带您的编号联系我们。",
      nextSteps: "确认后您将收到确认邮件。如果一小时内未收到，请携带您的编号联系我们。",
      status: "跟踪编号",
    },
    attention: {
      eyebrow: "预约待处理",
      title: "已收到付款，时段未确认",
      description: "我们已收到您的付款，但付款时该时段已不再为您保留（临时保留已过期或时段不可用）。",
      nextSteps: "请携带您的跟踪编号联系我们（联系方式见下方）：我们将为您全额退款或为您安排其他时段。",
      status: "跟踪编号",
    },
    appointment: {
      title: "您的预约",
      date: "日期和时间",
      duration: "时长",
      amount: "已付金额",
      parisTime: "巴黎时间",
      localTime: (time: string) => `即您当地时间 ${time}`,
      minutes: (minutes: number) => `${minutes} 分钟`,
      addToCalendar: "添加到我的日历",
      calendarTitle: "与 Ahmed Ben Lallahom 医生的咨询",
      reference: "编号",
      labelSeparator: "：",
    },
    contactTitle: "联系我们",
    stepsTitle: "下一步",
    steps: ["查看确认邮件。", "保存您的跟踪编号。", "准备咨询所需的请求内容。"],
    privacy: "您的数据将按照隐私政策以保密方式处理。",
    backHome: "返回首页",
    newBooking: "返回预约",
    email: "确认邮件将发送给您",
    invoice: "包含 PDF 发票",
    refund: {
      title: "取消与退款",
      text: "如果在咨询开始前超过 24 小时提出取消请求，根据适用条款，可能符合全额退款条件。",
      contact: "付款后如需申请取消，请携带您的跟踪编号联系我们。",
    },
  },
} as const;

export type BookingConfirmationState = "success" | "canceled" | "unknown";
export type VerifiedPaymentState = "confirmed" | "processing" | "attention" | "not_paid" | "unknown";

const STATUS_POLL_INTERVAL_MS = 3000;
const STATUS_POLL_MAX_UPDATES = 40;
/** Après 2 min sans confirmation, la page ne prétend plus se mettre à jour (RES-05). */
export const STATUS_STALLED_AFTER_MS = STATUS_POLL_INTERVAL_MS * STATUS_POLL_MAX_UPDATES;

/**
 * What the page may claim after Stripe's redirect: "?status=success" alone is
 * never trusted; the server says whether the appointment is confirmed, still
 * being validated, or to be settled.
 */
export function getDisplayedConfirmationState(
  paymentState: BookingConfirmationState,
  verified: { hasSession: boolean; state?: VerifiedPaymentState },
): "confirmed" | "processing" | "attention" | "canceled" | "unknown" {
  if (paymentState === "canceled") return "canceled";
  if (paymentState !== "success") return "unknown";
  if (!verified.hasSession || !verified.state) return "processing";
  if (verified.state === "not_paid") return "unknown";
  return verified.state;
}

/**
 * Text of the calendar event downloaded from the page (RES-05): reference,
 * duration, amount and contact, each label punctuated as the page language
 * writes it ("Référence : …", "Reference: …", "编号：…").
 */
export function buildConfirmationCalendarDescription(
  copy: (typeof confirmationContent)[keyof typeof confirmationContent],
  details: { trackingId: string; durationMinutes: number; amount: string; email: string; phone: string },
): string {
  const { appointment } = copy;
  const line = (label: string, value: string) => `${label}${appointment.labelSeparator}${value}`;
  return [
    line(appointment.reference, details.trackingId),
    line(appointment.duration, appointment.minutes(details.durationMinutes)),
    line(appointment.amount, details.amount),
    line(copy.contactTitle, `${details.email} · ${details.phone}`),
  ].join("\n");
}

export function getBookingConfirmationState(status: string | null): BookingConfirmationState {
  if (status === "success") return "success";
  if (status === "canceled") return "canceled";
  return "unknown";
}

export default function BookingConfirmationPage() {
  const { language } = useLanguage();
  useLocation();
  const copy = confirmationContent[language as keyof typeof confirmationContent] ?? confirmationContent.en;
  const params = new URLSearchParams(window.location.search);
  const paymentState = getBookingConfirmationState(params.get("status"));
  const canceled = paymentState === "canceled";
  const paymentConfirmed = paymentState === "success";
  const trackingId = params.get("trackingId");
  const sessionId = params.get("session_id");
  const cancelPending = trpc.appointments.cancelPending.useMutation();
  const hasVerifiableSession = Boolean(trackingId && /^APT[A-Z0-9]{6,17}$/.test(trackingId) && sessionId && /^cs_[A-Za-z0-9_]{6,250}$/.test(sessionId));
  const publicStatus = trpc.appointments.publicStatus.useQuery(
    { trackingId: trackingId ?? "", sessionId: sessionId ?? "" },
    {
      enabled: paymentConfirmed && hasVerifiableSession,
      retry: 1,
      refetchInterval: (query) => (query.state.data?.state === "processing" && query.state.dataUpdateCount < STATUS_POLL_MAX_UPDATES ? STATUS_POLL_INTERVAL_MS : false),
    },
  );
  const displayed = getDisplayedConfirmationState(paymentState, { hasSession: hasVerifiableSession, state: publicStatus.data?.state });
  const isConfirmed = displayed === "confirmed";
  const confirmedAppointment = publicStatus.data?.state === "confirmed" ? publicStatus.data.appointment : null;
  const confirmedStart = confirmedAppointment ? new Date(confirmedAppointment.appointmentDate) : null;
  const locale = getBookingLocale(language);
  const confirmedLocalTime = confirmedStart ? formatVisitorTime(confirmedStart, locale) : null;

  // Les vérifications s’arrêtent après 2 min (40 × 3 s) ; il n’y en a aucune
  // sans session vérifiable ni après un premier échec : la page le dit au lieu
  // d’annoncer une mise à jour automatique qui n’arrivera plus.
  const [stallDelayElapsed, setStallDelayElapsed] = useState(false);
  useEffect(() => {
    if (displayed !== "processing") return;
    const timer = window.setTimeout(() => setStallDelayElapsed(true), STATUS_STALLED_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [displayed]);
  const stillPolling = hasVerifiableSession && !(publicStatus.isError && !publicStatus.data);
  const statusStalled = displayed === "processing" && (stallDelayElapsed || !stillPolling);

  const formatAmount = (amountEur: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(amountEur);

  const addToCalendar = () => {
    if (!confirmedAppointment || !confirmedStart || !trackingId) return;
    const description = buildConfirmationCalendarDescription(copy, {
      trackingId,
      durationMinutes: confirmedAppointment.durationMinutes,
      amount: formatAmount(confirmedAppointment.amountEur),
      email: siteConfig.email,
      phone: siteConfig.phone,
    });
    const ics = buildBookingIcs({
      trackingId,
      start: confirmedStart,
      durationMinutes: confirmedAppointment.durationMinutes,
      summary: copy.appointment.calendarTitle,
      description,
    });
    downloadBookingIcs(ics, `consultation-${trackingId}.ics`);
  };

  useEffect(() => {
    if (canceled && sessionId) {
      // Le créneau est libéré ; la saisie reste disponible pour une nouvelle tentative.
      cancelPending.mutate({ sessionId }, { onSuccess: () => clearPendingBooking({ checkoutSessionId: sessionId }) });
    }
  }, [canceled, sessionId]);

  useEffect(() => {
    if (paymentConfirmed && trackingId) {
      clearPendingBooking({ trackingId });
      clearBookingDraft();
    }
  }, [paymentConfirmed, trackingId]);

  const state = displayed === "confirmed" ? copy.success
    : displayed === "processing" ? copy.processing
    : displayed === "attention" ? copy.attention
    : displayed === "canceled" ? copy.canceled
    : copy.unknown;

  const seoTitle = `${state.title} | Dr. Ahmed Ben Lallahom`;
  const seoDescription = state.description;

  return (
    <>
    <main className="min-h-screen bg-background px-4 py-8 sm:py-12">
      <SEOHead title={seoTitle} description={seoDescription} ogUrl="https://drahmedbenlallahom.com/booking/confirmation" noIndex />
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 flex justify-end"><LanguageMenu /></div>
        <Breadcrumb items={[{ label: state.title }]} />

        <section className={`confirmation-panel ${isConfirmed ? "is-success" : "is-canceled"} mt-6`} aria-live="polite" data-state={displayed}>
          <div className="confirmation-icon" aria-hidden="true">
            {isConfirmed ? <CheckCircle className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
          </div>
          <span className="eyebrow-label mb-4">{state.eyebrow}</span>
          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl">{state.title}</h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl leading-relaxed">
            {state.description}
            {displayed === "processing" && ` ${statusStalled ? copy.processing.stalled : copy.processing.autoUpdate}`}
          </p>

          {trackingId && displayed !== "unknown" && displayed !== "canceled" && (
            <div className="confirmation-reference mt-7">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{state.status}</span>
              <strong className="font-mono text-primary text-lg break-all">{trackingId}</strong>
            </div>
          )}

          {isConfirmed && confirmedAppointment && confirmedStart && (
            <dl className="mt-7 grid max-w-3xl gap-4 text-sm sm:grid-cols-3" aria-label={copy.appointment.title}>
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{copy.appointment.date}</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(confirmedStart)} ({copy.appointment.parisTime})
                  {confirmedLocalTime && <span className="block text-xs font-normal text-muted-foreground">{copy.appointment.localTime(confirmedLocalTime)}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{copy.appointment.duration}</dt>
                <dd className="mt-1 font-medium text-foreground">{copy.appointment.minutes(confirmedAppointment.durationMinutes)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{copy.appointment.amount}</dt>
                <dd className="mt-1 font-medium text-foreground">{formatAmount(confirmedAppointment.amountEur)}</dd>
              </div>
            </dl>
          )}

          <p className="mt-7 max-w-2xl text-sm text-foreground/80 leading-relaxed">{state.nextSteps}</p>

          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            {isConfirmed && confirmedAppointment && (
              <Button type="button" onClick={addToCalendar} className="cta-primary">
                <CalendarPlus className="w-4 h-4" aria-hidden="true" />
                {copy.appointment.addToCalendar}
              </Button>
            )}
            <Button asChild variant={confirmedAppointment ? "outline" : "default"} className={confirmedAppointment ? "cta-secondary" : "cta-primary"}>
              <a href="/booking">
                {copy.newBooking}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="outline" className="cta-secondary">
              <a href="/">
                <Home className="w-4 h-4" aria-hidden="true" />
                {copy.backHome}
              </a>
            </Button>
          </div>
        </section>

        {isConfirmed && (
        <section className="grid md:grid-cols-3 gap-4 mt-6" aria-label={copy.stepsTitle}>
          {[
            { icon: Mail, label: copy.email },
            { icon: FileText, label: copy.invoice },
            { icon: Calendar, label: copy.steps[2] },
          ].map(({ icon: Icon, label }) => (
            <Card key={label} className="trust-card-premium p-5">
              <Icon className="w-5 h-5 text-primary mb-4" aria-hidden="true" />
              <p className="text-sm font-medium leading-relaxed">{label}</p>
            </Card>
          ))}
        </section>
        )}

        <section className="confirmation-next-steps mt-8">
          {(displayed === "confirmed" || displayed === "processing") && (
          <div>
            <span className="eyebrow-label mb-3">{copy.stepsTitle}</span>
            <ol className="space-y-3 text-sm text-muted-foreground">
              {copy.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="step-number" aria-hidden="true">0{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          )}
          <div className="privacy-trust-card">
            <ShieldCheck className="w-6 h-6 text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground leading-relaxed">{copy.privacy}</p>
            <BookingLegalNotice showPurpose={false} className="mt-2" />
          </div>
        </section>

        <section className="confirmation-next-steps mt-6" aria-labelledby="refund-policy-title">
          <div>
            <span className="eyebrow-label mb-3">{copy.refund.title}</span>
            <h2 id="refund-policy-title" className="font-display text-2xl font-semibold">{copy.refund.title}</h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{copy.refund.text}</p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{copy.refund.contact}</p>
            <p className="mt-2 text-sm leading-relaxed">
              <span className="font-medium text-foreground">{copy.contactTitle}{copy.appointment.labelSeparator}</span>
              <a className="text-primary underline underline-offset-2" href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
              {" · "}
              <a className="text-primary underline underline-offset-2" href={`tel:${siteConfig.phone.replace(/\s/g, "")}`}>{siteConfig.phone}</a>
            </p>
          </div>
        </section>
      </div>
    </main>
    <Footer />
    </>
  );
}
