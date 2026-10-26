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
 *  - index.html et <route>.html : <head> propre à chaque route publique, avec
 *    le préchargement (modulepreload) du chunk de sa page, et un <noscript>
 *    qui donne son titre, sa description et les liens principaux (SEOP-01) ;
 *  - _spa-fallback.html : <head> générique non indexable et sans canonique,
 *    cible de la réécriture SPA de vercel.json pour les routes dynamiques ou
 *    privées (candidate/*, admin, booking/confirmation) et les URL inconnues ;
 *  - _spa-template.html : shell intact, contenant encore le marqueur, que
 *    server/_core/static.ts utilise pour rendre le <head> à la volée hors Vercel ;
 *  - sitemap.xml : généré depuis les mêmes routes (indexables, sans alias), avec
 *    la date du build en lastmod (SEO-03). Il n'existe plus de sitemap écrit à la main.
 * Le manifeste de Vite (.vite/manifest.json) est déplacé à côté de dist/public
 * (dist/vite-manifest.json) : il ne sert qu'au build et n'est pas publié.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
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

/** Manifeste écrit par `vite build` (build.manifest de vite.config.ts), relatif à dist/public. */
export const VITE_MANIFEST_FILE = ".vite/manifest.json";
/** Copie gardée après lecture, hors de dist/public, pour une relance sans nouveau build. */
export const KEPT_VITE_MANIFEST_FILE = "../vite-manifest.json";

/** Chunk du manifeste Vite (seuls les champs lus ici). */
export type ViteManifestChunk = {
  file: string;
  src?: string;
  name?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
};
export type ViteManifest = Record<string, ViteManifestChunk>;

const CLIENT_APP_FILE = fileURLToPath(new URL("../client/src/App.tsx", import.meta.url));

/** Route du routeur client et module de sa page, relatif à client/ et sans extension (« src/pages/FAQPage »). */
export type ClientRoute = { path: string; page?: string };

function dynamicImportSpecifier(node: ts.Node): string | undefined {
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const [specifier] = node.arguments;
    return specifier && ts.isStringLiteral(specifier) ? specifier.text : undefined;
  }
  return ts.forEachChild(node, dynamicImportSpecifier);
}

function jsxAttribute(element: ts.JsxSelfClosingElement, name: string): ts.Node | undefined {
  for (const attribute of element.attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name) || attribute.name.text !== name) continue;
    const value = attribute.initializer;
    return value && ts.isJsxExpression(value) ? value.expression : value;
  }
  return undefined;
}

function identifiersIn(node: ts.Node): string[] {
  if (ts.isIdentifier(node)) return [node.text];
  const names: string[] = [];
  ts.forEachChild(node, child => {
    names.push(...identifiersIn(child));
  });
  return names;
}

/**
 * Routes du <Switch> de client/src/App.tsx, dans leur ordre, avec la page chargée par
 * lazy() que chacune affiche. Lues dans le code du routeur lui-même : une route ajoutée
 * ou une page remplacée y est préchargée sans seconde liste à tenir à jour.
 */
export function readClientRoutes(appSource: string): ClientRoute[] {
  const source = ts.createSourceFile("App.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lazyPages = new Map<string, string>();
  const routes: { path: string; component: ts.Node }[] = [];
  const visit = (node: ts.Node) => {
    // const FAQPage = lazy(() => import("./pages/FAQPage"));
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "lazy") {
      const specifier = dynamicImportSpecifier(node.initializer);
      if (specifier) lazyPages.set(node.name.text, path.posix.join("src", specifier));
    }
    // <Route path="/faq" component={FAQPage} />, ou component={() => <ServiceStatusPage kind="error" />}
    if (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName) && node.tagName.text === "Route") {
      const routePath = jsxAttribute(node, "path");
      const component = jsxAttribute(node, "component");
      if (routePath && ts.isStringLiteral(routePath) && component) routes.push({ path: routePath.text, component });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return routes.map(route => {
    const pages = new Set(identifiersIn(route.component).flatMap(name => lazyPages.get(name) ?? []));
    return { path: route.path, page: pages.size === 1 ? Array.from(pages)[0] : undefined };
  });
}

/** Correspondance du <Switch> de wouter pour ces motifs : segments identiques ou « :paramètre ». */
function routeMatches(pattern: string, route: string): boolean {
  const expected = pattern.split("/");
  const actual = route.split("/");
  return expected.length === actual.length
    && expected.every((segment, index) => (segment.startsWith(":") ? actual[index] !== "" : segment === actual[index]));
}

const withoutExtension = (file: string) => file.replace(/\.[cm]?[jt]sx?$/, "");

function pageChunkKey(manifest: ViteManifest, page: string): string {
  const keys = Object.keys(manifest);
  const bySource = keys.filter(key => manifest[key].src !== undefined && withoutExtension(manifest[key].src!) === page);
  // Une page aussi importée statiquement par une autre (RecruitmentPage, par
  // VvipOffshorePage) n'a pas de src dans le manifeste : on la retrouve par son nom.
  const byName = keys.filter(key => manifest[key].src === undefined && manifest[key].isDynamicEntry && manifest[key].name === path.posix.basename(page));
  const found = bySource.length ? bySource : byName;
  if (found.length !== 1) throw new Error(`Chunk de ${page} introuvable dans le manifeste Vite.`);
  return found[0];
}

/** Les chunks donnés et tous leurs imports statiques, de proche en proche. */
function withStaticImports(manifest: ViteManifest, keys: string[], seen = new Set<string>()): Set<string> {
  for (const key of keys) {
    if (seen.has(key)) continue;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Import ${key} absent du manifeste Vite.`);
    seen.add(key);
    withStaticImports(manifest, chunk.imports ?? [], seen);
  }
  return seen;
}

/** Fichiers (URL absolues, ex. /static/FAQPage-….js) à précharger pour une route pré-rendue. */
export type RoutePreloads = (route: string) => string[];

/**
 * Préchargement de chaque route pré-rendue (SEOP-01) : le chunk de sa page et ses
 * imports statiques, sauf l'entrée et ses imports, que Vite écrit déjà dans le HTML.
 * Sans lui, le navigateur ne demande le chunk de la page qu'après avoir téléchargé et
 * exécuté l'entrée, soit un aller-retour réseau de plus avant d'afficher le contenu.
 */
export function createRoutePreloads(manifest: ViteManifest, clientRoutes: ClientRoute[]): RoutePreloads {
  const entries = Object.keys(manifest).filter(key => manifest[key].isEntry);
  if (!entries.length) throw new Error("Aucune entrée dans le manifeste Vite.");
  const inHtml = withStaticImports(manifest, entries);
  return route => {
    const page = clientRoutes.find(candidate => routeMatches(candidate.path, route))?.page;
    if (!page) throw new Error(`Aucune page chargée par lazy() pour ${route} dans client/src/App.tsx.`);
    return Array.from(withStaticImports(manifest, [pageChunkKey(manifest, page)]))
      .filter(key => !inHtml.has(key))
      .map(key => `/${manifest[key].file}`);
  };
}

/** Ajoute à la fin du <head> un modulepreload par fichier qui n'y figure pas encore. */
export function injectRoutePreloads(html: string, files: string[]): string {
  const links = files
    .filter(file => !html.includes(`"${file}"`))
    .map(file => `  <link rel="modulepreload" crossorigin href="${file}">\n  `);
  if (!links.length) return html;
  if (!html.includes("</head>")) throw new Error("Le shell SPA ne contient pas de </head>.");
  return html.replace("</head>", () => `${links.join("")}</head>`);
}

/** Place le <noscript> en fin de <body>, hors de #root que React remplit seul. */
export function injectNoscript(html: string, noscript: string): string {
  if (!html.includes("</body>")) throw new Error("Le shell SPA ne contient pas de </body>.");
  return html.replace("</body>", () => `  ${noscript}\n  </body>`);
}

export type PrerenderedPage = { route: string; file: string; html: string };

/**
 * Pages à écrire pour un shell SPA donné (sans accès disque, testable). Sans
 * routePreloads (tests du <head> seul), aucune page n'est préchargée.
 */
export function buildPrerenderedPages(template: string, routePreloads: RoutePreloads = () => []): PrerenderedPage[] {
  return [
    ...getPrerenderRoutes().map(route => ({
      route,
      file: prerenderFileForRoute(route),
      html: injectNoscript(
        injectRoutePreloads(injectRouteSeoHead(template, renderRouteSeoHead(route)), routePreloads(route)),
        renderRouteNoscript(route),
      ),
    })),
    {
      route: "(repli SPA)",
      file: SPA_FALLBACK_FILE,
      html: injectNoscript(injectRouteSeoHead(template, renderFallbackSeoHead()), renderFallbackNoscript()),
    },
    { route: "(gabarit Express)", file: SPA_TEMPLATE_FILE, html: template },
  ];
}

/**
 * Manifeste du dernier `vite build`, aussitôt rangé hors de dist/public : il ne sert
 * qu'ici, et une relance du script sans nouveau build relit la copie gardée.
 */
async function takeViteManifest(distPath: string): Promise<ViteManifest> {
  const built = path.join(distPath, VITE_MANIFEST_FILE);
  const kept = path.join(distPath, KEPT_VITE_MANIFEST_FILE);
  if (existsSync(built)) {
    await rename(built, kept);
    await rm(path.join(distPath, path.dirname(VITE_MANIFEST_FILE)), { recursive: true, force: true });
  } else if (!existsSync(kept)) {
    throw new Error(`Manifeste Vite introuvable (${built}) : build.manifest doit rester activé dans vite.config.ts.`);
  }
  return JSON.parse(await readFile(kept, "utf8")) as ViteManifest;
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

  const manifest = await takeViteManifest(distPath);
  const clientRoutes = readClientRoutes(await readFile(CLIENT_APP_FILE, "utf8"));
  const pages = buildPrerenderedPages(template, createRoutePreloads(manifest, clientRoutes));
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
