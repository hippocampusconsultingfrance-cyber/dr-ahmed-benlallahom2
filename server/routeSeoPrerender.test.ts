import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { venturesFr } from "../client/src/data/ventures-fr";
import { ventureMetaDescription } from "../client/src/pages/VenturePage";
import {
  buildPrerenderedPages,
  createRoutePreloads,
  injectRoutePreloads,
  injectRouteSeoHead,
  prerenderFileForRoute,
  readClientRoutes,
  type ViteManifest,
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

// Routeur et manifeste réduits, de la forme de client/src/App.tsx et du manifeste de Vite.
const APP_SOURCE = `
const FAQPage = lazy(() => import("./pages/FAQPage"));
const RecruitmentPage = lazy(() => import("./pages/RecruitmentPage"));
const VenturePage = lazy(() => import("./pages/VenturePage"));
const ServiceStatusPage = lazy(() => import("./pages/ServiceStatusPage"));
function LocalPage() { return <FAQPage />; }
function Router() {
  return (
    <Switch>
      <Route path="/faq" component={FAQPage} />
      <Route path="/recruitment/standard" component={RecruitmentPage} />
      <Route path="/venture/:slug" component={VenturePage} />
      <Route path="/error" component={() => <ServiceStatusPage kind="error" />} />
      <Route path="/local" component={LocalPage} />
      <Route component={FAQPage} />
    </Switch>
  );
}`;

const MANIFEST: ViteManifest = {
  "index.html": { file: "static/index-E.js", isEntry: true, imports: ["_vendor-V.js"] },
  "_vendor-V.js": { file: "static/vendor-V.js" },
  "src/pages/FAQPage.tsx": { file: "static/FAQPage-F.js", src: "src/pages/FAQPage.tsx", isDynamicEntry: true, imports: ["index.html", "_Footer-A.js", "_vendor-V.js"] },
  "_Footer-A.js": { file: "static/Footer-A.js", imports: ["index.html", "_icon-I.js"] },
  "_icon-I.js": { file: "static/icon-I.js", imports: ["index.html"] },
  // Page aussi importée statiquement par une autre : Vite ne lui donne pas de src.
  "_RecruitmentPage-R.js": { file: "static/RecruitmentPage-R.js", name: "RecruitmentPage", isDynamicEntry: true, imports: ["index.html", "_Footer-A.js"] },
  "src/pages/VenturePage.tsx": { file: "static/VenturePage-W.js", src: "src/pages/VenturePage.tsx", isDynamicEntry: true, imports: ["index.html"] },
  "src/pages/ServiceStatusPage.tsx": { file: "static/ServiceStatusPage-S.js", src: "src/pages/ServiceStatusPage.tsx", isDynamicEntry: true, imports: ["index.html", "_icon-I.js"] },
};

describe("préchargement du chunk de la page de chaque route pré-rendue (SEOP-01)", () => {
  const preloads = createRoutePreloads(MANIFEST, readClientRoutes(APP_SOURCE));

  it("précharge le chunk de la page puis ses imports, sans l’entrée ni les imports de l’entrée", () => {
    expect(preloads("/faq")).toEqual(["/static/FAQPage-F.js", "/static/Footer-A.js", "/static/icon-I.js"]);
  });

  it("retrouve par le nom de son chunk une page que le manifeste liste sans src", () => {
    expect(preloads("/recruitment/standard")).toEqual(["/static/RecruitmentPage-R.js", "/static/Footer-A.js", "/static/icon-I.js"]);
  });

  it("suit les routes à paramètre et les pages rendues dans un composant en ligne", () => {
    expect(preloads("/venture/sawa4you")).toEqual(["/static/VenturePage-W.js"]);
    expect(preloads("/error")).toEqual(["/static/ServiceStatusPage-S.js", "/static/icon-I.js"]);
  });

  it("refuse une route sans page chargée par lazy() plutôt que de l’écrire sans préchargement", () => {
    expect(() => preloads("/local")).toThrow("/local");
    expect(() => preloads("/inconnue")).toThrow("/inconnue");
  });

  it("lit le vrai routeur client : chaque route pré-rendue a le chunk de sa page", () => {
    const pages = readdirSync(new URL("../client/src/pages", import.meta.url)).filter(file => /^[A-Z]\w*\.tsx$/.test(file));
    const manifest: ViteManifest = {
      "index.html": { file: "static/index-E.js", isEntry: true },
      ...Object.fromEntries(pages.map(file => [`src/pages/${file}`, { file: `static/${file.replace(/\.tsx$/, "")}-H.js`, src: `src/pages/${file}`, isDynamicEntry: true, imports: ["index.html"] }])),
    };
    const realPreloads = createRoutePreloads(manifest, readClientRoutes(readProjectFile("client/src/App.tsx")));

    for (const route of getPrerenderRoutes()) expect(realPreloads(route), route).toHaveLength(1);
    expect(Object.fromEntries(["/", "/booking", "/faq", "/legal", "/recruitment", "/recruitment/standard", "/vvip-offshore", `/venture/${venturesFr[0].slug}`, "/error", "/questions-anesthesie"].map(route => [route, realPreloads(route)[0]]))).toEqual({
      "/": "/static/Home-H.js",
      "/booking": "/static/BookingPage-H.js",
      "/faq": "/static/FAQPage-H.js",
      "/legal": "/static/LegalPage-H.js",
      "/recruitment": "/static/RecruitmentHubPage-H.js",
      "/recruitment/standard": "/static/RecruitmentPage-H.js",
      "/vvip-offshore": "/static/VvipOffshorePage-H.js",
      [`/venture/${venturesFr[0].slug}`]: "/static/VenturePage-H.js",
      "/error": "/static/ServiceStatusPage-H.js",
      "/questions-anesthesie": "/static/MedicalQuestionsPage-H.js",
    });
  });

  it("écrit les liens à la fin du <head> sans répéter un fichier que Vite y a déjà mis", () => {
    const html = '<head>\n    <script type="module" crossorigin src="/static/index-E.js"></script>\n  </head>';
    const result = injectRoutePreloads(html, ["/static/index-E.js", "/static/FAQPage-F.js"]);

    expect(result.match(/\/static\/index-E\.js/g)).toHaveLength(1);
    expect(result).toContain('<script type="module" crossorigin src="/static/index-E.js"></script>\n    <link rel="modulepreload" crossorigin href="/static/FAQPage-F.js">\n  </head>');
  });

  it("met les préchargements de la route dans sa page, pas dans la page de repli ni le gabarit Express", () => {
    const pages = buildPrerenderedPages(TEMPLATE, route => (route === "/faq" ? ["/static/FAQPage-F.js"] : []));

    expect(pages.find(page => page.route === "/faq")?.html).toContain('<link rel="modulepreload" crossorigin href="/static/FAQPage-F.js">');
    expect(pages.find(page => page.route === "/legal")?.html).not.toContain("modulepreload");
    expect(pages.find(page => page.file === SPA_FALLBACK_FILE)?.html).not.toContain("modulepreload");
    expect(pages.find(page => page.file === SPA_TEMPLATE_FILE)?.html).toBe(TEMPLATE);
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
