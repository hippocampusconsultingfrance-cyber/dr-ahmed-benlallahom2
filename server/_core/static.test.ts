import express from "express";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ROUTE_SEO_MARKER, SPA_TEMPLATE_FILE } from "../routeSeo";
import { PAGE_REDIRECTS, readSpaTemplate, serveStatic } from "./static";

const directories: string[] = [];

async function distWith(files: Record<string, string>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "spa-template-"));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), content, "utf8");
  }
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("gabarit SPA servi par Express hors Vercel", () => {
  it("préfère le gabarit intact au fichier index.html pré-rendu pour l’accueil", async () => {
    const distPath = await distWith({
      "index.html": "<head><title>Accueil</title></head>",
      [SPA_TEMPLATE_FILE]: `<head>${ROUTE_SEO_MARKER}</head>`,
    });

    await expect(readSpaTemplate(distPath)).resolves.toBe(`<head>${ROUTE_SEO_MARKER}</head>`);
  });

  it("accepte index.html seulement s’il contient encore le marqueur", async () => {
    const distPath = await distWith({ "index.html": `<head>${ROUTE_SEO_MARKER}</head>` });

    await expect(readSpaTemplate(distPath)).resolves.toContain(ROUTE_SEO_MARKER);
  });

  it("refuse de servir un index.html pré-rendu avec le head d’une autre route", async () => {
    const distPath = await distWith({
      "index.html": '<head><link rel="canonical" href="https://drahmedbenlallahom.com/" /></head>',
    });

    await expect(readSpaTemplate(distPath)).rejects.toThrow(ROUTE_SEO_MARKER);
  });
});

describe("serveStatic hors Vercel", () => {
  it("sert /recruitment directement malgré le dossier recruitment/ créé par le pré-rendu", async () => {
    const distPath = await distWith({
      [SPA_TEMPLATE_FILE]: `<html><head>${ROUTE_SEO_MARKER}</head><body></body></html>`,
      "recruitment.html": "<html><head><title>Pré-rendu</title></head></html>",
      "recruitment/standard.html": "<html><head><title>Pré-rendu</title></head></html>",
    });
    const app = express();
    serveStatic(app, distPath);
    const server = app.listen(0);
    try {
      await new Promise(resolve => server.once("listening", resolve));
      const { port } = server.address() as AddressInfo;

      const response = await fetch(`http://127.0.0.1:${port}/recruitment`, { redirect: "manual" });

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<link rel="canonical" href="https://drahmedbenlallahom.com/recruitment"');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it("redirige en 308 les anciennes adresses de vercel.json vers la page principale, paramètres gardés (SEOP-11)", async () => {
    const vercel = JSON.parse(await readFile(path.resolve(process.cwd(), "vercel.json"), "utf8")) as { redirects: unknown[] };
    // Les mêmes redirections que Vercel, pour pnpm start et pnpm dev.
    expect(vercel.redirects).toEqual(Object.entries(PAGE_REDIRECTS).map(([source, destination]) => ({ source, destination, permanent: true })));

    const distPath = await distWith({
      [SPA_TEMPLATE_FILE]: `<html><head>${ROUTE_SEO_MARKER}</head><body></body></html>`,
      "recruitment/vvip-offshore.html": "<html><head><title>Pré-rendu</title></head></html>",
    });
    const app = express();
    serveStatic(app, distPath);
    const server = app.listen(0);
    try {
      await new Promise(resolve => server.once("listening", resolve));
      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}`;

      for (const path of ["/vvip-offshore", "/vvip-offshore/"]) {
        const redirect = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
        expect(redirect.status, path).toBe(308);
        expect(redirect.headers.get("location"), path).toBe("/recruitment/vvip-offshore");
      }
      const redirect = await fetch(`${baseUrl}/vvip-offshore?utm_source=salon&ref=a%20b`, { redirect: "manual" });
      expect(redirect.status).toBe(308);
      expect(redirect.headers.get("location")).toBe("/recruitment/vvip-offshore?utm_source=salon&ref=a%20b");

      const page = await fetch(new URL(redirect.headers.get("location")!, baseUrl), { redirect: "manual" });
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain('<link rel="canonical" href="https://drahmedbenlallahom.com/recruitment/vvip-offshore"');
      expect(html).not.toContain("noindex");
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
