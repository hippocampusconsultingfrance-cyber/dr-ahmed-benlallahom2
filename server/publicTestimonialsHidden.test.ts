import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PUBLIC_FEATURES, isPublicTestimonialsEnabled } from "../shared/publicFeatures";
import type { TrpcContext } from "./_core/context";

const getDbMock = vi.fn();
vi.mock("./db", () => ({ getDb: (...args: unknown[]) => getDbMock(...args) }));

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

function publicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

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
    const { getPrerenderRoutes, getRouteSeo } = await import("./routeSeo");
    const { buildPrerenderedPages } = await import("../scripts/prerender-route-seo");

    expect(getPrerenderRoutes()).not.toContain("/testimonials");
    expect(getRouteSeo("/testimonials")).toMatchObject({ notFound: true, noIndex: true });
    const files = buildPrerenderedPages("<html><head><!--route-seo--></head><body></body></html>").map(page => page.file);
    expect(files).not.toContain("testimonials.html");
    expect(read("client/public/sitemap.xml")).not.toContain("/testimonials");
  });

  it("ne sont ni montés sur l'accueil ni routés côté client", () => {
    const home = read("client/src/pages/Home.tsx");
    const app = read("client/src/App.tsx");

    expect(home).toMatch(/\{isPublicTestimonialsEnabled\(\) && \(\s*<div[^>]*>\s*<TestimonialsSection \/>/);
    expect(app).toContain('{isPublicTestimonialsEnabled() && <Route path="/testimonials" component={TestimonialsPage} />}');
    // La route catch-all NotFound reste la dernière : /testimonials affiche donc la page 404.
    expect(app.lastIndexOf("<Route component={NotFound} />")).toBeGreaterThan(app.indexOf('path="/testimonials"'));
  });

  it("n'affichent plus de badge « Vérifié » ni de note agrégée JSON-LD, même s'ils sont réactivés", () => {
    for (const file of ["client/src/components/TestimonialsSection.tsx", "client/src/pages/TestimonialsPage.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/Vérifié|Verified|Verifiziert|已验证/);
      expect(source, file).not.toContain("testimonial.verified");
      expect(source, file).not.toMatch(/aggregateRating|AggregateRating/);
    }
    expect(read("client/index.html")).not.toMatch(/aggregateRating/i);
  });

  it("restent gérables dans l'administration (aucune donnée ni fonction supprimée)", () => {
    const admin = read("client/src/pages/AdminDashboard.tsx");
    expect(admin).toContain("trpc.admin.testimonials.list.useQuery");
    expect(read("server/routers.ts")).toMatch(/testimonials: router\(\{[\s\S]*create: adminProcedure/);
  });
});
