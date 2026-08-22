import { describe, expect, it } from "vitest";
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
    for (const path of ["/faq", "/search", "/error", "/maintenance", "/vvip-offshore", "/recruitment/unsubscribe", "/questions-anesthesie"]) {
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

  it("exclut les outils et pages de statut de l’indexation", () => {
    for (const path of ["/search", "/error", "/maintenance", "/recruitment/unsubscribe"]) {
      expect(getRouteSeo(path).noIndex, path).toBe(true);
    }
  });
});
