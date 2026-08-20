import { describe, expect, it } from "vitest";
import { contentDe } from "@/data/content-de";
import { contentEn } from "@/data/content-en";
import { contentFr } from "@/data/content-fr";
import { contentZh } from "@/data/content-zh";
import { resourcesCopy } from "@/pages/ResourcesPage";
import { findTranslationLengthIssues } from "./translationLengthGuard";

const PUBLIC_NAVIGATION = {
  fr: { recruitment: "Recrutement", employers: "Employeurs" },
  en: { recruitment: "Recruitment", employers: "Employers" },
  de: { recruitment: "Recruiting", employers: "Arbeitgeber" },
  zh: { recruitment: "招聘", employers: "雇主专区" },
};

describe("garde-fou de longueur des traductions", () => {
  it("signale uniquement les textes dépassant la limite définie", () => {
    expect(findTranslationLengthIssues({ short: "Court", long: "Texte beaucoup trop long" }, 10)).toEqual([
      { key: "long", length: 24, maxLength: 10 },
    ]);
  });

  it("maintient les liens de navigation et CTA critiques dans leurs enveloppes", () => {
    const contents = { fr: contentFr, en: contentEn, de: contentDe, zh: contentZh };
    for (const language of Object.keys(contents) as Array<keyof typeof contents>) {
      const content = contents[language];
      const navigationIssues = findTranslationLengthIssues(
        { ...content.nav, ...PUBLIC_NAVIGATION[language] },
        32,
      );
      const ctaIssues = findTranslationLengthIssues({ bookConsultation: content.hero.bookConsultation }, 40);
      expect(navigationIssues, language).toEqual([]);
      expect(ctaIssues, language).toEqual([]);
    }
  });

  it("protège les libellés publics compacts, y compris les textes allemand et chinois", () => {
    const contents = { fr: contentFr, en: contentEn, de: contentDe, zh: contentZh };
    for (const language of Object.keys(contents) as Array<keyof typeof contents>) {
      const content = contents[language];
      const compactLabels = {
        ...content.nav,
        ...PUBLIC_NAVIGATION[language],
        bookConsultation: content.hero.bookConsultation,
        contact: content.nav.contact,
      };

      expect(findTranslationLengthIssues(compactLabels, 40), language).toEqual([]);
    }
  });

  it("compte les caractères Unicode sans tronquer les libellés CJK", () => {
    expect(findTranslationLengthIssues({ cjk: "预约咨询" }, 3)).toEqual([
      { key: "cjk", length: 4, maxLength: 3 },
    ]);
  });

  it("maintient les filtres et appels à l’action compacts de la page Ressources", () => {
    for (const language of Object.keys(resourcesCopy) as Array<keyof typeof resourcesCopy>) {
      const content = resourcesCopy[language];
      const compactLabels = {
        search: content.search,
        all: content.all,
        safety: content.safety,
        guidance: content.guidance,
        external: content.external,
        pdf: content.pdf,
        web: content.web,
      };

      expect(findTranslationLengthIssues(compactLabels, 42), language).toEqual([]);
    }
  });
});
