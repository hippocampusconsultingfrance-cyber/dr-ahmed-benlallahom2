/**
 * Pré-rendu du <head> SEO des routes publiques, exécuté par `pnpm build`
 * juste après `vite build` (via tsx).
 *
 * Pourquoi : sur Vercel, le HTML est servi statiquement depuis dist/public,
 * sans passer par Express. Le marqueur <!--route-seo--> de client/index.html
 * n'y était donc jamais remplacé : ni <title>, ni description, ni canonique,
 * ni balises Open Graph (aperçus LinkedIn / WhatsApp vides). Ce script écrit,
 * pour chaque route publique de server/routeSeo.ts, une copie du shell SPA
 * construit dont le marqueur est remplacé par le <head> de la route.
 *
 * Disposition des fichiers : vercel.json active "cleanUrls": true. C'est le
 * comportement documenté de Vercel : /booking est servi depuis booking.html,
 * /recruitment/standard depuis recruitment/standard.html, et les URL en
 * ".html" sont redirigées (308) vers l'URL sans extension. Cette disposition
 * permet d'avoir /recruitment (recruitment.html) et ses sous-pages
 * (recruitment/*.html) côte à côte, sans index de répertoire ni redirection
 * vers une URL avec barre oblique finale qui divergerait des canoniques.
 * "/" reste servi par index.html, qui reçoit le <head> de l'accueil.
 *
 * Fichiers produits dans dist/public :
 *  - index.html et <route>.html : <head> propre à chaque route publique, et un
 *    <noscript> qui donne son titre, sa description et les liens principaux (SEOP-01) ;
 *  - _spa-fallback.html : <head> générique non indexable et sans canonique,
 *    cible de la réécriture SPA de vercel.json pour les routes dynamiques ou
 *    privées (candidate/*, admin, booking/confirmation) et les URL inconnues ;
 *  - _spa-template.html : shell intact, contenant encore le marqueur, que
 *    server/_core/static.ts utilise pour rendre le <head> à la volée hors Vercel ;
 *  - sitemap.xml : généré depuis les mêmes routes (indexables, sans alias), avec
 *    la date du build en lastmod (SEO-03). Il n'existe plus de sitemap écrit à la main.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ROUTE_SEO_MARKER,
  SPA_FALLBACK_FILE,
  SPA_TEMPLATE_FILE,
  getPrerenderRoutes,
  renderFallbackNoscript,
  renderFallbackSeoHead,
  renderRouteNoscript,
  renderRouteSeoHead,
  renderSitemapXml,
} from "../server/routeSeo";

export const SITEMAP_FILE = "sitemap.xml";

/** Date du build au format AAAA-MM-JJ (heure de Paris), utilisée comme lastmod du sitemap. */
export function buildDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const SAFE_SEGMENT = /^[a-z0-9-]+$/i;

/** Chemin (relatif à dist/public) du fichier HTML servi pour une route publique. */
export function prerenderFileForRoute(route: string): string {
  if (route === "/") return "index.html";
  const segments = route.replace(/^\/+|\/+$/g, "").split("/");
  if (segments.some(segment => !SAFE_SEGMENT.test(segment))) {
    throw new Error(`Route non pré-rendable : ${route}`);
  }
  return `${segments.join("/")}.html`;
}

export function injectRouteSeoHead(template: string, head: string): string {
  if (!template.includes(ROUTE_SEO_MARKER)) {
    throw new Error(
      `Le shell SPA ne contient pas le marqueur ${ROUTE_SEO_MARKER}.`
    );
  }
  return template.replace(ROUTE_SEO_MARKER, () => head);
}

/** Place le <noscript> en fin de <body>, hors de #root que React remplit seul. */
export function injectNoscript(html: string, noscript: string): string {
  if (!html.includes("</body>")) throw new Error("Le shell SPA ne contient pas de </body>.");
  return html.replace("</body>", () => `  ${noscript}\n  </body>`);
}

export type PrerenderedPage = { route: string; file: string; html: string };

/** Pages à écrire pour un shell SPA donné (sans accès disque, testable). */
export function buildPrerenderedPages(template: string): PrerenderedPage[] {
  return [
    ...getPrerenderRoutes().map(route => ({
      route,
      file: prerenderFileForRoute(route),
      html: injectNoscript(injectRouteSeoHead(template, renderRouteSeoHead(route)), renderRouteNoscript(route)),
    })),
    {
      route: "(repli SPA)",
      file: SPA_FALLBACK_FILE,
      html: injectNoscript(injectRouteSeoHead(template, renderFallbackSeoHead()), renderFallbackNoscript()),
    },
    { route: "(gabarit Express)", file: SPA_TEMPLATE_FILE, html: template },
  ];
}

export async function prerenderRouteSeo(
  distPath: string
): Promise<PrerenderedPage[]> {
  const builtIndex = await readFile(path.join(distPath, "index.html"), "utf8");
  // Relance sans nouveau `vite build` : index.html porte déjà le <head> de
  // l'accueil, on repart donc du gabarit intact écrit lors du premier passage.
  const template = builtIndex.includes(ROUTE_SEO_MARKER)
    ? builtIndex
    : await readFile(path.join(distPath, SPA_TEMPLATE_FILE), "utf8");

  const pages = buildPrerenderedPages(template);
  const files = new Set<string>();
  for (const page of pages) {
    if (files.has(page.file))
      throw new Error(`Fichier pré-rendu en double : ${page.file}`);
    files.add(page.file);
  }

  for (const page of pages) {
    const target = path.join(distPath, page.file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, page.html, "utf8");
  }
  await writeFile(path.join(distPath, SITEMAP_FILE), renderSitemapXml(buildDate()), "utf8");
  return pages;
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  const distPath = path.resolve(
    process.argv[2] ?? fileURLToPath(new URL("../dist/public", import.meta.url))
  );
  prerenderRouteSeo(distPath)
    .then(pages => {
      console.log(
        `[prerender-route-seo] ${pages.length} fichiers HTML et ${SITEMAP_FILE} écrits dans ${distPath}`
      );
    })
    .catch(error => {
      console.error("[prerender-route-seo] Échec du pré-rendu SEO :", error);
      process.exit(1);
    });
}
