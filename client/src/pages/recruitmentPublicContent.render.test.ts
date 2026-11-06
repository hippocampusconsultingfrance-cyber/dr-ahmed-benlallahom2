import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Contenu public des deux formulaires de candidature, rendu dans chaque
// langue : l’encadré de confiance (confidentialité, consentement, décision
// humaine, délai) et un positionnement VVIP sans référence aux résidences.

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/TurnstileWidget", () => ({ TurnstileWidget: () => null }));

const { default: RecruitmentPage } = await import("./RecruitmentPage");
const { default: VvipOffshorePage } = await import("./VvipOffshorePage");

const languages = ["fr", "en", "de", "zh"] as const;
/** The human-review statement: decisions are left to a person, or none is made automatically. */
const humanReview = {
  fr: /revue humaine|aucune décision[^.;]* automatiquement/,
  en: /human review|no [^.;]*decision[^.;]* automatically/i,
  de: /menschlichen? Prüfung|keine [^.;]*entscheidung[^.;]* automatisiert/i,
  zh: /人工审核|不会自动作出/,
} as const;

function render(page: () => unknown, language: (typeof languages)[number]) {
  view.language = language;
  return renderToStaticMarkup(createElement(page as never)).replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

/** The items of the trust box introduced by the heading of the given id. */
function trustItems(html: string, titleId: string) {
  const start = html.indexOf(`id="${titleId}"`);
  expect(start).toBeGreaterThan(-1);
  const list = html.slice(start, html.indexOf("</ul>", start));
  return [...list.matchAll(/<li[^>]*>.*?<span>([^<]+)<\/span><\/li>/g)].map(match => match[1]!);
}

describe("contenu public des parcours recrutement", () => {
  it.each(languages)("affiche la réassurance confidentialité, consentement, revue humaine et délai sur les deux formulaires (%s)", language => {
    for (const [page, titleId] of [[RecruitmentPage, "recruitment-public-trust-title"], [VvipOffshorePage, "vvip-public-trust-title"]] as const) {
      const items = trustItems(render(page, language), titleId);
      expect(items, titleId).toHaveLength(4);
      expect(items.some(item => humanReview[language].test(item)), `${titleId}: human review`).toBe(true);
    }
  });

  it("exclut les références aux résidences du positionnement VVIP", () => {
    for (const language of languages) {
      expect(render(RecruitmentPage, language)).not.toMatch(/Résidences de prestige|Prestige residences|Prestigeresidenzen|高端宅邸/);
      expect(render(VvipOffshorePage, language)).not.toMatch(/résidences royales|Residences \/ Government|VVIP Residences|VVIP-Residenzen|VVIP 宅邸/);
    }
  });
});
