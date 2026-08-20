import { useLanguage } from "@/contexts/LanguageContext";
import { siteConfig } from "@/data/site-config";
import { getContactFormCopy, publicFormCopy } from "@/lib/publicFormCopy";
import { trpc } from "@/lib/trpc";
import { Phone, Mail, Linkedin, Send, CheckCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const contactCopy = publicFormCopy.contact;

export default function ContactSection() {
  const { content, language } = useLanguage();
  const copy = getContactFormCopy(language);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    message: "",
    gdprConsent: false,
  });
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = trpc.contact.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setFormData({ name: "", phone: "", email: "", message: "", gdprConsent: false });
      toast.success(copy.sent);
    },
    onError: (error) => {
      toast.error(copy.sendError);
      console.error("Contact form error:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.gdprConsent) {
      toast.error(copy.consentRequired);
      return;
    }
    submitMutation.mutate({
      name: formData.name,
      email: formData.email,
      phone: formData.phone || undefined,
      message: formData.message,
      gdprConsent: formData.gdprConsent ? 1 : 0,
    });
  };

  return (
    <section id="contact" className="contact-section py-28 sm:py-36 relative">
      {/* Background subtle */}
      <div className="absolute inset-0 opacity-10">
        <img
          src="/manus-storage/hero-consulting_b0a2cb5b.png"
          loading="lazy"
          alt="Consultation médicale et accompagnement professionnel par le Dr. Ahmed Ben Lallahom"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="absolute inset-0 bg-background/95 diagnostic-grid" />

      {/* ECG divider top */}
      <div className="ecg-divider absolute top-0 left-0 right-0 z-10" />

      <div className="container relative z-10">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16">
          {/* Left: Info — 5 cols */}
          <div className="lg:col-span-5">
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {content.contact.title}
            </h2>
            <p className="text-muted-foreground text-lg mb-12">
              {content.contact.subtitle}
            </p>

            {/* Contact info cards */}
            <div className="space-y-5">
              <a
                href={`tel:${siteConfig.phone.replace(/\s/g, "")}`}
                className="contact-card flex items-center gap-4 group p-4 rounded-xl bg-card/50 border border-border/20 hover:border-primary/30 transition-all"
              >
                <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{copy.phone}</p>
                  <p className="text-foreground font-medium">{siteConfig.phone}</p>
                </div>
              </a>

              <a
                href={`mailto:${siteConfig.email}`}
                className="contact-card flex items-center gap-4 group p-4 rounded-xl bg-card/50 border border-border/20 hover:border-primary/30 transition-all"
              >
                <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{copy.email}</p>
                  <p className="text-foreground font-medium text-sm break-all">{siteConfig.email}</p>
                </div>
              </a>

              <a
                href={siteConfig.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="contact-card flex items-center gap-4 group p-4 rounded-xl bg-card/50 border border-border/20 hover:border-primary/30 transition-all"
              >
                <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Linkedin className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">LinkedIn</p>
                  <p className="text-foreground font-medium">Dr. Ahmed Ben Lallahom</p>
                </div>
              </a>
            </div>
          </div>

          {/* Right: Form — 7 cols */}
          <div className="lg:col-span-7">
            {submitted ? (
              <div className="success-panel p-8 sm:p-10 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30 flex flex-col items-center justify-center min-h-[400px] text-center">
                <CheckCircle className="w-16 h-16 text-primary mb-6" />
                <h3 className="font-display text-2xl font-bold text-foreground mb-3">
                  {copy.successTitle}
                </h3>
                <p className="text-muted-foreground max-w-sm mb-8">
                  {copy.successDescription}
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:border-primary/50 transition-all"
                >
                  {copy.sendAnother}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="contact-form-card p-5 sm:p-8 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/30 space-y-5" aria-busy={submitMutation.isPending}>
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="contact-name" className="block text-sm font-medium text-foreground mb-2">
                      {content.contact.form.name}
                    </label>
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      required
                      placeholder={content.contact.form.namePlaceholder}
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="form-field-premium w-full px-4 py-3 border"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-phone" className="block text-sm font-medium text-foreground mb-2">
                      {content.contact.form.phone}
                    </label>
                    <input
                      id="contact-phone"
                      name="phone"
                      type="tel"
                      placeholder={content.contact.form.phonePlaceholder}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="form-field-premium w-full px-4 py-3 border"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="contact-email" className="block text-sm font-medium text-foreground mb-2">
                      {content.contact.form.email}
                    </label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"

                    required
                    placeholder={content.contact.form.emailPlaceholder}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-input/50 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="contact-message" className="block text-sm font-medium text-foreground mb-2">
                      {content.contact.form.message}
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      required

                    rows={5}
                    placeholder={content.contact.form.messagePlaceholder}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="form-field-premium w-full px-4 py-3 border resize-none"
                  />
                </div>

                <div className="contact-consent flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <input
                    type="checkbox"
                    id="gdprConsent"
                    required
                    checked={formData.gdprConsent}
                    onChange={(e) => setFormData({ ...formData, gdprConsent: e.target.checked })}
                    className="w-5 h-5 rounded border-border/50 text-primary focus:ring-primary/40 cursor-pointer mt-0.5 flex-shrink-0"
                  />
                  <label htmlFor="gdprConsent" className="text-sm text-foreground cursor-pointer flex-1">
                    {content.contact.form.gdprConsent}
                  </label>
                </div>

                {submitMutation.error && (
                  <p role="alert" className="form-alert text-sm text-destructive">
                    {copy.sendError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitMutation.isPending}
                  className="cta-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span role="status">{copy.sending}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      {content.contact.form.send}
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
