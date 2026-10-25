import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));

describe("formulaire VVIP multilingue", () => {
  it("utilise des aides de saisie et choix de spécialité localisés", async () => {
    const source = await readFile(new URL("./VvipOffshorePage.tsx", import.meta.url), "utf8");

    expect(source).toContain("experiencePlaceholder");
    expect(source).toContain("certificationsPlaceholder");
    expect(source).toContain("fileHint");
    expect(source).toContain("{t.specialties.map((opt) => (");
    expect(source).toContain('placeholder={t.experiencePlaceholder}');
    expect(source).toContain('placeholder={t.certificationsPlaceholder}');
  });

  it.each(["fr", "en", "de", "zh"] as const)("affiche le sur-titre des domaines d’expertise dans la langue de la page (%s)", async language => {
    const { default: VvipOffshorePage, vvipOffshoreCopy } = await import("./VvipOffshorePage");
    const t = vvipOffshoreCopy[language];
    view.language = language;
    const html = renderToStaticMarkup(createElement(VvipOffshorePage)).replace(/&amp;/g, "&");
    const kicker = html.match(/<p class="section-kicker">([^<]*)<\/p>\s*<h2[^>]*>([^<]*)<\/h2>/g)?.find(block => block.includes(t.section2Title));

    expect(kicker).toContain(`<p class="section-kicker">${t.section2Kicker}</p>`);
    if (language !== "fr") expect(html).not.toContain(vvipOffshoreCopy.fr.section2Kicker);
  });

  it.each(["fr", "en", "de", "zh"] as const)("affiche les mentions du formulaire, des missions et des exigences dans la langue de la page (%s)", async language => {
    const { default: VvipOffshorePage, vvipOffshoreCopy } = await import("./VvipOffshorePage");
    const t = vvipOffshoreCopy[language];
    view.language = language;
    const html = renderToStaticMarkup(createElement(VvipOffshorePage)).replace(/&amp;/g, "&");

    expect(html).toMatch(new RegExp(`>${t.secureChannel}</span>\\s*</div>\\s*<h2[^>]*>${t.formTitle}</h2>`));
    // Une mention par carte de mission.
    expect(html.split(`</svg> ${t.clearanceRequired}</div>`)).toHaveLength(4);
    expect(html).toMatch(new RegExp(`<span class="section-kicker">${t.reqKicker}</span>\\s*<h2[^>]*>${t.reqTitle}</h2>`));
    if (language !== "fr") {
      for (const key of ["secureChannel", "clearanceRequired", "reqKicker"] as const) expect(html, key).not.toContain(vvipOffshoreCopy.fr[key]);
    }
  });
});
