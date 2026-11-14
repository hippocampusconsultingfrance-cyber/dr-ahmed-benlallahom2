import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Locator } from "playwright-core";
import { PNG } from "pngjs";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  createCookieConsent,
} from "@/components/cookieConsentState";

/**
 * Formulaires publics de candidature (standard et VVIP) dans un vrai navigateur : le nom d'un CV
 * choisi sans espace, réaliste ou très long, reste dans son cadre sur un téléphone, tronqué avec
 * son extension visible et le nom entier en info-bulle ; la page ne défile pas de côté, et le
 * bouton d'envoi et le consentement restent à l'écran. Le formulaire standard passe avant sa
 * présentation sur un téléphone et garde un brouillon dans l'onglet (REC-22), sa liste des pays du
 * diplôme se parcourt au clavier (A11Y-11), et ses défauts visuels restent corrigés (PUB-17,
 * PUB-18, A11Y-08). Le client est servi par Vite, sans serveur : l'envoi est simulé.
 * Ne tourne que si un Chromium est disponible, comme CandidatePortalPage.browser.test.ts :
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
  return [bundled, "/usr/bin/chromium", "/usr/bin/google-chrome"].find(
    candidate => candidate && existsSync(candidate)
  );
}

const executablePath = findChromium();
const root = path.resolve(import.meta.dirname, "../../..");

/** 63 characters, the name the audit replayed; then 244, near the longest a phone keeps. */
const REAL_NAME =
  "CV_Jean_Dupont_Anesthesiste_Reanimateur_2026_version_finale.pdf";
const LONG_NAME = `${("CV_Docteur_Jean_Longname_Anesthesie_Reanimation_" + "abcdefghijklmnopqrstuvwxyz0123456789".repeat(10)).slice(0, 240)}.pdf`;
const FORMS = [
  {
    route: "/recruitment/standard",
    input: "#recruitment-cv",
    submit: { fr: "Envoyer ma candidature", en: "Submit my application" },
    consent: "#recruitment-gdpr-consent",
  },
  {
    route: "/recruitment/vvip-offshore",
    input: "#vvip-cv",
    submit: {
      fr: "Soumettre ma candidature VVIP",
      en: "Submit VVIP Application",
    },
    consent: "#vvip-gdpr-consent",
  },
] as const;

/**
 * Turnstile simulé, comme dans publicPages.browser.test.ts : le client est servi avec une clé de site de
 * test et le script de Cloudflare est remplacé par un faux qui donne aussitôt un jeton.
 */
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
const FAKE_TURNSTILE_SCRIPT = `window.turnstile = { render: (element, options) => { setTimeout(() => options.callback("test-token")); return "fake-widget"; }, remove: () => {}, reset: () => {} };`;
const DRAFT_KEY = "recruitment:draft:v1";

describe.skipIf(!executablePath)(
  "nom du CV choisi dans les formulaires de candidature, dans un navigateur",
  () => {
    let server: ViteDevServer;
    let browser: Browser;
    let baseUrl: string;
    const previousTurnstileSiteKey = process.env.VITE_TURNSTILE_SITE_KEY;

    beforeAll(async () => {
      process.env.VITE_TURNSTILE_SITE_KEY = TURNSTILE_TEST_SITE_KEY;
      server = await createServer({
        configFile: path.join(root, "vite.config.ts"),
        cacheDir: path.join(
          root,
          "node_modules/.vite/recruitment-browser-test"
        ),
        server: { host: "127.0.0.1", port: 0, hmr: false },
        logLevel: "error",
      });
      await server.listen();
      baseUrl = server.resolvedUrls!.local[0].replace(/\/$/, "");
      browser = await chromium.launch({
        executablePath,
        args: ["--no-sandbox"],
      });
    }, 60_000);

    afterAll(async () => {
      await browser?.close();
      await server?.close();
      if (previousTurnstileSiteKey === undefined)
        delete process.env.VITE_TURNSTILE_SITE_KEY;
      else process.env.VITE_TURNSTILE_SITE_KEY = previousTurnstileSiteKey;
    });

    /** The standard form in the dark theme, cookie choice made, the anti-bot check passed at once; nothing leaves the test server. */
    async function openStandard(
      width: number,
      {
        language = "fr" as "fr" | "en" | "de",
        route = "/recruitment/standard",
        forcedColors = "none" as "none" | "active",
      } = {}
    ) {
      const mobile = width < 768;
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
        forcedColors,
      });
      await context.addInitScript(
        ({ storedLanguage, consent }) => {
          localStorage.setItem("language", storedLanguage);
          localStorage.setItem("theme", "dark");
          localStorage.setItem(consent.key, consent.value);
        },
        {
          storedLanguage: language,
          consent: {
            key: COOKIE_CONSENT_STORAGE_KEY,
            value: JSON.stringify(createCookieConsent(false)),
          },
        }
      );
      const page = await context.newPage();
      await page.route(
        url => !url.href.startsWith(baseUrl),
        request => request.abort()
      );
      await page.route("https://challenges.cloudflare.com/**", request =>
        request.fulfill({
          status: 200,
          contentType: "text/javascript",
          body: FAKE_TURNSTILE_SCRIPT,
        })
      );
      await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
      await page.locator("main h1").waitFor({ timeout: 30_000 });
      return page;
    }

    async function chooseCv(
      form: (typeof FORMS)[number],
      width: number,
      language: "fr" | "en",
      name: string
    ) {
      const mobile = width < 768;
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      // Choix cookies déjà fait : le bandeau ne recouvre pas le formulaire.
      await context.addInitScript(
        ({ storedLanguage, consent }) => {
          localStorage.setItem("language", storedLanguage);
          localStorage.setItem(consent.key, consent.value);
        },
        {
          storedLanguage: language,
          consent: {
            key: COOKIE_CONSENT_STORAGE_KEY,
            value: JSON.stringify(createCookieConsent(false)),
          },
        }
      );
      const page = await context.newPage();
      await page.route(
        url => !url.href.startsWith(baseUrl),
        request => request.abort()
      );
      await page.goto(`${baseUrl}${form.route}`, { waitUntil: "networkidle" });
      await page
        .locator(form.input)
        .waitFor({ state: "attached", timeout: 30_000 });
      await page.locator(form.input).setInputFiles({
        name,
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
      });
      const shown = page.locator(`label[for='${form.input.slice(1)}'] [title]`);
      await shown.waitFor({ timeout: 10_000 });
      return { page, shown };
    }

    /**
     * Blank, in CSS pixels, between the last painted pixel of an element and its right edge: for the
     * cut base name, the room left after its ellipsis, before the extension. Read from the pixels,
     * since the ellipsis is in no DOM box.
     */
    async function blankAfterInk(element: Locator) {
      const image = PNG.sync.read(await element.screenshot());
      const scale = image.width / (await element.boundingBox())!.width;
      const colour = (x: number, y: number) =>
        image.data.readUInt32BE((y * image.width + x) * 4);
      // The background is the most frequent colour; ink is any pixel clearly away from it.
      const counts = new Map<number, number>();
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++)
          counts.set(colour(x, y), (counts.get(colour(x, y)) ?? 0) + 1);
      const background = [...counts].sort((a, b) => b[1] - a[1])[0][0];
      const distance = (x: number, y: number) =>
        [24, 16, 8].reduce(
          (sum, shift) =>
            sum +
            Math.abs(
              ((colour(x, y) >>> shift) & 255) - ((background >>> shift) & 255)
            ),
          0
        );
      for (let x = image.width - 1; x >= 0; x--) {
        for (let y = 0; y < image.height; y++)
          if (distance(x, y) > 96) return (image.width - 1 - x) / scale;
      }
      return image.width / scale;
    }

    /** The name Chromium gives the CV field, from its label: what a screen reader announces. */
    async function accessibleName(
      page: Awaited<ReturnType<typeof chooseCv>>["page"],
      selector: string
    ) {
      const cdp = await page.context().newCDPSession(page);
      const { root: document } = await cdp.send("DOM.getDocument", {
        depth: 0,
      });
      const { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: document.nodeId,
        selector,
      });
      const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
        nodeId,
        fetchRelatives: false,
      });
      return nodes[0]?.name?.value as string | undefined;
    }

    for (const form of FORMS) {
      it(`${form.route} : le champ CV est annoncé avec le nom exact du fichier choisi, sans espace avant l’extension`, async () => {
        const { page } = await chooseCv(form, 412, "fr", REAL_NAME);
        // Read in one piece, as the file is named (the VVIP label also holds the field's title and hint).
        expect(` ${await accessibleName(page, form.input)} `).toContain(
          ` ${REAL_NAME} `
        );
        await page.context().close();
      }, 60_000);

      it.each([
        [360, "fr"],
        [375, "en"],
        [390, "fr"],
        [412, "en"],
      ] as const)(
        `${form.route} à %i px (%s) : le nom coupé finit par ses points de suspension juste avant l’extension, sans blanc lu comme une espace`,
        async (width, language) => {
          const { page, shown } = await chooseCv(
            form,
            width,
            language,
            LONG_NAME
          );
          const baseName = shown.locator("[aria-hidden='true']").first();
          expect(
            await baseName.evaluate(
              element => element.scrollWidth > element.clientWidth
            )
          ).toBe(true);
          // Between two letters there are 1 to 3 pixels; the browser alone left up to a letter (about 10).
          expect(await blankAfterInk(baseName)).toBeLessThanOrEqual(4);
          // The extension starts where the base name's box ends.
          const [baseRight, extensionLeft] = await shown.evaluate(label =>
            Array.from(label.querySelectorAll("[aria-hidden='true']")).map(
              (part, index) =>
                part.getBoundingClientRect()[index ? "left" : "right"]
            )
          );
          expect(Math.abs(extensionLeft - baseRight)).toBeLessThan(0.5);
          await page.context().close();
        },
        60_000
      );

      it(`${form.route} : un nom sans extension choisi après un nom coupé prend toute la largeur de son cadre`, async () => {
        const { page, shown } = await chooseCv(form, 360, "fr", LONG_NAME);
        // A file the form refuses, but whose name is shown all the same.
        const withoutExtension = LONG_NAME.slice(0, -".pdf".length);
        await page.locator(form.input).setInputFiles({
          name: withoutExtension,
          mimeType: "application/octet-stream",
          buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
        });
        await expect
          .poll(() => shown.getAttribute("title"))
          .toBe(withoutExtension);
        const { baseWidth, labelWidth, cut } = await shown.evaluate(label => {
          const baseName = label.querySelector("[aria-hidden='true']")!;
          return {
            baseWidth: baseName.getBoundingClientRect().width,
            labelWidth: label.getBoundingClientRect().width,
            cut: baseName.scrollWidth > baseName.clientWidth,
          };
        });
        expect(cut).toBe(true);
        // Not the narrower box fitted to the previous name's ellipsis.
        expect(Math.abs(labelWidth - baseWidth)).toBeLessThan(0.5);
        await page.context().close();
      }, 60_000);

      it.each([
        [412, "fr", REAL_NAME.length, REAL_NAME],
        [412, "en", LONG_NAME.length, LONG_NAME],
        [360, "fr", LONG_NAME.length, LONG_NAME],
        [1440, "en", LONG_NAME.length, LONG_NAME],
      ] as const)(
        `${form.route} à %i px (%s) : un nom de %i caractères sans espace reste dans son cadre, tronqué avec son extension, sans défilement horizontal`,
        async (width, language, _length, name) => {
          const { page, shown } = await chooseCv(form, width, language, name);
          expect(await shown.getAttribute("title")).toBe(name);
          const submit = page.getByRole("button", {
            name: form.submit[language],
          });
          await submit.scrollIntoViewIfNeeded();
          const layout = await page.evaluate(
            ({ input, consent }) => {
              const label = document.querySelector(
                `label[for='${input.slice(1)}']`
              )!;
              const nameBox = label.querySelector("[title]")!;
              const [baseName, extension] = Array.from(
                nameBox.querySelectorAll("[aria-hidden='true']")
              );
              const box = label.closest("div")!.getBoundingClientRect();
              const rightOf = (selector: string) =>
                document.querySelector(selector)!.getBoundingClientRect().right;
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
            },
            { input: form.input, consent: form.consent }
          );
          // On a phone, a page wider than the screen also widens the window: measured against the screen's width.
          expect(layout.pageWidth).toBeLessThanOrEqual(width);
          expect(layout.nameRight).toBeLessThanOrEqual(
            Math.min(width, layout.boxRight)
          );
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
        },
        60_000
      );
    }

    it("met le formulaire avant la présentation sur un téléphone, l’avertissement avant les champs, pays et langues sur deux colonnes dès 360 px (REC-22)", async () => {
      for (const [width, language, columns] of [
        [320, "de", 1],
        [360, "de", 2],
        [375, "fr", 2],
        [1440, "fr", 2],
      ] as const) {
        const where = `${width} px (${language})`;
        const page = await openStandard(width, { language });
        const layout = await page.evaluate(() => {
          const top = (element: Element | null) =>
            element!.getBoundingClientRect().top + window.scrollY;
          const form = document.querySelector("main form")!;
          const card = form.closest(".editorial-card")!;
          const heading = card.querySelector("h2")!;
          const warning = [...card.querySelectorAll("p")].find(paragraph =>
            /patient|Patientendaten/.test(paragraph.textContent ?? "")
          );
          const grids = [...form.querySelectorAll("fieldset .grid")];
          return {
            formTitleTop: top(heading),
            titleTop: top(document.querySelector("main h1")),
            cardLeft: card.getBoundingClientRect().left,
            titleLeft: document
              .querySelector("main h1")!
              .getBoundingClientRect().left,
            warningBottom: warning
              ? warning.getBoundingClientRect().bottom + window.scrollY
              : null,
            firstFieldTop: top(
              document.getElementById("recruitment-firstName")
            ),
            columns: grids.map(
              grid =>
                getComputedStyle(grid).gridTemplateColumns.split(" ").length
            ),
            // A country or language name may wrap at a space or a hyphen (« Saudi-/Arabien »), never inside a word.
            splitWords: [...form.querySelectorAll("fieldset label")].flatMap(
              label => {
                const split: string[] = [];
                const walker = document.createTreeWalker(
                  label,
                  NodeFilter.SHOW_TEXT
                );
                for (
                  let node = walker.nextNode();
                  node;
                  node = walker.nextNode()
                ) {
                  for (const word of node.textContent!.matchAll(/[^\s-]+/g)) {
                    const range = document.createRange();
                    range.setStart(node, word.index);
                    range.setEnd(node, word.index + word[0].length);
                    if (
                      new Set(
                        [...range.getClientRects()]
                          .filter(rect => rect.width > 0)
                          .map(rect => Math.round(rect.top))
                      ).size > 1
                    )
                      split.push(word[0]);
                  }
                }
                return split;
              }
            ),
            pageWidth: document.documentElement.scrollWidth,
          };
        });
        if (width < 1024) {
          // The form opens the page; the presentation (title, introduction, assurances) follows it.
          expect(layout.formTitleTop, where).toBeLessThan(layout.titleTop);
          expect(layout.firstFieldTop, where).toBeLessThan(900);
        } else {
          // Two columns as before: the presentation on the left, the form on the right.
          expect(layout.titleLeft, where).toBeLessThan(layout.cardLeft);
        }
        expect(layout.warningBottom, where).not.toBeNull();
        expect(layout.warningBottom!, where).toBeLessThanOrEqual(
          layout.firstFieldTop
        );
        expect(layout.columns, where).toEqual([columns, columns]);
        expect(layout.splitWords, where).toEqual([]);
        expect(layout.pageWidth, where).toBeLessThanOrEqual(width);
        await page.context().close();
      }
    }, 120_000);

    it("garde dans l’onglet un brouillon sans CV ni consentement, le rend au rechargement et l’efface après un envoi accepté (REC-22)", async () => {
      const page = await openStandard(412);
      const draft = async () =>
        JSON.parse(
          (await page.evaluate(
            key => sessionStorage.getItem(key),
            DRAFT_KEY
          )) ?? "null"
        );
      await page.fill("#recruitment-firstName", "Amina");
      await page.fill("#recruitment-lastName", "Haddad");
      await page.fill("#recruitment-email", "amina@example.org");
      await page.selectOption(
        "#recruitment-specialty",
        "Anesthésie-réanimation"
      );
      await page.fill("#recruitment-diploma-country-search", "Tunisie");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.check("#recruitment-target-country-7");
      await page.getByLabel("Arabe", { exact: true }).check();
      await page.fill("#recruitment-message", "Mobilité au Canada en 2027.");
      await page.check("#recruitment-gdpr-consent");
      await page.getByLabel(/J’accepte de recevoir occasionnellement/).check();
      await page.setInputFiles("#recruitment-cv", {
        name: "cv.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7\n%%EOF\n"),
      });

      const stored = await draft();
      expect(stored).toMatchObject({
        firstName: "Amina",
        lastName: "Haddad",
        email: "amina@example.org",
        specialty: "Anesthésie-réanimation",
        diplomaCountry: "TN",
        targetCountries: ["Canada"],
        languages: ["Arabic"],
        message: "Mobilité au Canada en 2027.",
      });
      // Neither the CV nor a consent nor the honeypot is kept.
      expect(
        Object.keys(stored).filter(key => /cv|consent|website|file/i.test(key))
      ).toEqual([]);

      await page.reload({ waitUntil: "networkidle" });
      await page.locator("#recruitment-firstName").waitFor();
      expect(await page.inputValue("#recruitment-firstName")).toBe("Amina");
      expect(await page.inputValue("#recruitment-email")).toBe(
        "amina@example.org"
      );
      expect(await page.inputValue("#recruitment-specialty")).toBe(
        "Anesthésie-réanimation"
      );
      // The draft keeps the code (EN-11); the field shows the country's name.
      expect(await page.inputValue("#recruitment-diploma-country-search")).toBe(
        "Tunisie"
      );
      expect(await page.inputValue("#recruitment-message")).toBe(
        "Mobilité au Canada en 2027."
      );
      expect(await page.isChecked("#recruitment-target-country-7")).toBe(true);
      expect(await page.getByLabel("Arabe", { exact: true }).isChecked()).toBe(
        true
      );
      // Consents are given again, and the CV is chosen again.
      expect(await page.isChecked("#recruitment-gdpr-consent")).toBe(false);
      expect(
        await page
          .getByLabel(/J’accepte de recevoir occasionnellement/)
          .isChecked()
      ).toBe(false);
      expect(
        await page
          .locator("#recruitment-cv")
          .evaluate(input => (input as HTMLInputElement).files?.length ?? 0)
      ).toBe(0);

      // A draft kept before EN-11 holds the country's name, here in English: it comes back as its code.
      await page.evaluate(
        key =>
          sessionStorage.setItem(
            key,
            JSON.stringify({
              ...JSON.parse(sessionStorage.getItem(key) ?? "{}"),
              diplomaCountry: "Tunisia",
            })
          ),
        DRAFT_KEY
      );
      await page.reload({ waitUntil: "networkidle" });
      await page.locator("#recruitment-firstName").waitFor();
      expect(await page.inputValue("#recruitment-diploma-country-search")).toBe(
        "Tunisie"
      );
      expect(await draft()).toMatchObject({ diplomaCountry: "TN" });

      // A refused send keeps the draft; an accepted one clears it.
      let accept = false;
      const sent: string[] = [];
      await page.route("**/api/recruitment/apply", request => {
        sent.push(request.request().method());
        return accept
          ? request.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ trackingId: "CV-2026-DRAFT1" }),
            })
          : request.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "unavailable" }),
            });
      });
      await page.check("#recruitment-gdpr-consent");
      await page.setInputFiles("#recruitment-cv", {
        name: "cv.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7\n%%EOF\n"),
      });
      const submit = page.locator("main form button[type=submit]");
      await expect
        .poll(() => submit.isEnabled(), { timeout: 10_000 })
        .toBe(true);
      await submit.click();
      await page.locator("main form [role=alert]").waitFor();
      expect(sent).toEqual(["POST"]);
      expect(await draft()).toMatchObject({ firstName: "Amina" });

      accept = true;
      await expect
        .poll(() => submit.isEnabled(), { timeout: 10_000 })
        .toBe(true);
      await submit.click();
      await page.getByText("CV-2026-DRAFT1").waitFor();
      expect(await draft()).toBeNull();
      await page.reload({ waitUntil: "networkidle" });
      await page.locator("#recruitment-firstName").waitFor();
      expect(await page.inputValue("#recruitment-firstName")).toBe("");
      await page.context().close();
    }, 120_000);

    it("parcourt la liste des pays du diplôme aux flèches, sans la mettre dans l’ordre de tabulation, et la ferme quand le focus la quitte (A11Y-11)", async () => {
      const page = await openStandard(1366, { language: "en" });
      const input = page.locator("#recruitment-diploma-country-search");
      const read = () =>
        page.evaluate(() => {
          const field = document.getElementById(
            "recruitment-diploma-country-search"
          )!;
          const active = field.getAttribute("aria-activedescendant");
          const options = [
            ...document.querySelectorAll(
              "#recruitment-diploma-country-options [role=option]"
            ),
          ];
          return {
            // A field that says it is open points at a list that exists.
            controlsMissing:
              field.getAttribute("aria-expanded") === "true" &&
              !document.getElementById(
                field.getAttribute("aria-controls") ?? ""
              ),
            expanded: field.getAttribute("aria-expanded"),
            active: active
              ? (document.getElementById(active)?.firstElementChild
                  ?.textContent ?? `missing ${active}`)
              : null,
            selected: options
              .filter(option => option.getAttribute("aria-selected") === "true")
              .map(option => option.firstElementChild?.textContent),
            options: options.map(
              option => option.firstElementChild?.textContent
            ),
            tabbable: options.filter(
              option => (option as HTMLElement).tabIndex >= 0
            ).length,
            value: (field as HTMLInputElement).value,
            focused:
              document.activeElement?.id ||
              document.activeElement?.getAttribute("aria-label") ||
              document.activeElement?.tagName,
          };
        });
      const state = async () => {
        const current = await read();
        expect(current.controlsMissing, "aria-expanded=true sans liste").toBe(
          false
        );
        return current;
      };

      await input.focus();
      expect(await state()).toMatchObject({
        expanded: "true",
        active: null,
        selected: [],
        tabbable: 0,
      });
      await input.fill("al");
      const { options } = await state();
      expect(options.length).toBeGreaterThan(2);
      await page.keyboard.press("ArrowDown");
      expect(await state()).toMatchObject({
        active: options[0],
        selected: [options[0]],
        focused: "recruitment-diploma-country-search",
      });
      await page.keyboard.press("ArrowDown");
      expect(await state()).toMatchObject({
        active: options[1],
        selected: [options[1]],
      });
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      expect(await state()).toMatchObject({
        active: options.at(-1),
        selected: [options.at(-1)],
      });

      await page.keyboard.press("Escape");
      expect(await state()).toMatchObject({
        expanded: "false",
        active: null,
        value: "al",
        focused: "recruitment-diploma-country-search",
      });
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      // Enter picks the option and does not send the form.
      expect(await state()).toMatchObject({
        expanded: "false",
        value: options[1],
        focused: "recruitment-diploma-country-search",
      });
      expect(
        await page
          .getByText(`Country where the diploma was obtained : ${options[1]}`)
          .isVisible()
      ).toBe(true);
      expect(await page.locator("main form [role=alert]").count()).toBe(0);

      // The country chosen, Escape leaves the field as it is: Chromium no longer empties the search
      // field while the country stays in the note and the form.
      await page.keyboard.press("Escape");
      expect(await state()).toMatchObject({
        expanded: "false",
        value: options[1],
        focused: "recruitment-diploma-country-search",
      });
      expect(
        await page
          .getByText(`Country where the diploma was obtained : ${options[1]}`)
          .isVisible()
      ).toBe(true);

      // From the field, Tab reaches its clear button, then leaves it for the target countries: the list closes.
      await input.fill("Alb");
      await page.keyboard.press("Tab");
      expect(await state()).toMatchObject({
        expanded: "true",
        focused: "Clear the country search",
      });
      await page.keyboard.press("Tab");
      expect(await state()).toMatchObject({
        expanded: "false",
        focused: "recruitment-target-country-0",
      });
      // The whole list, which scrolls, is not a Tab stop of its own either, with or without a search.
      for (const search of ["", "a"]) {
        await input.fill(search);
        expect(
          await page
            .locator("#recruitment-diploma-country-options")
            .evaluate(list => list.scrollHeight > list.clientHeight),
          `« ${search} »`
        ).toBe(true);
        await page.keyboard.press("Tab");
        if (search) await page.keyboard.press("Tab");
        expect(await state(), `« ${search} »`).toMatchObject({
          expanded: "false",
          focused: "recruitment-target-country-0",
        });
      }

      // The clear button gives the focus back to the field; a click on an option leaves it there.
      await page
        .getByRole("button", { name: "Clear the country search" })
        .click();
      expect(await state()).toMatchObject({
        expanded: "true",
        value: "",
        focused: "recruitment-diploma-country-search",
      });
      await input.fill("Tunis");
      await page.getByRole("option", { name: /Tunisia/ }).click();
      expect(await state()).toMatchObject({
        expanded: "false",
        value: "Tunisia",
        focused: "recruitment-diploma-country-search",
      });

      // No match: the field no longer says it is open, and the message lands in a live region that
      // was already there, so that screen readers announce it.
      const status = page.locator(
        "div:has(> #recruitment-diploma-country-label) > [role=status]"
      );
      expect(await status.textContent()).toBe("");
      await status.evaluate(region =>
        region.setAttribute("data-probe", "before")
      );
      await input.fill("zzz");
      expect(await state()).toMatchObject({
        expanded: "false",
        options: [],
        active: null,
      });
      expect(await status.getAttribute("data-probe")).toBe("before");
      expect(await status.textContent()).toBe(
        "No country matches your search."
      );
      expect(await status.isVisible()).toBe(true);
      await input.fill("Tun");
      expect(await state()).toMatchObject({ expanded: "true" });
      expect(await status.textContent()).toBe("");
      await page.context().close();
    }, 60_000);

    it("ne garde aucun pays du diplôme une fois le champ vidé, par son bouton d’effacement ou au clavier, et relie au champ la note du pays retenu (A11Y-11)", async () => {
      const page = await openStandard(1280);
      const input = page.locator("#recruitment-diploma-country-search");
      const read = () =>
        page.evaluate(key => {
          const field = document.getElementById(
            "recruitment-diploma-country-search"
          ) as HTMLInputElement;
          const describedBy = field.getAttribute("aria-describedby");
          return {
            value: field.value,
            description: describedBy
              ? (document.getElementById(describedBy)?.textContent ??
                `missing ${describedBy}`)
              : null,
            note:
              [...document.querySelectorAll("p")]
                .map(paragraph => paragraph.textContent ?? "")
                .find(text =>
                  text.startsWith("Pays d’obtention du diplôme :")
                ) ?? null,
            // The country of the draft, as its code (EN-11), "" when it has none or no draft is left.
            draft:
              (
                JSON.parse(sessionStorage.getItem(key) ?? "{}") as {
                  diplomaCountry?: string;
                }
              ).diplomaCountry ?? "",
            invalid: field.getAttribute("aria-invalid"),
          };
        }, DRAFT_KEY);
      const choose = async () => {
        await input.focus();
        await page.keyboard.type("Maroc");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        expect(await read()).toMatchObject({
          value: "Maroc",
          description: "Pays d’obtention du diplôme : Maroc",
          note: "Pays d’obtention du diplôme : Maroc",
          draft: "MA",
        });
      };

      // The clear button, reached by Tab and pressed with Enter as in the audit: the country goes with the search.
      await choose();
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() =>
          document.activeElement?.getAttribute("aria-label")
        )
      ).toBe("Effacer la recherche de pays");
      await page.keyboard.press("Enter");
      expect(await read()).toMatchObject({
        value: "",
        description: null,
        note: null,
        draft: "",
      });
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      expect(await read()).toMatchObject({ value: "", note: null, draft: "" });

      // Emptied from the keyboard, the field keeps no country either.
      await choose();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.press("Backspace");
      expect(await read()).toMatchObject({
        value: "",
        description: null,
        note: null,
        draft: "",
      });

      // A search typed over the country chosen leaves it chosen, and the field announces it.
      await choose();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("Tun");
      expect(await read()).toMatchObject({
        value: "Tun",
        description: "Pays d’obtention du diplôme : Maroc",
        draft: "MA",
      });

      // Cleared, the empty required field is the one to correct, and no application leaves.
      await page
        .getByRole("button", { name: "Effacer la recherche de pays" })
        .click();
      const sent: string[] = [];
      await page.route("**/api/recruitment/apply", request => {
        sent.push(request.request().method());
        return request.abort();
      });
      const submit = page.locator("main form button[type=submit]");
      await expect
        .poll(() => submit.isEnabled(), { timeout: 10_000 })
        .toBe(true);
      await submit.click();
      await page.locator("main form [role=alert]").waitFor();
      expect(await read()).toMatchObject({
        value: "",
        note: null,
        invalid: "true",
      });
      expect(
        await page.locator("main form [role=alert]").textContent()
      ).toContain("Pays d’obtention du diplôme");
      expect(sent).toEqual([]);
      await page.context().close();
    }, 60_000);

    it("désigne l’option active de la liste des pays par un contour en couleurs forcées (A11Y-11)", async () => {
      const page = await openStandard(1366, {
        language: "en",
        forcedColors: "active",
      });
      await page.locator("#recruitment-diploma-country-search").fill("al");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      // Forced colors drop the background that marks it otherwise; the focus stays in the field.
      const outlines = await page
        .locator("#recruitment-diploma-country-options [role=option]")
        .evaluateAll(options =>
          options.map(option => {
            const style = getComputedStyle(option);
            return {
              active: option.getAttribute("aria-selected") === "true",
              style: style.outlineStyle,
              width: parseFloat(style.outlineWidth),
              color: style.outlineColor,
            };
          })
        );
      const [active, ...others] = [
        outlines[1],
        ...outlines.filter((_, index) => index !== 1),
      ];
      expect(active).toMatchObject({ active: true, style: "solid" });
      expect(active.width).toBeGreaterThanOrEqual(2);
      expect(active.color).not.toBe("rgba(0, 0, 0, 0)");
      expect(others.length).toBeGreaterThan(0);
      expect(
        others.filter(option => option.active || option.style !== "none")
      ).toEqual([]);
      await page.context().close();
    }, 60_000);

    it("ne rogne plus le sur-titre, aligne « Années d’expérience » sur la spécialité et garde les visuels derrière le texte discrets (PUB-17, PUB-18)", async () => {
      for (const width of [1440, 375]) {
        const page = await openStandard(width);
        const layout = await page.evaluate(() => {
          const kicker = document.querySelector(".section-kicker")!;
          const block = kicker.parentElement!;
          const style = getComputedStyle(block);
          return {
            // Rounded corners on a block that hides its overflow cut the first letter of the kicker.
            clipsCorners:
              style.overflow !== "visible" &&
              parseFloat(style.borderTopLeftRadius) > 0,
            experienceTop: document
              .getElementById("recruitment-experience")!
              .getBoundingClientRect().top,
            experienceLabelBottom: document
              .getElementById("recruitment-experience")!
              .previousElementSibling!.getBoundingClientRect().bottom,
            specialtySearchTop: document
              .querySelector("input[aria-label='Rechercher une spécialité…']")!
              .getBoundingClientRect().top,
            globeOpacity: Number(
              getComputedStyle(document.querySelector(".hero-globe")!).opacity
            ),
          };
        });
        expect(layout.clipsCorners, `${width} px`).toBe(false);
        // The field follows its label, as the other fields do.
        expect(
          layout.experienceTop - layout.experienceLabelBottom,
          `${width} px`
        ).toBeLessThan(16);
        if (width >= 640)
          expect(
            Math.abs(layout.experienceTop - layout.specialtySearchTop),
            `${width} px`
          ).toBeLessThanOrEqual(1);
        expect(layout.globeOpacity, `${width} px`).toBeLessThanOrEqual(0.2);
        await page.context().close();
      }
      const hub = await openStandard(1440, { route: "/recruitment" });
      expect(
        Number(
          await hub
            .locator(".hero-globe")
            .evaluate(globe => getComputedStyle(globe).opacity)
        )
      ).toBeLessThanOrEqual(0.2);
      await hub.context().close();
    }, 60_000);

    it("garde un contour au champ qui a le focus en couleurs forcées, invisible sinon (A11Y-08)", async () => {
      for (const forcedColors of ["active", "none"] as const) {
        const page = await openStandard(1366, { forcedColors });
        await page.focus("#recruitment-email");
        const outline = await page
          .locator("#recruitment-email")
          .evaluate(field => {
            const style = getComputedStyle(field);
            return {
              style: style.outlineStyle,
              width: parseFloat(style.outlineWidth),
              color: style.outlineColor,
            };
          });
        // Forced colors drop the focus shadow and paint the outline in a system colour.
        expect(outline.style, forcedColors).toBe("solid");
        expect(outline.width, forcedColors).toBeGreaterThanOrEqual(2);
        if (forcedColors === "none")
          expect(outline.color).toBe("rgba(0, 0, 0, 0)");
        else expect(outline.color).not.toBe("rgba(0, 0, 0, 0)");
        await page.context().close();
      }
    }, 60_000);
  }
);
