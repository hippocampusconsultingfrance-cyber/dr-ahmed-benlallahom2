import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { getRouteSeo, renderRouteSeoHead } from "../routeSeo";

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
      const template = await fs.promises.readFile(
        path.resolve(distPath, "index.html"),
        "utf-8",
      );
      const seo = getRouteSeo(req.originalUrl);
      res
        .status(seo.notFound ? 404 : 200)
        .set({ "Content-Type": "text/html" })
        .end(
          template.replace("<!--route-seo-->", () =>
            renderRouteSeoHead(req.originalUrl),
          ),
        );
    } catch (error) {
      next(error);
    }
  });
}
