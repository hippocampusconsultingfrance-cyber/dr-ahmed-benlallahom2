import express from "express";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import superjson from "superjson";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { venturesFr } from "../client/src/data/ventures-fr";
import {
  KEPT_VITE_MANIFEST_FILE,
  VITE_MANIFEST_FILE,
  prerenderFileForRoute,
  prerenderRouteSeo,
} from "../scripts/prerender-route-seo";
import { getRouteSeo } from "./routeSeo";

/**
 * Le vrai build (vite build puis scripts/prerender-route-seo.ts) dans un dossier temporaire :
 * chaque page principale de dist/public précharge le chunk de sa page et porte son <noscript>.
 */
const root = path.resolve(import.meta.dirname, "..");

/** Routes principales et nom du chunk de leur page (client/src/App.tsx). */
const MAIN_ROUTES: Record<string, string> = {
  "/": "Home",
  "/booking": "BookingPage",
  "/faq": "FAQPage",
  "/legal": "LegalPage",
  "/gdpr": "GDPRPage",
  "/press": "PressPage",
  "/resources": "ResourcesPage",
  "/questions-anesthesie": "MedicalQuestionsPage",
  "/recruitment": "RecruitmentHubPage",
  "/recruitment/standard": "RecruitmentPage",
  "/recruitment/vvip-offshore": "VvipOffshorePage",
  "/employers": "EmployersPage",
  "/why-hippocampus": "WhyHippocampusPage",
  [`/venture/${venturesFr[0].slug}`]: "VenturePage",
};

let directory: string;
let publicDir: string;

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "prerender-build-"));
  publicDir = path.join(directory, "public");
  // Comme `pnpm build` : vite.config.ts écarte le runtime Manus en production.
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build({ configFile: path.join(root, "vite.config.ts"), logLevel: "silent", build: { outDir: publicDir, emptyOutDir: true } });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
  await prerenderRouteSeo(publicDir);
}, 240_000);

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

const readPage = (route: string) => readFile(path.join(publicDir, prerenderFileForRoute(route)), "utf8");
const preloadsOf = (html: string) => Array.from(html.matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)">/g), match => match[1]);
/** Imports statiques d'un chunk construit (Rollup y remonte aussi ceux de ses propres imports). */
const staticImportsOf = (code: string) => Array.from(code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g), match => `/static/${match[1]}`);
const textOf = (html: string) =>
  html.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

describe("pages pré-rendues du build (SEOP-01)", () => {
  it("précharge dans chaque page principale le chunk de sa page et tous ses imports, une seule fois", async () => {
    for (const [route, page] of Object.entries(MAIN_ROUTES)) {
      const html = await readPage(route);
      const preloads = preloadsOf(html);
      const entry = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/)?.[1];
      const pageChunk = preloads.find(href => new RegExp(`^/static/${page}-[\\w-]+\\.js$`).test(href));

      expect(pageChunk, route).toBeDefined();
      for (const file of staticImportsOf(await readFile(path.join(publicDir, pageChunk!), "utf8"))) {
        if (file !== entry) expect(preloads, `${route} ${file}`).toContain(file);
      }
      for (const href of [entry!, ...preloads]) {
        // Sous /static : servi par la règle de cache immuable de vercel.json, comme avant.
        expect(href, route).toMatch(/^\/static\/[\w-]+\.js$/);
        expect(existsSync(path.join(publicDir, href)), href).toBe(true);
        expect(html.split(`"${href}"`).length - 1, `${route} ${href}`).toBe(1);
      }
    }
  });

  it("ajoute à chaque page principale un <noscript> avec son titre, sa description et le lien de réservation", async () => {
    for (const route of Object.keys(MAIN_ROUTES)) {
      const html = await readPage(route);
      const noscript = html.slice(html.indexOf("<noscript>"), html.indexOf("</noscript>"));

      expect(html.indexOf("<noscript>"), route).toBeGreaterThan(html.indexOf('<div id="root"></div>'));
      expect(textOf(noscript.match(/<h1>([^<]*)<\/h1>/)?.[1] ?? ""), route).toBe(getRouteSeo(route).title);
      expect(textOf(noscript.match(/<p>([^<]*)<\/p>/)?.[1] ?? ""), route).toBe(getRouteSeo(route).description);
      expect(noscript, route).toContain('<a href="/booking"');
    }
  });

  it("ne publie pas le manifeste de Vite et donne le même résultat à une relance sans nouveau build", async () => {
    expect(existsSync(path.join(publicDir, VITE_MANIFEST_FILE))).toBe(false);
    expect(existsSync(path.join(publicDir, KEPT_VITE_MANIFEST_FILE))).toBe(true);
    const before = await Promise.all(Object.keys(MAIN_ROUTES).map(readPage));

    await prerenderRouteSeo(publicDir);

    expect(await Promise.all(Object.keys(MAIN_ROUTES).map(readPage))).toEqual(before);
  });
});

/**
 * La page pré-rendue servie comme sur Vercel (cleanUrls : /faq → faq.html). Ne tourne que si un
 * Chromium est disponible, comme client/src/publicPages.browser.test.ts (CHROMIUM=/chemin/vers/chrome).
 */
function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  let bundled: string | undefined;
  try {
    bundled = chromium.executablePath();
  } catch {
    // Pas de Chromium Playwright connu pour cette plateforme : restent ceux du système.
  }
  return [bundled, "/usr/bin/chromium", "/usr/bin/google-chrome"].find(candidate => candidate && existsSync(candidate));
}

const executablePath = findChromium();

describe.skipIf(!executablePath)("page pré-rendue dans un navigateur (SEOP-01)", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.static(publicDir, { extensions: ["html"], redirect: false }));
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
  });

  it("montre sans JavaScript le titre, la description et les liens principaux", async () => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/faq`);
      const seo = getRouteSeo("/faq");

      await expect(page.getByRole("heading", { level: 1 }).textContent()).resolves.toBe(seo.title);
      const description = page.getByRole("main").locator("p").first();
      await expect(description.textContent()).resolves.toBe(seo.description);
      expect(await description.isVisible()).toBe(true);
      const links = page.getByRole("navigation", { name: "Liens principaux" });
      expect(await links.isVisible()).toBe(true);
      await expect(links.getByRole("link", { name: "Réserver une consultation" }).getAttribute("href")).resolves.toBe("/booking");
      await expect(links.getByRole("link", { name: "Questions fréquentes" }).getAttribute("aria-current")).resolves.toBe("page");
    } finally {
      await context.close();
    }
  });

  it("avec JavaScript, n’affiche que la page React et ne télécharge qu’une fois chaque chunk préchargé", async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      const requested: string[] = [];
      page.on("request", request => requested.push(new URL(request.url()).pathname));
      await page.route("**/api/trpc/**", request => {
        const procedures = new URL(request.request().url()).pathname.replace(/^.*\/api\/trpc\//, "").split(",");
        return request.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(procedures.map(() => ({ result: { data: superjson.serialize(null) } }))) });
      });
      await page.goto(`${baseUrl}/faq`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => !document.querySelector(".app-loading-shell") && document.querySelector("main h1") !== null, undefined, { timeout: 30_000 });

      expect(await page.locator("main").count()).toBe(1);
      expect(await page.getByRole("navigation", { name: "Liens principaux" }).count()).toBe(0);
      expect(await page.getByText("Activez JavaScript dans votre navigateur").isVisible()).toBe(false);
      for (const href of preloadsOf(await readPage("/faq"))) expect(requested.filter(pathname => pathname === href), href).toHaveLength(1);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
