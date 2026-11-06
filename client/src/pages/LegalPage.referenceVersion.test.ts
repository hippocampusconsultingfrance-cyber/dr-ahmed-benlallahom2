import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// RGPD-01 — en attendant la traduction complète du texte validé, les versions
// anglaise, allemande et chinoise de la politique renvoient à la version
// française, qui fait foi ; l’anglais traduit tout le texte français actuel.

const state = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: state.language }) }));
vi.mock("wouter", async () => {
  const { createElement } = await import("react");
  return {
    useSearchParams: () => [new URLSearchParams("tab=privacy"), () => undefined],
    Link: ({ href, children, className }: { href: string; children?: ReactNode; className?: string }) => createElement("a", { href, className }, children),
  };
});
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));

const { default: LegalPage, FRENCH_PRIVACY_POLICY_HREF } = await import("./LegalPage");

function privacyPolicy(language: typeof state.language) {
  state.language = language;
  const html = renderToStaticMarkup(createElement(LegalPage));
  const start = html.indexOf("<section");
  return html.slice(start, html.indexOf("</section>", start));
}
const count = (html: string, tag: string) => html.split(`<${tag}`).length - 1;
const withoutNotice = (html: string) => html.replace(/<aside[\s\S]*?<\/aside>/, "");

describe("RGPD-01 — version de référence des traductions de la politique de confidentialité", () => {
  it("affiche dans chaque traduction un encadré « version de référence : français » avec un lien vers la version française", () => {
    expect(FRENCH_PRIVACY_POLICY_HREF).toBe("/legal?tab=privacy&lang=fr");
    for (const [language, title, link] of [
      ["en", "Reference version: French", "Read the French version"],
      ["de", "Referenzfassung: Französisch", "Französische Fassung lesen"],
      ["zh", "参考版本：法语", "阅读法语版本"],
    ] as const) {
      const html = privacyPolicy(language);
      expect(html, language).toMatch(new RegExp(`<aside role="note" aria-label="${title}"`));
      expect(html, language).toContain(`<a href="/legal?tab=privacy&amp;lang=fr" hrefLang="fr" class="text-primary underline underline-offset-2">${link}</a>`);
    }
    expect(privacyPolicy("fr")).not.toContain("<aside");
  });

  it("traduit en anglais les parties françaises sur le recrutement, l’espace candidat, les questions médicales, les durées et l’IA", () => {
    const html = privacyPolicy("en");
    for (const text of [
      "applications and the candidate portal, recruitment for facilities",
      "the free question-and-answer service on anaesthesia and surgery",
      "Application data: CV, specialty, country of qualification",
      "Documents voluntarily uploaded to the candidate portal",
      "For the free question service: last name, first name, email, phone number, free-text question",
      "<strong>Recruitment and AI:</strong>",
      "It produces no hiring or rejection decision without human review.",
      "<strong>Medical questions and AI:</strong>",
      "<strong>Free medical questions:</strong> 3 years after the last exchange",
      "10. Record of processing activities",
      "<strong>Processing 6 - Free medical questions:</strong>",
      "any writing assistance receives only an administrator’s draft without contact details",
      "the right to lodge a complaint with the CNIL (Commission Nationale de l&#x27;Informatique et des Libertés), the French supervisory authority.",
    ]) expect(html).toContain(text);
  });

  it("donne à l’anglais les mêmes sections et autant d’éléments de liste que le français", () => {
    const french = privacyPolicy("fr");
    const english = withoutNotice(privacyPolicy("en"));
    expect(count(english, "h3")).toBe(count(french, "h3"));
    expect(count(english, "li")).toBe(count(french, "li"));
    expect(count(english, "p")).toBe(count(french, "p"));
  });
});
