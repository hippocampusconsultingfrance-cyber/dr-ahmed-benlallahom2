import { AlertCircle, ArrowRight, Calendar, CheckCircle, FileText, Home, Mail, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Breadcrumb from "@/components/Breadcrumb";
import { useLanguage } from "@/contexts/LanguageContext";
import { SEOHead } from "@/components/SEOHead";

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

  useEffect(() => {
    if (canceled && sessionId) {
      cancelPending.mutate({ sessionId });
    }
  }, [canceled, sessionId]);

  const state = paymentConfirmed ? copy.success : canceled ? copy.canceled : copy.unknown;

  const seoTitle = `${state.title} | Dr. Ahmed Ben Lallahom`;
  const seoDescription = state.description;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:py-12">
      <SEOHead title={seoTitle} description={seoDescription} ogUrl="https://drahmedbenlallahom.com/booking/confirmation" noIndex />
      <div className="max-w-4xl mx-auto">
        <Breadcrumb items={[{ label: state.title }]} />

        <section className={`confirmation-panel ${paymentConfirmed ? "is-success" : "is-canceled"} mt-6`} aria-live="polite">
          <div className="confirmation-icon" aria-hidden="true">
            {paymentConfirmed ? <CheckCircle className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
          </div>
          <span className="eyebrow-label mb-4">{state.eyebrow}</span>
          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl">{state.title}</h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl leading-relaxed">{state.description}</p>

          {trackingId && paymentState !== "unknown" && (
            <div className="confirmation-reference mt-7">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{state.status}</span>
              <strong className="font-mono text-primary text-lg break-all">{trackingId}</strong>
            </div>
          )}

          <p className="mt-7 max-w-2xl text-sm text-foreground/80 leading-relaxed">{state.nextSteps}</p>

          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Button asChild className="cta-primary">
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

        {paymentConfirmed && (
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
          <div className="privacy-trust-card">
            <ShieldCheck className="w-6 h-6 text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground leading-relaxed">{copy.privacy}</p>
          </div>
        </section>

        <section className="confirmation-next-steps mt-6" aria-labelledby="refund-policy-title">
          <div>
            <span className="eyebrow-label mb-3">{copy.refund.title}</span>
            <h2 id="refund-policy-title" className="font-display text-2xl font-semibold">{copy.refund.title}</h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{copy.refund.text}</p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{copy.refund.contact}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
