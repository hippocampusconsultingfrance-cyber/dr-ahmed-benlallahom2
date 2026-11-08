import { describe, expect, it } from "vitest";
import { getFaqContent } from "../client/src/pages/faqContent";
import { getRouteSeo, renderRouteSeoHead } from "./routeSeo";

describe("route SEO initial head", () => {
  it("expose des métadonnées spécifiques aux parcours Employeurs et recrutement", () => {
    const seo = getRouteSeo("/why-hippocampus?source=linkedin");
    const head = renderRouteSeoHead("/recruitment/vvip-offshore");

    expect(seo.title).toContain("Hippocampus Consulting");
    expect(seo.canonicalPath).toBe("/why-hippocampus");
    expect(head).toContain("Missions santé offshore");
    expect(head).toContain("https://drahmedbenlallahom.com/recruitment/vvip-offshore");
  });

  it("empêche l’indexation des parcours privés et inconnus", () => {
    expect(renderRouteSeoHead("/candidate/portal")).toContain('content="noindex, follow"');
    const unknown = getRouteSeo("/route-inconnue");

    expect(unknown.noIndex).toBe(true);
    expect(unknown.notFound).toBe(true);
  });

  it("reconnaît les routes publiques profondes sans les marquer introuvables", () => {
    for (const path of ["/faq", "/search", "/error", "/maintenance", "/recruitment/vvip-offshore", "/recruitment/unsubscribe", "/questions-anesthesie"]) {
      expect(getRouteSeo(path).notFound, path).not.toBe(true);
    }
  });

  it("conserve une page Questions santé indexable avec une balise canonique dédiée", () => {
    const seo = getRouteSeo("/questions-anesthesie");
    const head = renderRouteSeoHead("/questions-anesthesie");

    expect(seo.noIndex).not.toBe(true);
    expect(seo.title).toContain("Questions santé");
    expect(head).toContain("https://drahmedbenlallahom.com/questions-anesthesie");
  });

  it("publie sur /faq un FAQPage en français, tiré des questions de la page (SEOP-03)", () => {
    const schemas = Array.from(renderRouteSeoHead("/faq?utm_source=newsletter").matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g), match => JSON.parse(match[1]));
    const entries = getFaqContent("fr").entries;

    expect(schemas).toHaveLength(1);
    expect(schemas[0]).toMatchObject({ "@context": "https://schema.org", "@type": "FAQPage", inLanguage: "fr-FR" });
    expect(schemas[0].mainEntity).toEqual(entries.map(entry => ({ "@type": "Question", name: entry.question, acceptedAnswer: { "@type": "Answer", text: entry.answer } })));
    expect(schemas[0].mainEntity.some((item: { acceptedAnswer: { text: string } }) => item.acceptedAnswer.text.includes("100 €"))).toBe(true);
    // Rien de tel sur les autres pages que l'accueil.
    for (const path of ["/booking", "/employers", "/questions-anesthesie"]) expect(renderRouteSeoHead(path), path).not.toContain("application/ld+json");
  });

  it("exclut les outils et pages de statut de l’indexation", () => {
    for (const path of ["/search", "/error", "/maintenance", "/recruitment/unsubscribe"]) {
      expect(getRouteSeo(path).noIndex, path).toBe(true);
    }
  });
});
