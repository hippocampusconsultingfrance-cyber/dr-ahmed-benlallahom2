import { useLanguage } from "@/contexts/LanguageContext";
import { siteConfig } from "@/data/site-config";
import { Link } from "wouter";

export const getHomeSectionHref = (sectionId: string) => `/#${sectionId}`;
export const footerBrandLogoAltCopy = {
  fr: "Logo du Dr. Ahmed Ben Lallahom",
  en: "Dr. Ahmed Ben Lallahom logo",
  de: "Logo von Dr. Ahmed Ben Lallahom",
  zh: "Ahmed Ben Lallahom 医生标志",
} as const;
const footerResourcesCopy = { fr: "Ressources médicales", en: "Medical resources", de: "Medizinische Ressourcen", zh: "医疗资源" } as const;

export default function Footer() {
  const { content, language } = useLanguage();
  const logoAlt = footerBrandLogoAltCopy[language as keyof typeof footerBrandLogoAltCopy] ?? footerBrandLogoAltCopy.fr;
  const resourcesLabel = footerResourcesCopy[language as keyof typeof footerResourcesCopy] ?? footerResourcesCopy.fr;

  return (
    <footer className="relative border-t border-border/20 bg-card/30">
      {/* ECG divider top */}
      <div className="ecg-divider absolute top-0 left-0 right-0" />

      <div className="container py-16 pt-20">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,1fr)_minmax(17rem,1.35fr)]">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/manus-storage/logo-abl_2afbc5e0.png"
                alt={logoAlt}
                className="w-9 h-9"
              />
              <div>
                <span className="font-display text-base font-bold text-foreground block leading-tight">
                  {siteConfig.name}
                </span>
                <span className="text-[10px] uppercase tracking-[0.15em] text-gold-gradient font-semibold">
                  {siteConfig.credentials}
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mt-3">
              {content.footer.tagline}
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">{content.footer.navigate}</h4>
            <nav className="space-y-2.5">
              {[
                { id: "experience", label: content.nav.experience },
                { id: "services", label: content.nav.services },
                { id: "education", label: content.nav.education },
                { id: "contact", label: content.nav.contact },
              ].map((item) => (
                <a
                  key={item.id}
                  className="block text-sm text-muted-foreground hover:text-primary transition-colors"
                  href={getHomeSectionHref(item.id)}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">{content.footer.legal}</h4>
            <nav className="space-y-2.5">
              <Link href="/legal" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                {content.footer.legal}
              </Link>
              <Link href="/legal?tab=privacy" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                {content.footer.privacy}
              </Link>
              <Link href="/legal?tab=terms" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                {content.footer.terms}
              </Link>
              <Link href="/faq" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                FAQ
              </Link>
              <Link href="/resources" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                {resourcesLabel}
              </Link>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">{content.nav.contact}</h4>
            <div className="space-y-2.5">
              <a
                href={`tel:${siteConfig.phone.replace(/\s/g, "")}`}
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {siteConfig.phone}
              </a>
              <a
                href={`mailto:${siteConfig.email}`}
                className="block break-all text-[13px] leading-5 text-muted-foreground transition-colors hover:text-primary lg:break-normal lg:whitespace-nowrap"
              >
                {siteConfig.email}
              </a>
              <a
                href={siteConfig.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                LinkedIn
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 pt-6 border-t border-border/20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {siteConfig.name}. {content.footer.rights}
          </p>
          {/* Mini ECG signature */}
          <svg className="w-24 h-6 opacity-30" viewBox="0 0 96 24" fill="none">
            <path
              d="M0 12 L20 12 L28 12 L32 4 L36 20 L40 8 L44 14 L48 12 L96 12"
              stroke="oklch(0.75 0.15 220)"
              strokeWidth="1.2"
            />
          </svg>
        </div>
      </div>
    </footer>
  );
}
