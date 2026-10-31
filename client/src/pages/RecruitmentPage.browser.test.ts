import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent } from "@/components/cookieConsentState";

/**
 * Formulaires publics de candidature (standard et VVIP) dans un vrai navigateur : le nom d'un CV
 * choisi sans espace, réaliste ou très long, reste dans son cadre sur un téléphone, tronqué avec
 * son extension visible et le nom entier en info-bulle ; la page ne défile pas de côté, et le
 * bouton d'envoi et le consentement restent à l'écran. Le client est servi par Vite, sans
 * serveur. Ne tourne que si un Chromium est disponible, comme CandidatePortalPage.browser.test.ts :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/pages/RecruitmentPage.browser.test.ts
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

/** 63 characters, the name the audit replayed; then 244, near the longest a phone keeps. */
const REAL_NAME = "CV_Jean_Dupont_Anesthesiste_Reanimateur_2026_version_finale.pdf";
const LONG_NAME = `${("CV_Docteur_Jean_Longname_Anesthesie_Reanimation_" + "abcdefghijklmnopqrstuvwxyz0123456789".repeat(10)).slice(0, 240)}.pdf`;
const FORMS = [
  { route: "/recruitment/standard", input: "#recruitment-cv", submit: { fr: "Envoyer ma candidature", en: "Submit my application" }, consent: "#recruitment-gdpr-consent" },
  { route: "/recruitment/vvip-offshore", input: "#vvip-cv", submit: { fr: "Soumettre ma candidature VVIP", en: "Submit VVIP Application" }, consent: "#vvip-gdpr-consent" },
] as const;

describe.skipIf(!executablePath)("nom du CV choisi dans les formulaires de candidature, dans un navigateur", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createServer({
      configFile: path.join(root, "vite.config.ts"),
      cacheDir: path.join(root, "node_modules/.vite/recruitment-browser-test"),
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

  async function chooseCv(form: (typeof FORMS)[number], width: number, language: "fr" | "en", name: string) {
    const mobile = width < 768;
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile });
    // Choix cookies déjà fait : le bandeau ne recouvre pas le formulaire.
    await context.addInitScript(({ storedLanguage, consent }) => {
      localStorage.setItem("language", storedLanguage);
      localStorage.setItem(consent.key, consent.value);
    }, { storedLanguage: language, consent: { key: COOKIE_CONSENT_STORAGE_KEY, value: JSON.stringify(createCookieConsent(false)) } });
    const page = await context.newPage();
    await page.route((url) => !url.href.startsWith(baseUrl), (request) => request.abort());
    await page.goto(`${baseUrl}${form.route}`, { waitUntil: "networkidle" });
    await page.locator(form.input).waitFor({ state: "attached", timeout: 30_000 });
    await page.locator(form.input).setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
    const shown = page.locator(`label[for='${form.input.slice(1)}'] [title]`);
    await shown.waitFor({ timeout: 10_000 });
    return { page, shown };
  }

  /** The name Chromium gives the CV field, from its label: what a screen reader announces. */
  async function accessibleName(page: Awaited<ReturnType<typeof chooseCv>>["page"], selector: string) {
    const cdp = await page.context().newCDPSession(page);
    const { root: document } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: document.nodeId, selector });
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
    return nodes[0]?.name?.value as string | undefined;
  }

  for (const form of FORMS) {
    it(`${form.route} : le champ CV est annoncé avec le nom exact du fichier choisi, sans espace avant l’extension`, async () => {
      const { page } = await chooseCv(form, 412, "fr", REAL_NAME);
      // Read in one piece, as the file is named (the VVIP label also holds the field's title and hint).
      expect(` ${await accessibleName(page, form.input)} `).toContain(` ${REAL_NAME} `);
      await page.context().close();
    }, 60_000);

    it.each([
      [412, "fr", REAL_NAME.length, REAL_NAME],
      [412, "en", LONG_NAME.length, LONG_NAME],
      [360, "fr", LONG_NAME.length, LONG_NAME],
      [1440, "en", LONG_NAME.length, LONG_NAME],
    ] as const)(`${form.route} à %i px (%s) : un nom de %i caractères sans espace reste dans son cadre, tronqué avec son extension, sans défilement horizontal`, async (width, language, _length, name) => {
      const { page, shown } = await chooseCv(form, width, language, name);
      expect(await shown.getAttribute("title")).toBe(name);
      const submit = page.getByRole("button", { name: form.submit[language] });
      await submit.scrollIntoViewIfNeeded();
      const layout = await page.evaluate(({ input, consent }) => {
        const label = document.querySelector(`label[for='${input.slice(1)}']`)!;
        const nameBox = label.querySelector("[title]")!;
        const [baseName, extension] = Array.from(nameBox.querySelectorAll("[aria-hidden='true']"));
        const box = label.closest("div")!.getBoundingClientRect();
        const rightOf = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().right;
        return {
          pageWidth: document.documentElement.scrollWidth,
          nameRight: nameBox.getBoundingClientRect().right,
          boxRight: box.right,
          shownText: `${baseName.textContent}${extension.textContent}`,
          baseNameWidth: baseName.getBoundingClientRect().width,
          cut: baseName.scrollWidth > baseName.clientWidth,
          extensionText: extension.textContent,
          extensionRight: extension.getBoundingClientRect().right,
          extensionWidth: extension.getBoundingClientRect().width,
          consentRight: rightOf(consent),
          submitRight: rightOf("button[type='submit']"),
        };
      }, { input: form.input, consent: form.consent });
      // On a phone, a page wider than the screen also widens the window: measured against the screen's width.
      expect(layout.pageWidth).toBeLessThanOrEqual(width);
      expect(layout.nameRight).toBeLessThanOrEqual(Math.min(width, layout.boxRight));
      // The beginning of the name is shown, cut with an ellipsis, and its extension stays readable after it.
      expect(layout.shownText).toBe(name);
      expect(layout.baseNameWidth).toBeGreaterThan(100);
      expect(layout.cut).toBe(true);
      expect(layout.extensionText).toBe(".pdf");
      expect(layout.extensionWidth).toBeGreaterThan(0);
      expect(layout.extensionRight).toBeLessThanOrEqual(width);
      expect(layout.consentRight).toBeLessThanOrEqual(width);
      expect(layout.submitRight).toBeLessThanOrEqual(width);
      await page.context().close();
    }, 60_000);
  }
});
