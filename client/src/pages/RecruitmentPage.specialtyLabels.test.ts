import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));

const { default: RecruitmentPage } = await import("./RecruitmentPage");
const { recruitmentSpecialtyCategories } = await import("./recruitmentSpecialties");

function render(language: "fr" | "en" | "de" | "zh") {
  view.language = language;
  return renderToStaticMarkup(createElement(RecruitmentPage));
}

describe("REC-04 — spécialités du formulaire standard dans la langue de la page", () => {
  it.each(["en", "de", "zh"] as const)("affiche chaque spécialité dans la langue de la page, avec l’intitulé français pour valeur (%s)", language => {
    const html = render(language);
    for (const item of recruitmentSpecialtyCategories.flatMap(group => group.items)) {
      expect(html).toContain(`<option value="${item.value}">${item.labels[language]}</option>`);
      if (item.labels[language] !== item.value) expect(html, item.value).not.toContain(`>${item.value}</option>`);
    }
  });

  it("garde en français les intitulés de la page française", () => {
    expect(render("fr")).toContain("<option value=\"Médecine d’urgence\">Médecine d’urgence</option>");
  });
});
