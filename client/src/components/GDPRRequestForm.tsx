import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const gdprRequestCopy = {
  fr: { submitted: "Demande RGPD soumise avec succès !", error: "La demande n’a pas pu être envoyée. Veuillez réessayer.", back: "Retour", received: "Demande reçue !", another: "Soumettre une autre demande", sending: "Envoi en cours..." },
  en: { submitted: "GDPR request submitted successfully!", error: "The request could not be sent. Please try again.", back: "Back", received: "Request received!", another: "Submit another request", sending: "Submitting..." },
  de: { submitted: "DSGVO-Anfrage erfolgreich übermittelt!", error: "Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.", back: "Zurück", received: "Anfrage eingegangen!", another: "Weitere Anfrage senden", sending: "Wird gesendet..." },
  zh: { submitted: "GDPR 请求已成功提交！", error: "无法发送请求，请重试。", back: "返回", received: "已收到请求！", another: "提交另一项请求", sending: "正在提交..." },
} as const;

interface GDPRRequestFormProps {
  onBack?: () => void;
}

export default function GDPRRequestForm({ onBack }: GDPRRequestFormProps) {
  const { content, language } = useLanguage();
  const copy = gdprRequestCopy[(language in gdprRequestCopy ? language : "fr") as keyof typeof gdprRequestCopy];
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    requestType: "access" as const,
    description: "",
  });
  const [submitted, setSubmitted] = useState(false);

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
      toast.success(copy.submitted);
    },
    onError: (error) => {
      toast.error(copy.error);
      console.error("GDPR form error:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate({
      name: formData.name,
      email: formData.email,
      phone: formData.phone || undefined,
      requestType: formData.requestType,
      description: formData.description || undefined,
    });
  };

  return (
    <section className="py-28 sm:py-36 relative">
      {/* Background subtle */}
      <div className="absolute inset-0 opacity-10">
        <img
          src="/manus-storage/hero-consulting_b0a2cb5b.png"
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
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                {copy.back}
              </button>
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

          {/* Form or Success Message */}
          {submitted ? (
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
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {content.gdpr.form.name}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={content.gdpr.form.namePlaceholder}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-input/50 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {content.gdpr.form.email}
                  </label>
                  <input
                    type="email"
                    required
                    placeholder={content.gdpr.form.emailPlaceholder}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-input/50 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {content.gdpr.form.phone}
                </label>
                <input
                  type="tel"
                  placeholder={content.gdpr.form.phonePlaceholder}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-input/50 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {content.gdpr.form.requestType}
                </label>
                <select
                  required
                  value={formData.requestType}
                  onChange={(e) => setFormData({ ...formData, requestType: e.target.value as any })}
                  className="w-full px-4 py-3 rounded-lg bg-input/50 border border-border/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                >
                  <option value="access">{content.gdpr.form.requestTypes.access}</option>
                  <option value="rectification">{content.gdpr.form.requestTypes.rectification}</option>
                  <option value="deletion">{content.gdpr.form.requestTypes.deletion}</option>
                  <option value="portability">{content.gdpr.form.requestTypes.portability}</option>
                  <option value="objection">{content.gdpr.form.requestTypes.objection}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {content.gdpr.form.description}
                </label>
                <textarea
                  rows={6}
                  placeholder={content.gdpr.form.descriptionPlaceholder}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-input/50 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitMutation.isPending}
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
