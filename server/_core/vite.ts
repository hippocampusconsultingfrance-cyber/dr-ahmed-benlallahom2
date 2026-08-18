import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { getRouteSeo, renderRouteSeoHead } from "../routeSeo";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const seo = getRouteSeo(url);
      const page = (await vite.transformIndexHtml(url, template)).replace(
        "<!--route-seo-->",
        () => renderRouteSeoHead(url)
      );
      res.status(seo.notFound ? 404 : 200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath, { index: false }));

  // Fall through to the SPA shell with route-specific SEO head tags. This keeps
  // social crawlers and non-JS metadata parsers from seeing the home-page tags
  // on every public route while preserving the client-rendered application.
  app.use("*", async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      const seo = getRouteSeo(req.originalUrl);
      res.status(seo.notFound ? 404 : 200).set({ "Content-Type": "text/html" }).end(
        template.replace("<!--route-seo-->", () => renderRouteSeoHead(req.originalUrl))
      );
    } catch (error) {
      next(error);
    }
  });
}
