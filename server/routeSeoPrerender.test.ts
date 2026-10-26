import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { venturesFr } from "../client/src/data/ventures-fr";
import { ventureMetaDescription } from "../client/src/pages/VenturePage";
import {
  buildPrerenderedPages,
  injectRouteSeoHead,
  prerenderFileForRoute,
} from "../scripts/prerender-route-seo";
import {
  ROUTE_SEO_MARKER,
  SPA_FALLBACK_FILE,
  SPA_TEMPLATE_FILE,
  getPrerenderRoutes,
  getRouteSeo,
  renderFallbackSeoHead,
  renderSitemapXml,
} from "./routeSeo";

const readProjectFile = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const TEMPLATE = `<!doctype html>\n<html lang="fr">\n  <head>\n    ${ROUTE_SEO_MARKER}\n  </head>\n  <body><div id="root"></div></body>\n</html>`;

const sitemapPaths = () =>
  Array.from(renderSitemapXml("2026-10-16").matchAll(/<loc>([^<]+)<\/loc>/g), match => {
    const url = new URL(match[1]);
    expect(url.origin).toBe("https://drahmedbenlallahom.com");
    return url.pathname.replace(/\/+$/, "") || "/";
  });

const pageFor = (route: string) => {
  const page = buildPrerenderedPages(TEMPLATE).find(candidate => candidate.route === route);
  if (!page) throw new Error(`Aucune page pré-rendue pour ${route}`);
  return page;
};

describe("pré-rendu SEO des routes publiques pour Vercel", () => {
  it("pré-rend chaque URL du sitemap avec un head indexable et sa propre canonique", () => {
    const routes = getPrerenderRoutes();
    const paths = sitemapPaths();

    expect(paths.length).toBeGreaterThan(10);
    for (const path of paths) {
      expect(routes, path).toContain(path);
      const { html } = pageFor(path);
      expect(html, path).toContain('<meta name="robots" content="index, follow, max-image-preview:large" />');
      expect(html, path).toContain(`<link rel="canonical" href="https://drahmedbenlallahom.com${path}" />`);
      expect(html, path).toContain('<meta property="og:title"');
      expect(html, path).not.toContain(ROUTE_SEO_MARKER);
    }
  });

  it("pré-rend toutes les entreprises de ventures-fr.ts avec le titre et la description de la page client", () => {
    for (const venture of venturesFr) {
      const path = `/venture/${venture.slug}`;
      const seo = getRouteSeo(path);

      expect(getPrerenderRoutes(), path).toContain(path);
      expect(seo.notFound, path).not.toBe(true);
      expect(seo.noIndex, path).not.toBe(true);
      expect(seo.title).toBe(`${venture.company} — ${venture.role} | Dr. Ahmed Ben Lallahom`);
      expect(seo.description).toBe(ventureMetaDescription(venture.description));
    }
    expect(getRouteSeo("/venture/novarena").notFound).toBe(true);
    expect(getRouteSeo("/venture/hippocampus").notFound).toBe(true);
  });

  it("donne à / le head de l’accueil dans index.html", () => {
    const home = pageFor("/");

    expect(home.file).toBe("index.html");
    expect(home.html).toContain("<title>Dr. Ahmed Ben Lallahom | Médecine et Conseil</title>");
    expect(home.html).toContain('<meta name="description" content="Anesthésiste-réanimateur');
    expect(home.html).toContain('<link rel="canonical" href="https://drahmedbenlallahom.com/" />');
    expect(home.html).toContain('<meta property="og:url" content="https://drahmedbenlallahom.com/" />');
  });

  it("écrit des fichiers compatibles cleanUrls, sans doublon", () => {
    expect(prerenderFileForRoute("/")).toBe("index.html");
    expect(prerenderFileForRoute("/booking")).toBe("booking.html");
    expect(prerenderFileForRoute("/recruitment/standard")).toBe("recruitment/standard.html");
    expect(prerenderFileForRoute("/venture/sawa4you")).toBe("venture/sawa4you.html");
    expect(() => prerenderFileForRoute("/../secret")).toThrow();

    const files = buildPrerenderedPages(TEMPLATE).map(page => page.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it("garde le canonique d’un alias vers la page principale", () => {
    expect(pageFor("/vvip-offshore").html).toContain(
      '<link rel="canonical" href="https://drahmedbenlallahom.com/recruitment/vvip-offshore" />',
    );
  });

  it("ne pré-rend aucun parcours privé ou dynamique, laissé à la page de repli", () => {
    const routes = getPrerenderRoutes();
    for (const path of ["/booking/confirmation", "/admin", "/candidate/access", "/candidate/portal", "/candidate/verify", "/404"]) {
      expect(routes, path).not.toContain(path);
    }
  });

  it("refuse un gabarit sans marqueur plutôt que de produire des pages sans head", () => {
    expect(() => injectRouteSeoHead("<head></head>", "<title>x</title>")).toThrow(ROUTE_SEO_MARKER);
  });
});

describe("page de repli SPA servie par Vercel", () => {
  it("porte un head générique non indexable sans canonique ni og:url", () => {
    const head = renderFallbackSeoHead();

    expect(head).toContain("<title>Dr. Ahmed Ben Lallahom</title>");
    expect(head).toContain('<meta name="description"');
    expect(head).toContain('<meta name="robots" content="noindex, follow" />');
    expect(head).not.toContain('rel="canonical"');
    expect(head).not.toContain("og:url");
    expect(head).not.toContain("twitter:url");

    const fallback = buildPrerenderedPages(TEMPLATE).find(page => page.file === SPA_FALLBACK_FILE);
    expect(fallback?.html).toContain(head);
    expect(fallback?.html).not.toContain(ROUTE_SEO_MARKER);
  });

  it("conserve un gabarit intact avec le marqueur pour Express", () => {
    const template = buildPrerenderedPages(TEMPLATE).find(page => page.file === SPA_TEMPLATE_FILE);
    expect(template?.html).toBe(TEMPLATE);
  });

  it("est la cible de la réécriture SPA de vercel.json, après l’API, avec cleanUrls", () => {
    const config = JSON.parse(readProjectFile("vercel.json"));
    const rewrites: { source: string; destination: string; missing?: unknown }[] = config.rewrites;

    expect(config.cleanUrls).toBe(true);
    expect(rewrites[0]).toEqual({ source: "/api/:path*", destination: "/api/index" });
    expect(rewrites.at(-1)).toMatchObject({ source: "/:path*", destination: `/${SPA_FALLBACK_FILE.replace(/\.html$/, "")}` });
    // A missing script or stylesheet (old chunk after a redeploy) gets a 404,
    // never the HTML page cached under /static/ as immutable JavaScript.
    expect(rewrites.at(-1)!.missing).toEqual([{ type: "header", key: "sec-fetch-dest", value: "(script|style)" }]);
    expect(rewrites.some(rewrite => rewrite.destination === "/index.html")).toBe(false);
  });

  it("est générée par le build juste après vite build", () => {
    const build: string = JSON.parse(readProjectFile("package.json")).scripts.build;
    expect(build).toMatch(/^NODE_ENV=production vite build && tsx scripts\/prerender-route-seo\.ts && esbuild /);
  });
});

describe("contenu sans JavaScript des pages pré-rendues (SEOP-01)", () => {
  it("donne le titre, la description et les liens principaux de la route, hors de #root", () => {
    const { html } = pageFor("/faq");
    const seo = getRouteSeo("/faq");
    const noscript = html.slice(html.indexOf("<noscript>"), html.indexOf("</noscript>"));

    expect(html).toContain('<div id="root"></div>');
    expect(html.indexOf("<noscript>")).toBeGreaterThan(html.indexOf('<div id="root"></div>'));
    expect(html.indexOf("</noscript>")).toBeLessThan(html.indexOf("</body>"));
    expect(noscript).toContain(`<h1>${seo.title}</h1>`);
    expect(noscript).toContain(`<p>${seo.description}</p>`);
    expect(noscript).toContain('<nav aria-label="Liens principaux">');
    expect(noscript).toContain('<a href="/booking">Réserver une consultation</a>');
    expect(noscript).toContain('<a href="/faq" aria-current="page">Questions fréquentes</a>');
  });

  it("est présent dans chaque page pré-rendue et dans la page de repli, en français", () => {
    for (const page of buildPrerenderedPages(TEMPLATE).filter(candidate => candidate.file !== SPA_TEMPLATE_FILE)) {
      expect(page.html.match(/<noscript>/g), page.file).toHaveLength(1);
      expect(page.html, page.file).toMatch(/<a href="\/booking"( aria-current="page")?>Réserver une consultation<\/a>/);
      expect(page.html, page.file).toContain("Activez JavaScript dans votre navigateur pour afficher cette page en entier.");
    }
    expect(pageFor("/booking").html).toContain('<a href="/booking" aria-current="page">');
    expect(buildPrerenderedPages(TEMPLATE).find(page => page.file === SPA_FALLBACK_FILE)?.html).toContain("<h1>Dr. Ahmed Ben Lallahom</h1>");
  });
});
