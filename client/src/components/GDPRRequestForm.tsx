import { useLanguage } from "@/contexts/LanguageContext";
import { siteConfig } from "@/data/site-config";
import { trpc } from "@/lib/trpc";
import { getGdprRequestCopy, publicFormCopy, publicFormErrorMessage } from "@/lib/publicFormCopy";
import { cleanTextInput } from "@shared/textInputCleaning";
import { CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { TurnstileWidget } from "./TurnstileWidget";

export const gdprRequestCopy = publicFormCopy.gdpr;

export const gdprFieldIds = {
  name: "gdpr-request-name",
  email: "gdpr-request-email",
  phone: "gdpr-request-phone",
  requestType: "gdpr-request-type",
  description: "gdpr-request-description",
} as const;

/** Types de demande, dans l’ordre des droits de la politique de confidentialité, puis le retrait d’un consentement (RGPD-13). */
const GDPR_REQUEST_TYPES = ["access", "rectification", "deletion", "restriction", "portability", "objection", "consent_withdrawal"] as const;
type GdprRequestType = (typeof GDPR_REQUEST_TYPES)[number];

/** Jeton du lien de confirmation de l’adresse (?confirm=…), envoyé avec l’accusé de réception (RGPD-13). */
function gdprConfirmationTokenOf(search: string) {
  return new URLSearchParams(search).get("confirm") ?? "";
}

/**
 * Confirmation de l’adresse d’une demande depuis le lien de l’email
 * (RGPD-13) : par un bouton, jamais à l’ouverture de la page, qu’un antivirus
 * de messagerie peut faire seul.
 */
function GdprEmailConfirmation({ token, onDone }: { token: string; onDone: () => void }) {
  const { content } = useLanguage();
  const text = content.gdpr.confirmation;
  const confirm = trpc.gdpr.confirmEmail.useMutation();
  const reason = (confirm.error as { data?: { reason?: unknown } | null } | null)?.data?.reason;
  const refusal = reason === "gdpr_confirmation_used" ? text.used : reason === "gdpr_confirmation_invalid" ? text.invalid : confirm.error ? text.error : "";
  return (
    <div className="p-8 sm:p-10 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30 flex flex-col items-center justify-center min-h-[300px] text-center">
      {confirm.isSuccess ? (
        <div role="status">
          <CheckCircle className="w-16 h-16 text-primary mb-6 mx-auto" aria-hidden="true" />
          <h2 className="font-display text-2xl font-bold text-foreground mb-3">{text.confirmedTitle}</h2>
          <p className="text-muted-foreground max-w-sm mb-8">{text.confirmed.replace("{reference}", confirm.data.reference)}</p>
        </div>
      ) : (
        <>
          <h2 className="font-display text-2xl font-bold text-foreground mb-3">{text.title}</h2>
          <p className="text-muted-foreground max-w-sm mb-8">{text.description}</p>
          {refusal && <p role="alert" className="form-alert text-sm text-destructive mb-6">{refusal}</p>}
          {reason !== "gdpr_confirmation_used" && reason !== "gdpr_confirmation_invalid" && (
            <button
              type="button"
              onClick={() => confirm.mutate({ token })}
              disabled={confirm.isPending}
              className="mb-6 flex items-center justify-center gap-2 px-7 py-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {confirm.isPending ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{text.confirming}</> : text.button}
            </button>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onDone}
        className="px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:border-primary/50 transition-all"
      >
        {text.newRequest}
      </button>
    </div>
  );
}

interface GDPRRequestFormProps {
  /** Page où ramène « Retour », un vrai lien (A11Y-17). */
  backHref?: string;
}

export default function GDPRRequestForm({ backHref }: GDPRRequestFormProps) {
  const { content, language } = useLanguage();
  const copy = getGdprRequestCopy(language);
  const [confirmationToken, setConfirmationToken] = useState(() => typeof window === "undefined" ? "" : gdprConfirmationTokenOf(window.location.search));
  const [formData, setFormData] = useState<{ name: string; email: string; phone: string; requestType: GdprRequestType; description: string }>({
    name: "",
    email: "",
    phone: "",
    requestType: "access",
    description: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Une fois la limite atteinte, rappeler l'adresse de contact donnée par la politique de confidentialité.
  const errorMessage = (error: unknown) => publicFormErrorMessage(error, copy.refusals, copy.error).replace("{email}", siteConfig.email);

  const submitMutation = trpc.gdpr.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setFormData({
        name: "",
        email: "",
        phone: "",
        requestType: "access",
        description: "",
      });
      setTurnstileToken(null);
      toast.success(copy.submitted);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      console.error("GDPR form error:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) return;
    submitMutation.mutate({
      name: formData.name,
      email: formData.email,
      phone: formData.phone || undefined,
      requestType: formData.requestType,
      description: formData.description || undefined,
      turnstileToken,
      // Langue de l’accusé de réception (RGPD-13).
      language,
    });
  };

  // Retour au formulaire depuis la confirmation : le jeton quitte l’adresse.
  const leaveConfirmation = () => {
    window.history.replaceState(window.history.state, "", window.location.pathname);
    setConfirmationToken("");
  };

  return (
    <section className="py-28 sm:py-36 relative">
      {/* Background subtle */}
      <div className="absolute inset-0 opacity-10">
        <img
          src="/assets/consulting-network.svg"
          loading="lazy"
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
      <div className="absolute inset-0 bg-background/95 diagnostic-grid" />

      {/* ECG divider top */}
      <div className="ecg-divider absolute top-0 left-0 right-0 z-10" />

      <div className="container relative z-10">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-12">
            {backHref && (
              <Link
                href={backHref}
                className="flex w-fit items-center gap-2 text-primary hover:text-primary/80 transition-colors mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                {copy.back}
              </Link>
            )}
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {content.gdpr.title}
            </h1>
            <p className="text-muted-foreground text-lg mb-4">
              {content.gdpr.subtitle}
            </p>
            <p className="text-muted-foreground">
              {content.gdpr.description}
            </p>
          </div>

          {/* Address confirmation, Form or Success Message */}
          {confirmationToken ? (
            <GdprEmailConfirmation token={confirmationToken} onDone={leaveConfirmation} />
          ) : submitted ? (
            <div className="p-8 sm:p-10 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30 flex flex-col items-center justify-center min-h-[400px] text-center">
              <CheckCircle className="w-16 h-16 text-primary mb-6" />
              <h3 className="font-display text-2xl font-bold text-foreground mb-3">
                {copy.received}
              </h3>
              <p className="text-muted-foreground max-w-sm mb-8">
                {content.gdpr.form.successMessage}
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:border-primary/50 transition-all"
              >
                {copy.another}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-8 sm:p-10 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30 space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor={gdprFieldIds.name} className="block text-sm font-medium text-foreground mb-2">
                    {content.gdpr.form.name}
                  </label>
                  <input
                    type="text"
                    id={gdprFieldIds.name}
                    autoComplete="name"
                    required
                    placeholder={content.gdpr.form.namePlaceholder}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-input/50 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor={gdprFieldIds.email} className="block text-sm font-medium text-foreground mb-2">
                    {content.gdpr.form.email}
                  </label>
                  <input
                    type="email"
                    id={gdprFieldIds.email}
                    autoComplete="email"
                    required
                    placeholder={content.gdpr.form.emailPlaceholder}
                    value={formData.email}
                    // Pasted address: without the spaces and direction marks left at either end, as the server reads it (INTL-05).
                    onChange={(e) => setFormData({ ...formData, email: cleanTextInput(e.target.value) })}
                    className="w-full px-4 py-3 rounded-lg bg-input/50 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor={gdprFieldIds.phone} className="block text-sm font-medium text-foreground mb-2">
                  {content.gdpr.form.phone}
                </label>
                <input
                  type="tel"
                  id={gdprFieldIds.phone}
                  autoComplete="tel"
                  placeholder={content.gdpr.form.phonePlaceholder}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-input/50 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                />
              </div>

              <div>
                <label htmlFor={gdprFieldIds.requestType} className="block text-sm font-medium text-foreground mb-2">
                  {content.gdpr.form.requestType}
                </label>
                <select
                  required
                  id={gdprFieldIds.requestType}
                  value={formData.requestType}
                  onChange={(e) => setFormData({ ...formData, requestType: e.target.value as GdprRequestType })}
                  className="w-full px-4 py-3 rounded-lg bg-input/50 border border-border/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                >
                  {GDPR_REQUEST_TYPES.map(type => (
                    <option key={type} value={type}>{content.gdpr.form.requestTypes[type]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={gdprFieldIds.description} className="block text-sm font-medium text-foreground mb-2">
                  {content.gdpr.form.description}
                </label>
                <textarea
                  rows={6}
                  id={gdprFieldIds.description}
                  placeholder={content.gdpr.form.descriptionPlaceholder}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-input/50 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all resize-none"
                />
              </div>

              {submitMutation.error && (
                <p role="alert" className="form-alert text-sm text-destructive">
                  {errorMessage(submitMutation.error)}
                </p>
              )}

              <TurnstileWidget onToken={setTurnstileToken} />

              <button
                type="submit"
                disabled={submitMutation.isPending || !turnstileToken}
                className="w-full flex items-center justify-center gap-2 px-7 py-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all duration-200 active:scale-[0.97] shadow-lg shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {copy.sending}
                  </>
                ) : (
                  content.gdpr.form.send
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
