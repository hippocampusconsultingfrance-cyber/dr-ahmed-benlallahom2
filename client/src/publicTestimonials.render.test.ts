import { createElement, type ReactElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// M22 / LEGAL-08 : témoignages masqués du site public par un interrupteur
// unique. L’accueil et le routeur sont rendus avec l’interrupteur fermé puis
// ouvert ; les composants de témoignages, rendus avec un témoignage marqué
// vérifié, n’affichent ni badge « Vérifié » ni note agrégée.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

const view = vi.hoisted(() => ({ testimonials: false }));
vi.mock("@shared/publicFeatures", async importOriginal => ({
  ...await importOriginal<typeof import("@shared/publicFeatures")>(),
  isPublicTestimonialsEnabled: () => view.testimonials,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr" }), LanguageProvider: ({ children }: { children: unknown }) => children }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    testimonials: {
      list: {
        useQuery: () => ({
          data: [{ id: 1, authorName: "Dr Claire Martin", authorTitle: "Anesthésiste", authorCompany: "CHU", specialty: "Anesthésie", content: "Une collaboration remarquable et rigoureuse.", rating: 5, verified: 1, featured: 1, title: "Collaboration", language: "fr" }],
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/hooks/useScrollReveal", () => ({ useScrollReveal: () => ({ current: null }) }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("wouter", async importOriginal => ({
  ...await importOriginal<typeof import("wouter")>(),
  Link: ({ href, children }: { href: string; children: unknown }) => createElement("a", { href }, children as never),
}));

const { default: Home } = await import("./pages/Home");
const { default: App } = await import("./App");
const { default: TestimonialsSection } = await import("./components/TestimonialsSection");
const { default: TestimonialsPage } = await import("./pages/TestimonialsPage");

/** The routes of App's router, in order, as the Switch receives them. */
function routes() {
  const router = elementsOf(App()).find(element => typeof element.type === "function" && (element.type as { name: string }).name === "Router")!;
  const suspense = (router.type as () => ReactElement)();
  const switchElement = elementsOf(suspense).find(element => typeof element.type === "function" && (element.type as { name: string }).name === "Switch")!;
  return ([] as unknown[]).concat(switchElement.props.children as unknown[]).flat().filter(Boolean) as Array<{ props: { path?: string; component?: unknown } }>;
}

beforeEach(() => { view.testimonials = false; });
afterEach(() => resetStatefulHooks());

describe("témoignages masqués du site public (M22 / LEGAL-08)", () => {
  it("ne sont pas montés sur l’accueil tant que l’interrupteur est fermé", () => {
    vi.stubGlobal("window", { location: { hash: "" }, setTimeout: vi.fn(), clearTimeout: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const sections = () => elementsOf(renderStateful(Home)).map(element => element.type);
    expect(sections()).not.toContain(TestimonialsSection);
    resetStatefulHooks();
    view.testimonials = true;
    expect(sections()).toContain(TestimonialsSection);
    resetStatefulHooks();
    vi.unstubAllGlobals();
  });

  it("ne sont pas routés : /testimonials tombe sur la page 404, la dernière route", () => {
    const closed = routes();
    expect(closed.map(route => route.props.path)).not.toContain("/testimonials");
    // News are disabled as well: no /blog route either.
    expect(closed.map(route => route.props.path).filter(path => path?.startsWith("/blog"))).toEqual([]);
    const notFound = closed.find(route => route.props.path === "/404")!.props.component;
    expect(closed.at(-1)!.props).toEqual({ component: notFound });

    view.testimonials = true;
    const open = routes();
    const testimonials = open.findIndex(route => route.props.path === "/testimonials");
    expect(testimonials).toBeGreaterThan(-1);
    expect(testimonials).toBeLessThan(open.length - 1);
  });

  it("n’affichent ni badge « Vérifié » ni note agrégée JSON-LD, même s’ils sont réactivés", () => {
    view.testimonials = true;
    for (const component of [TestimonialsSection, TestimonialsPage]) {
      const html = renderToStaticMarkup(createElement(component));
      expect(html, component.name).toContain("Une collaboration remarquable et rigoureuse.");
      expect(html, component.name).not.toMatch(/Vérifié|Verified|Verifiziert|已验证/);
      expect(html, component.name).not.toMatch(/aggregateRating/i);
    }
  });

  it("ne déclarent aucune note agrégée dans les pages servies", async () => {
    const { buildPrerenderedPages } = await import("../../scripts/prerender-route-seo");
    const template = readFileSync(path.join(process.cwd(), "client/index.html"), "utf8");
    for (const page of buildPrerenderedPages(template)) {
      const jsonLd = [...page.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]!));
      expect(JSON.stringify(jsonLd), page.file).not.toMatch(/aggregateRating/i);
    }
  });
});
