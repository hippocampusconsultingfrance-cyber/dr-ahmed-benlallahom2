import { describe, expect, it, vi } from "vitest";
import { PUBLIC_FEATURES, isPublicTestimonialsEnabled } from "../shared/publicFeatures";
import type { TrpcContext } from "./_core/context";

const getDbMock = vi.fn();
vi.mock("./db", () => ({ getDb: (...args: unknown[]) => getDbMock(...args) }));

function publicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// Accueil, routeur et composants : client/src/publicTestimonials.render.test.ts ;
// gestion dans l’administration : client/src/pages/AdminDashboard.tabs.test.ts.
describe("témoignages masqués du site public (M22 / LEGAL-08)", () => {
  it("sont désactivés par défaut par un interrupteur unique", () => {
    expect(PUBLIC_FEATURES.testimonials).toBe(false);
    expect(isPublicTestimonialsEnabled()).toBe(false);
    expect(isPublicTestimonialsEnabled({ testimonials: true })).toBe(true);
  });

  it("ne publient plus rien par l'API publique, sans même interroger la base", async () => {
    const { appRouter } = await import("./routers");
    getDbMock.mockReset();
    const caller = appRouter.createCaller(publicContext());

    await expect(caller.testimonials.list({ language: "fr" })).resolves.toEqual([]);
    await expect(caller.testimonials.list({ language: "en", featured: 1 })).resolves.toEqual([]);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("ne pré-rendent pas /testimonials : la route répond 404 et n'est pas dans le sitemap", async () => {
    const { getPrerenderRoutes, getRouteSeo, renderSitemapXml } = await import("./routeSeo");
    const { buildPrerenderedPages } = await import("../scripts/prerender-route-seo");

    expect(getPrerenderRoutes()).not.toContain("/testimonials");
    expect(getRouteSeo("/testimonials")).toMatchObject({ notFound: true, noIndex: true });
    const files = buildPrerenderedPages("<html><head><!--route-seo--></head><body></body></html>").map(page => page.file);
    expect(files).not.toContain("testimonials.html");
    expect(renderSitemapXml("2026-10-16")).not.toContain("/testimonials");
  });
});
