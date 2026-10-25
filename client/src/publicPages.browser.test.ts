import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contentFr } from "@/data/content-fr";

/**
 * Pages publiques dans un vrai navigateur : le client est servi par Vite et tRPC répond par des
 * données vides, sans serveur ni base. Ne tourne que si un Chromium est disponible :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/publicPages.browser.test.ts
 * (ou le Chromium installé par Playwright).
 */
function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  try {
    const bundled = chromium.executablePath();
    return existsSync(bundled) ? bundled : undefined;
  } catch {
    return undefined;
  }
}

const executablePath = findChromium();
const root = path.resolve(import.meta.dirname, "../..");

type Theme = "light" | "dark";

describe.skipIf(!executablePath)("pages publiques dans un navigateur", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createServer({
      configFile: path.join(root, "vite.config.ts"),
      cacheDir: path.join(root, "node_modules/.vite/public-pages-browser-test"),
      server: { host: "127.0.0.1", port: 0, hmr: false },
      logLevel: "error",
    });
    await server.listen();
    baseUrl = server.resolvedUrls!.local[0].replace(/\/$/, "");
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  async function open(route: string, { width = 1440, height = 800, theme = "dark" as Theme } = {}) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript((storedTheme) => {
      localStorage.setItem("language", "fr");
      localStorage.setItem("theme", storedTheme);
    }, theme);
    const page = await context.newPage();
    await page.route("**/api/trpc/**", (request) => {
      const procedures = new URL(request.request().url()).pathname.replace(/^.*\/api\/trpc\//, "").split(",");
      return request.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(procedures.map(() => ({ result: { data: superjson.serialize(null) } }))) });
    });
    await page.route("https://challenges.cloudflare.com/**", (request) => request.abort());
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    // Fin de l'animation d'entrée de page : l'état testé est celui que le visiteur garde ensuite.
    await page.evaluate(() => Promise.all(document.querySelector(".page-transition")?.getAnimations().map((animation) => animation.finished) ?? []));
    return page;
  }

  /** Contraste WCAG entre la couleur CSS d'un élément et le fond réellement peint derrière lui. */
  const contrastScript = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const backgroundBehind = (element: Element | null) => {
      const layers: number[][] = [];
      for (let node = element; node; node = node.parentElement) {
        const color = rgba(getComputedStyle(node).backgroundColor);
        if (color[3] > 0) layers.push(color);
        if (color[3] === 255) break;
      }
      return layers.reverse().reduce((under, color) => under.map((value, index) => color[index] * (color[3] / 255) + value * (1 - color[3] / 255)), [255, 255, 255]);
    };
    const luminance = (color: number[]) => {
      const [r, g, b] = color.slice(0, 3).map((value) => (value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: number[], b: number[]) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (light + 0.05) / (dark + 0.05);
    };
    return { rgba, backgroundBehind, ratio };
  };

  it("garde l'en-tête en haut de l'écran après un défilement de 1 500 px (PUB-01)", async () => {
    for (const width of [1440, 390]) {
      for (const route of ["/", "/faq", "/employers", "/venture/pratique-clinique"]) {
        const page = await open(route, { width });
        await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "instant" }));
        const position = await page.evaluate(() => ({ scrollY: window.scrollY, top: document.querySelector("header.site-nav")!.getBoundingClientRect().top }));
        expect(position.scrollY, `${route} à ${width} px`).toBeGreaterThan(500);
        expect(position.top, `${route} à ${width} px`).toBe(0);
        await page.context().close();
      }
    }
  }, 120_000);

  it("met la réservation en tête du menu mobile et dans l'en-tête dès 1024 px (PUB-02)", async () => {
    const mobile = await open("/faq", { width: 390, height: 844 });
    await mobile.getByRole("button", { name: "Ouvrir le menu" }).click();
    const firstEntry = mobile.locator("#mobile-navigation nav > *").first();
    expect(await firstEntry.evaluate((element) => element.outerHTML)).toMatch(/^<a [^>]*href="\/booking"/);
    expect(await firstEntry.isVisible()).toBe(true);
    expect(await firstEntry.textContent()).toBe(contentFr.hero.bookConsultation);
    expect(await mobile.locator("#mobile-navigation").getByText(contentFr.nav.getInTouch, { exact: true }).count()).toBe(0);
    await mobile.context().close();

    for (const [width, visible] of [[800, false], [1024, true], [1536, true]] as const) {
      const page = await open("/faq", { width });
      expect(await page.locator('header.site-nav a[href="/booking"]').isVisible(), `${width} px`).toBe(visible);
      await page.context().close();
    }
  }, 120_000);

  it("dessine les champs form-control avec bordure, fond et hauteur, en thème clair et sombre (A11Y-01)", async () => {
    for (const theme of ["light", "dark"] as const) {
      for (const [route, width] of [["/employers", 1366], ["/employers", 320], ["/recruitment/vvip-offshore", 1366]] as const) {
        const page = await open(route, { width, theme });
        const fields = await page.$$eval("form .form-control", (elements, script) => {
          const { rgba, backgroundBehind, ratio } = new Function(`return (${script})()`)();
          return elements.map((element) => {
            const style = getComputedStyle(element);
            const around = backgroundBehind(element.parentElement);
            const border = rgba(style.borderTopColor);
            const borderOnAround = around.map((value: number, index: number) => border[index] * (border[3] / 255) + value * (1 - border[3] / 255));
            return { width: parseFloat(style.borderTopWidth), borderContrast: ratio(borderOnAround, around), height: element.getBoundingClientRect().height };
          });
        }, String(contrastScript));
        expect(fields.length, `${route} ${theme}`).toBeGreaterThan(5);
        for (const field of fields) {
          expect(field.width, `${route} ${theme} ${width} px`).toBeGreaterThanOrEqual(1);
          expect(field.borderContrast, `${route} ${theme} ${width} px`).toBeGreaterThan(1.15);
          expect(field.height, `${route} ${theme} ${width} px`).toBeGreaterThanOrEqual(44);
        }
        await page.context().close();
      }
    }
  }, 120_000);

  it("rend libellés et saisie de la connexion candidat lisibles en thème clair (A11Y-02)", async () => {
    for (const width of [1366, 390]) {
      const page = await open("/candidate/access", { width, theme: "light" });
      await page.fill("#candidate-email", "candidat@example.com");
      await page.getByRole("button", { name: "Créer un accès", exact: true }).click();
      await page.fill("#candidate-first-name", "Camille");
      const contrasts = await page.$$eval("#candidate-access-form label, #candidate-access-form input:not([type=checkbox])", (elements, script) => {
        const { rgba, backgroundBehind, ratio } = new Function(`return (${script})()`)();
        return elements.filter((element) => element.getBoundingClientRect().width > 0).map((element) => ({ id: element.id || element.textContent, contrast: ratio(rgba(getComputedStyle(element).color), backgroundBehind(element)) }));
      }, String(contrastScript));
      expect(contrasts.length).toBeGreaterThanOrEqual(6);
      for (const { id, contrast } of contrasts) expect(contrast, `${id} à ${width} px`).toBeGreaterThanOrEqual(4.5);
      await page.context().close();
    }
  }, 120_000);
});
