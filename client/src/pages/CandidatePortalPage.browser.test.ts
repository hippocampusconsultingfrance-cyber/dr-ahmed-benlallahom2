import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Coffre du candidat dans un vrai navigateur : un document au nom de fichier très long ne fait
 * pas défiler la page de côté sur un téléphone, son nom est tronqué dans sa carte. Le client est
 * servi par Vite et chaque procédure tRPC du portail répond par des données fictives. Ne tourne
 * que si un Chromium est disponible, comme BookingPage.browser.test.ts :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/pages/CandidatePortalPage.browser.test.ts
 */
function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  let bundled: string | undefined;
  try {
    bundled = chromium.executablePath();
  } catch {
    // Pas de Chromium Playwright connu pour cette plateforme : restent ceux du système.
  }
  return [bundled, "/usr/bin/chromium", "/usr/bin/google-chrome"].find((candidate) => candidate && existsSync(candidate));
}

const executablePath = findChromium();
const root = path.resolve(import.meta.dirname, "../../..");

const LONG_NAME = "attestation-de-travail-chu-de-lyon-service-anesthesie-reanimation-2015-2024-signee-et-tamponnee.pdf";
/** An « Autre document » label of the 160 characters the form allows, without a space. */
const LONG_OTHER_LABEL = "Attestation_de_reussite_au_concours_de_praticien_attache_associe_session_2024_CHU_de_Lyon_service_anesthesie_reanimation_et_medecine_perioperatoire_signee".padEnd(160, "x");
type Procedure = () => unknown;
const procedures: Record<string, Procedure> = {
  "candidatePortal.me": () => ({ id: 7, email: "vera@test.local", firstName: "Vera", lastName: "Exemple", emailVerifiedAt: new Date(Date.UTC(2026, 8, 1)), linkedApplicationId: null, documentConsentAt: new Date(Date.UTC(2026, 8, 1)) }),
  "candidatePortal.documents": () => [
    { id: 1, category: "employment_evidence", categoryOtherLabel: null, originalName: LONG_NAME, mimeType: "application/pdf", sizeBytes: 1_200, status: "uploaded", reviewedAt: null, createdAt: new Date(Date.UTC(2026, 9, 1)) },
    { id: 2, category: "diploma", categoryOtherLabel: null, originalName: "diplome.pdf", mimeType: "application/pdf", sizeBytes: 80_000, status: "reviewed", reviewedAt: new Date(Date.UTC(2026, 9, 2)), createdAt: new Date(Date.UTC(2026, 9, 1)) },
    { id: 3, category: "other", categoryOtherLabel: LONG_OTHER_LABEL, originalName: "attestation.pdf", mimeType: "application/pdf", sizeBytes: 9_000, status: "uploaded", reviewedAt: null, createdAt: new Date(Date.UTC(2026, 9, 3)) },
  ],
  "candidatePortal.sessions": () => [],
};

describe.skipIf(!executablePath)("coffre du candidat dans un navigateur", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createServer({
      configFile: path.join(root, "vite.config.ts"),
      cacheDir: path.join(root, "node_modules/.vite/candidate-portal-browser-test"),
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

  async function openPortal(width: number, language: string) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
    await context.addInitScript((storedLanguage) => localStorage.setItem("language", storedLanguage), language);
    const page = await context.newPage();
    await page.route((url) => !url.href.startsWith(baseUrl), (request) => request.abort());
    await page.route("**/api/trpc/**", (request) => {
      const names = new URL(request.request().url()).pathname.replace(/^.*\/api\/trpc\//, "").split(",");
      const body = names.map((name) => ({ result: { data: superjson.serialize(procedures[name]?.() ?? null) } }));
      return request.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(`${baseUrl}/candidate/portal`, { waitUntil: "networkidle" });
    await page.getByText(LONG_NAME, { exact: false }).waitFor({ timeout: 30_000 });
    return page;
  }

  it.each([
    [412, "fr"],
    [360, "en"],
    [1440, "fr"],
  ])("à %i px (%s), un nom de fichier long reste dans sa carte, tronqué, sans défilement horizontal", async (width, language) => {
    const page = await openPortal(width, language);
    const layout = await page.evaluate((name) => {
      const line = Array.from(document.querySelectorAll("p")).find((paragraph) => paragraph.textContent?.startsWith(name))!;
      return {
        pageWidth: document.documentElement.scrollWidth,
        lineRight: line.getBoundingClientRect().right,
        cardRight: line.closest("[data-slot='card']")?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        truncated: line.scrollWidth > line.clientWidth,
      };
    }, LONG_NAME);
    // On a phone, a page wider than the screen also widens the window (innerWidth): measured against the screen's width.
    expect(layout.pageWidth).toBeLessThanOrEqual(width);
    expect(layout.lineRight).toBeLessThanOrEqual(Math.min(width, layout.cardRight));
    expect(layout.truncated).toBe(true);
    await page.context().close();
  }, 60_000);

  it.each([
    [412, "fr"],
    [360, "en"],
    [1440, "fr"],
  ])("à %i px (%s), un libellé « Autre document » de 160 caractères sans espace passe à la ligne dans sa carte, sans défilement horizontal", async (width, language) => {
    const page = await openPortal(width, language);
    const layout = await page.evaluate((label) => {
      const line = Array.from(document.querySelectorAll("p")).find((paragraph) => paragraph.textContent?.endsWith(label))!;
      return {
        pageWidth: document.documentElement.scrollWidth,
        lineRight: line.getBoundingClientRect().right,
        cardRight: line.closest("[data-slot='card']")?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        wrapped: line.getBoundingClientRect().height > parseFloat(getComputedStyle(line).lineHeight) * 1.5,
        cut: line.scrollWidth > line.clientWidth,
      };
    }, LONG_OTHER_LABEL);
    expect(layout.pageWidth).toBeLessThanOrEqual(width);
    expect(layout.lineRight).toBeLessThanOrEqual(Math.min(width, layout.cardRight));
    // Read in full: on several lines, not cut.
    expect(layout.cut).toBe(false);
    if (width < 768) expect(layout.wrapped).toBe(true);
    await page.context().close();
  }, 60_000);
});
