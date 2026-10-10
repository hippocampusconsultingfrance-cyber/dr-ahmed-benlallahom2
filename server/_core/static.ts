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

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, { index: false }));
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
