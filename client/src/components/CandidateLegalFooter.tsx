import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

export const candidateLegalLinks = {
  legal: "/legal",
  privacy: "/legal?tab=privacy",
  terms: "/legal?tab=terms",
  cookies: "/legal?tab=privacy#cookies",
} as const;

export const candidateLegalFooterCopy = {
  fr: { label: "Informations légales", legal: "Mentions légales", privacy: "Politique de confidentialité", terms: "Conditions d’utilisation", cookies: "Cookies", controller: "Espace candidat édité par Hippocampus Consulting, responsable du traitement de vos données." },
  en: { label: "Legal information", legal: "Legal notice", privacy: "Privacy policy", terms: "Terms of use", cookies: "Cookies", controller: "Candidate portal published by Hippocampus Consulting, controller of your personal data." },
  de: { label: "Rechtliche Informationen", legal: "Impressum", privacy: "Datenschutzerklärung", terms: "Nutzungsbedingungen", cookies: "Cookies", controller: "Kandidatenportal von Hippocampus Consulting, Verantwortlicher für die Verarbeitung Ihrer Daten." },
  zh: { label: "法律信息", legal: "法律声明", privacy: "隐私政策", terms: "使用条款", cookies: "Cookie", controller: "候选人门户由 Hippocampus Consulting 发布，该公司为您个人数据的控制者。" },
} as const;

/**
 * Minimal legal footer for the candidate pages, which do not use the site
 * navigation and footer (LEGAL-23): permanent access to the legal notice, the
 * privacy policy, the terms of use and the cookie information.
 */
export default function CandidateLegalFooter() {
  const { language } = useLanguage();
  const copy = candidateLegalFooterCopy[(language in candidateLegalFooterCopy ? language : "fr") as keyof typeof candidateLegalFooterCopy];
  return (
    <footer className="mx-auto mt-8 max-w-5xl px-1 pb-6 text-xs leading-6 text-slate-400">
      <nav aria-label={copy.label} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link href={candidateLegalLinks.legal} className="underline-offset-4 hover:text-cyan-200 hover:underline">{copy.legal}</Link>
        <Link href={candidateLegalLinks.privacy} className="underline-offset-4 hover:text-cyan-200 hover:underline">{copy.privacy}</Link>
        <Link href={candidateLegalLinks.terms} className="underline-offset-4 hover:text-cyan-200 hover:underline">{copy.terms}</Link>
        <Link href={candidateLegalLinks.cookies} className="underline-offset-4 hover:text-cyan-200 hover:underline">{copy.cookies}</Link>
      </nav>
      <p className="mt-2 text-center text-slate-500">© {new Date().getFullYear()} Hippocampus Consulting · {copy.controller}</p>
    </footer>
  );
}
