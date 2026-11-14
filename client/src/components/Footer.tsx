import type { ReactNode } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { siteConfig } from "@/data/site-config";
import { Link } from "wouter";
import { ManageCookiesButton } from "./CookieConsent";

export const getHomeSectionHref = (sectionId: string) => `/#${sectionId}`;
export const footerBrandLogoAltCopy = {
  fr: "Logo du Dr. Ahmed Ben Lallahom",
  en: "Dr. Ahmed Ben Lallahom logo",
  de: "Logo von Dr. Ahmed Ben Lallahom",
  zh: "Ahmed Ben Lallahom 医生标志",
} as const;
const footerResourcesCopy = {
  fr: "Ressources médicales",
  en: "Medical resources",
  de: "Medizinische Ressourcen",
  zh: "医疗资源",
} as const;
const footerPressCopy = {
  fr: "Presse & publications",
  en: "Press & publications",
  de: "Presse & Veröffentlichungen",
  zh: "媒体与出版",
} as const;
export const footerLandmarkCopy = {
  footer: { fr: "Pied de page", en: "Footer", de: "Fußzeile", zh: "页脚" },
  sections: {
    fr: "Rubriques du site",
    en: "Site sections",
    de: "Bereiche der Website",
    zh: "网站栏目",
  },
  legal: {
    fr: "Informations légales",
    en: "Legal information",
    de: "Rechtliche Informationen",
    zh: "法律信息",
  },
} as const;
export const footerGdprCopy = {
  fr: "Exercer mes droits RGPD",
  en: "Exercise my GDPR rights",
  de: "Meine DSGVO-Rechte ausüben",
  zh: "行使我的 GDPR 权利",
} as const;

const linkClass =
  "block text-sm text-muted-foreground hover:text-primary transition-colors";
const headingClass =
  "font-semibold text-foreground mb-4 text-sm uppercase tracking-wide";

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className={headingClass}>{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

export default function Footer() {
  const { content, language } = useLanguage();
  const logoAlt =
    footerBrandLogoAltCopy[language as keyof typeof footerBrandLogoAltCopy] ??
    footerBrandLogoAltCopy.fr;
  const resourcesLabel =
    footerResourcesCopy[language as keyof typeof footerResourcesCopy] ??
    footerResourcesCopy.fr;
  const pressLabel =
    footerPressCopy[language as keyof typeof footerPressCopy] ??
    footerPressCopy.fr;
  const gdprLabel =
    footerGdprCopy[language as keyof typeof footerGdprCopy] ??
    footerGdprCopy.fr;
  const landmarkLanguage = (
    language in footerLandmarkCopy.footer ? language : "fr"
  ) as keyof typeof footerLandmarkCopy.footer;

  return (
    <footer
      className="relative border-t border-border/20 bg-card/30"
      aria-label={footerLandmarkCopy.footer[landmarkLanguage]}
    >
      {/* ECG divider top */}
      <div className="ecg-divider absolute top-0 left-0 right-0" />

      <div className="container py-16 pt-20">
        {/* Colonnes Patients / Recrutement / Informations / Légal (PUB-08), après la marque et ses coordonnées. */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,3fr)_minmax(0,1fr)]">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/assets/abl-logo.svg"
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
            <address className="mt-5 space-y-2.5 not-italic">
              <a
                href={`tel:${siteConfig.phone.replace(/\s/g, "")}`}
                className={linkClass}
              >
                {siteConfig.phone}
              </a>
              <a
                href={`mailto:${siteConfig.email}`}
                className="block break-all text-[13px] leading-5 text-muted-foreground transition-colors hover:text-primary"
              >
                {siteConfig.email}
              </a>
              <a
                href={siteConfig.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                LinkedIn
              </a>
            </address>
          </div>

          <nav
            className="grid gap-10 sm:grid-cols-3"
            aria-label={footerLandmarkCopy.sections[landmarkLanguage]}
          >
            <FooterColumn title={content.footer.patients}>
              {/* Réservation depuis toutes les pages (PUB-02) : un lien classique ouvre /booking en haut de page. */}
              <a className={linkClass} href="/booking">
                {content.hero.bookConsultation}
              </a>
              <a className={linkClass} href="/questions-anesthesie">
                {content.nav.healthQuestions}
              </a>
              <Link href="/faq" className={linkClass}>
                FAQ
              </Link>
              <Link href="/resources" className={linkClass}>
                {resourcesLabel}
              </Link>
            </FooterColumn>

            <FooterColumn title={content.nav.recruitment}>
              <a className={linkClass} href="/recruitment">
                {content.footer.apply}
              </a>
              <a className={linkClass} href="/employers">
                {content.nav.employers}
              </a>
              <a className={linkClass} href="/candidate/access">
                {content.footer.candidatePortal}
              </a>
            </FooterColumn>

            <FooterColumn title={content.footer.information}>
              {[
                { id: "experience", label: content.nav.experience },
                { id: "services", label: content.nav.services },
                { id: "education", label: content.nav.education },
                { id: "contact", label: content.nav.contact },
              ].map(item => (
                <a
                  key={item.id}
                  className={linkClass}
                  href={getHomeSectionHref(item.id)}
                >
                  {item.label}
                </a>
              ))}
              <Link href="/press" className={linkClass}>
                {pressLabel}
              </Link>
            </FooterColumn>
          </nav>

          {/* Legal */}
          <nav aria-label={footerLandmarkCopy.legal[landmarkLanguage]}>
            <FooterColumn title={content.footer.legalHeading}>
              <Link href="/legal" className={linkClass}>
                {content.footer.legal}
              </Link>
              <Link href="/legal?tab=privacy" className={linkClass}>
                {content.footer.privacy}
              </Link>
              <Link href="/legal?tab=terms" className={linkClass}>
                {content.footer.terms}
              </Link>
              <Link href="/gdpr" className={linkClass}>
                {gdprLabel}
              </Link>
              {/* À la place de la pastille flottante, qui couvrait le bas des pages sur téléphone (PUB-12). */}
              <ManageCookiesButton className={`${linkClass} text-left`} />
            </FooterColumn>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 pt-6 border-t border-border/20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {siteConfig.name}.{" "}
            {content.footer.rights}
          </p>
          {/* Mini ECG signature */}
          <svg
            className="w-24 h-6 opacity-30"
            viewBox="0 0 96 24"
            fill="none"
            aria-hidden="true"
          >
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
