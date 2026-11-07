import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { ROUTE_SEO_MARKER, SPA_TEMPLATE_FILE, getRouteSeo, renderRouteSeoHead } from "../routeSeo";

/**
 * Le build (scripts/prerender-route-seo.ts) pré-rend dist/public/index.html
 * avec le <head> de l'accueil pour Vercel. Express doit donc partir de la copie
 * intacte _spa-template.html, qui contient encore le marqueur. index.html n'est
 * accepté qu'en secours s'il contient lui-même le marqueur (build sans
 * pré-rendu) : jamais un fichier pré-rendu portant le <head> d'une autre route.
 */
export async function readSpaTemplate(distPath: string): Promise<string> {
  for (const file of [SPA_TEMPLATE_FILE, "index.html"]) {
    let content: string;
    try {
      content = await fs.promises.readFile(path.resolve(distPath, file), "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (content.includes(ROUTE_SEO_MARKER)) return content;
  }
  throw new Error(
    `No SPA template containing ${ROUTE_SEO_MARKER} found in ${distPath}, rebuild the client with pnpm build`,
  );
}

/**
 * Anciennes adresses de pages, redirigées en 308 vers leur page principale
 * comme le font les "redirects" de vercel.json (SEOP-11). Sur Vercel, le CDN
 * répond avant toute fonction ; Express fait de même hors Vercel et en
 * développement, en gardant la chaîne de requête.
 */
export const PAGE_REDIRECTS: Readonly<Record<string, string>> = {
  "/vvip-offshore": "/recruitment/vvip-offshore",
};

/**
 * Address of a page without its trailing slash (vercel.json, "trailingSlash":
 * false), or null when there is none to drop: the home page, and /api, whose
 * routes Express answers as they are. Leading slashes and backslashes are
 * reduced to one slash, so that "//autre.site/" never leaves the site.
 */
export function pageAddressWithoutTrailingSlash(path: string): string | null {
  if (path === "/" || !path.endsWith("/") || path === "/api" || path.startsWith("/api/")) return null;
  return `/${path.replace(/^[/\\]+/, "").replace(/\/+$/, "")}`;
}

export function registerPageRedirects(app: Express) {
  // /booking/ → /booking in 308, query kept, as Vercel does (SEOP-11); an old address straight to its page.
  app.use((req, res, next) => {
    const withoutSlash = req.method === "GET" || req.method === "HEAD" ? pageAddressWithoutTrailingSlash(req.path) : null;
    if (!withoutSlash) return next();
    const destination = PAGE_REDIRECTS[withoutSlash] ?? withoutSlash;
    const queryStart = req.originalUrl.indexOf("?");
    res.redirect(308, queryStart === -1 ? destination : destination + req.originalUrl.slice(queryStart));
  });
  for (const [source, destination] of Object.entries(PAGE_REDIRECTS)) {
    app.get(source, (req, res) => {
      const queryStart = req.originalUrl.indexOf("?");
      res.redirect(308, queryStart === -1 ? destination : destination + req.originalUrl.slice(queryStart));
    });
  }
}

export function serveStatic(
  app: Express,
  distPath = process.env.NODE_ENV === "development"
    ? path.resolve(import.meta.dirname, "../..", "dist", "public")
    : path.resolve(import.meta.dirname, "public"),
) {
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  registerPageRedirects(app);
  // Le pré-rendu crée aussi des dossiers (recruitment/, venture/) : sans
  // `redirect: false`, /recruitment serait redirigé en 301 vers /recruitment/.
  app.use(express.static(distPath, { index: false, redirect: false }));
  app.use("*", async (req, res, next) => {
    try {
      const template = await readSpaTemplate(distPath);
      const seo = getRouteSeo(req.originalUrl);
      res
        .status(seo.notFound ? 404 : 200)
        .set({ "Content-Type": "text/html" })
        .end(
          template.replace(ROUTE_SEO_MARKER, () =>
            renderRouteSeoHead(req.originalUrl),
          ),
        );
    } catch (error) {
      next(error);
    }
  });
}
