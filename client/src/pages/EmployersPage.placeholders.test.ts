import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("wouter", () => ({
  Link: ({ href, children, className }: { href: string; children: unknown; className?: string }) => createElement("a", { href, className }, children as never),
}));

describe("aides de saisie Employeurs", () => {
  it("emploie les exemples localisés plutôt que des chaînes françaises fixes", async () => {
    const source = await readFile(new URL("./EmployersPage.tsx", import.meta.url), "utf8");

    for (const key of ["specialtyPlaceholder", "countryPlaceholder", "timelinePlaceholder", "notesPlaceholder"]) {
      expect(source).toContain(key);
    }
    expect(source).toContain("placeholder={t.specialtyPlaceholder}");
    expect(source).toContain("placeholder={t.countryPlaceholder}");
    expect(source).toContain("placeholder={t.timelinePlaceholder}");
    expect(source).toContain("placeholder={t.notesPlaceholder}");
  });

  it.each(["fr", "en", "de", "zh"] as const)("donne les exemples de l’établissement, du responsable et des certifications dans la langue de la page (REC-04, %s)", async language => {
    const { default: EmployersPage, employerCopy } = await import("./EmployersPage");
    const t = employerCopy[language];
    view.language = language;
    const html = renderToStaticMarkup(createElement(EmployersPage)).replace(/&amp;/g, "&");

    for (const placeholder of [t.orgNamePlaceholder, t.contactNamePlaceholder, t.certificationsPlaceholder]) expect(html).toContain(`placeholder="${placeholder}"`);
    if (language !== "fr") {
      expect(html).not.toContain("Hôpital, Groupe, Société");
      expect(html).not.toContain("Dr. / M. / Mme");
    }
  });
});
