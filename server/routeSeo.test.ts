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
    const unsubscribe = getRouteSeo("/recruitment/unsubscribe?token=example");
    const unknown = getRouteSeo("/route-inconnue");

    expect(unsubscribe.noIndex).toBe(true);
    expect(unsubscribe.notFound).toBeUndefined();
    expect(unknown.noIndex).toBe(true);
    expect(unknown.notFound).toBe(true);
  });
});
