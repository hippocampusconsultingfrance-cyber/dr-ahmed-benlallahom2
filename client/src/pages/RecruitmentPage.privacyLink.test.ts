import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// RGPD-03 — la case RGPD du formulaire de candidature mène à la politique de
// confidentialité par un lien, sans changer son texte.

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));

const { default: RecruitmentPage } = await import("./RecruitmentPage");

const consentText = {
  fr: "J’accepte que mes données soient traitées pour l’examen de ma candidature, y compris par une analyse automatisée d’aide à la présélection, conformément à la politique de confidentialité. Une revue humaine est toujours requise et aucune décision n’est prise uniquement par l’IA.",
  en: "I consent to my data being processed to review my application, including automated analysis to assist pre-screening, in accordance with the privacy policy. Human review is always required and no decision is made solely by AI.",
  de: "Ich stimme der Verarbeitung meiner Daten zur Prüfung meiner Bewerbung einschließlich einer automatisierten Analyse zur Unterstützung der Vorauswahl gemäß der Datenschutzerklärung zu. Eine menschliche Prüfung ist immer erforderlich; keine Entscheidung wird ausschließlich durch KI getroffen.",
  zh: "我同意根据隐私政策处理我的个人数据以审核申请，包括使用自动化分析辅助初步筛选。始终需要人工审核，不会仅依据人工智能作出决定。",
};
const policy = { fr: "politique de confidentialité", en: "privacy policy", de: "Datenschutzerklärung", zh: "隐私政策" };

function consentLabel(language: keyof typeof consentText) {
  view.language = language;
  const html = renderToStaticMarkup(createElement(RecruitmentPage));
  return /<label[^>]*><input id="recruitment-gdpr-consent"[^>]*\/><span>(.*?)<\/span><\/label>/s.exec(html)?.[1] ?? "";
}

const unescape = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");

describe("case RGPD de la candidature", () => {
  it.each(Object.keys(consentText) as Array<keyof typeof consentText>)("relie « %s » à la politique de confidentialité, texte inchangé", language => {
    const label = consentLabel(language);
    const link = /<a href="([^"]+)" target="_blank" rel="noopener"[^>]*>(.*?)<span class="sr-only">[^<]+<\/span><\/a>/.exec(label);
    expect(link?.[1]).toBe("/legal?tab=privacy");
    expect(link?.[2]).toBe(policy[language]);
    // What a sighted visitor reads: the same consent text as before.
    expect(unescape(label.replace(/<span class="sr-only">[^<]+<\/span>/, "").replace(/<[^>]+>/g, ""))).toBe(consentText[language]);
  });
});
