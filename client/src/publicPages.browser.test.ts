import { existsSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent } from "@/components/cookieConsentState";
import { contentDe } from "@/data/content-de";
import { contentFr } from "@/data/content-fr";
import { homeSeo } from "@/pages/Home";
import { STATIC_ROUTE_METADATA } from "@shared/routeMetadata";

/**
 * Pages publiques dans un vrai navigateur : le client est servi par Vite et tRPC répond par des
 * données vides, sans serveur ni base. Ne tourne que si un Chromium est disponible :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/publicPages.browser.test.ts
 * sinon le Chromium installé par Playwright, puis celui du système (/usr/bin/chromium, ou
 * /usr/bin/google-chrome, présent sur les machines de la CI). Sans Chromium, le fichier n'est
 * sauté que pour un `pnpm test` sur un poste : en CI (CI) et pour `pnpm test:visual`
 * (REQUIRE_CHROMIUM), il échoue plutôt que de passer sans avoir rien vérifié.
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
const chromiumRequired = Boolean(process.env.CI?.trim() || process.env.REQUIRE_CHROMIUM?.trim());
const root = path.resolve(import.meta.dirname, "../..");

type Theme = "light" | "dark";

/**
 * Turnstile simulé : le client est servi avec une clé de site de test et le script de Cloudflare est
 * remplacé par un faux qui affiche le défi sans le résoudre, comme avant qu'un visiteur le passe, ou
 * qui donne aussitôt le jeton passé à open().
 */
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
const fakeTurnstileScript = (token: string | null) => `window.turnstile = {
  render: (element, options) => { if (${JSON.stringify(token)}) setTimeout(() => options.callback(${JSON.stringify(token)})); return "fake-widget"; },
  remove: () => {},
  reset: () => {},
};`;

it.runIf(chromiumRequired && !executablePath)("trouve un Chromium, sans lequel aucune page publique n'est vérifiée", () => {
  expect.fail("Aucun Chromium trouvé : donnez son chemin par CHROMIUM, ou installez celui de Playwright (pnpm exec playwright install chromium).");
});

describe.skipIf(!executablePath)("pages publiques dans un navigateur", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;
  const previousTurnstileSiteKey = process.env.VITE_TURNSTILE_SITE_KEY;

  beforeAll(async () => {
    process.env.VITE_TURNSTILE_SITE_KEY = TURNSTILE_TEST_SITE_KEY;
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
    if (previousTurnstileSiteKey === undefined) delete process.env.VITE_TURNSTILE_SITE_KEY;
    else process.env.VITE_TURNSTILE_SITE_KEY = previousTurnstileSiteKey;
  });

  /**
   * Sans consentement enregistré (par défaut), le bandeau cookies est ouvert en bas de l'écran. Avec
   * language: null, aucune langue n'est mémorisée, pour un navigateur réglé sur `locale`. Avec
   * blockedStorage, le navigateur refuse tout stockage au site, comme Chromium quand ses données sont
   * bloquées : lire localStorage ou sessionStorage lève une SecurityError. Les erreurs de la page sont
   * ajoutées à `pageErrors`.
   */
  async function open(route: string, { width = 1440, height = 800, theme = "dark" as Theme, touch = false, consent = false, language = "fr" as string | null, locale = "en-US", turnstileToken = null as string | null, blockedStorage = false, pageErrors = [] as string[] } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, locale });
    await context.addInitScript(({ storedLanguage, storedTheme, storedConsent, blocked }) => {
      if (blocked) {
        for (const name of ["localStorage", "sessionStorage"]) {
          Object.defineProperty(window, name, { configurable: true, get: () => { throw new DOMException(`Failed to read the '${name}' property from 'Window': Access is denied for this document.`, "SecurityError"); } });
        }
        return;
      }
      if (storedLanguage) localStorage.setItem("language", storedLanguage);
      localStorage.setItem("theme", storedTheme);
      if (storedConsent) localStorage.setItem(storedConsent.key, storedConsent.value);
    }, { storedLanguage: language, storedTheme: theme, storedConsent: consent ? { key: COOKIE_CONSENT_STORAGE_KEY, value: JSON.stringify(createCookieConsent(false)) } : null, blocked: blockedStorage });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/trpc/**", (request) => {
      const procedures = new URL(request.request().url()).pathname.replace(/^.*\/api\/trpc\//, "").split(",");
      return request.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(procedures.map(() => ({ result: { data: superjson.serialize(null) } }))) });
    });
    await page.route("https://challenges.cloudflare.com/**", (request) => request.fulfill({ status: 200, contentType: "text/javascript", body: fakeTurnstileScript(turnstileToken) }));
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    // On a loaded machine (CI), "networkidle" can fire before the lazily loaded page has replaced the
    // loading screen: wait for the page itself, whose landmark every tested route renders.
    await page.waitForFunction(() => !document.querySelector(".app-loading-shell") && document.querySelector('main, [role="main"]') !== null, undefined, { timeout: 30_000 });
    // Fin de l'animation d'entrée de page, posée sur le conteneur ou sur les voisins de l'en-tête :
    // l'état testé est celui que le visiteur garde ensuite.
    await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === "page-transition-enter").map((animation) => animation.finished)));
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

  /** Fin du défilement doux (scroll-behavior: smooth) : la position ne bouge plus pendant 4 images. */
  const scrollSettled = () => new Promise<void>((resolve) => {
    let last = -1;
    let stable = 0;
    let frames = 0;
    const tick = () => {
      stable = window.scrollY === last ? stable + 1 : 0;
      last = window.scrollY;
      if (stable >= 4 || ++frames > 120) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  /**
   * Fin des transitions d'apparition (.fade-in-up, .parallax-subtle) : une section pas encore révélée
   * est décalée ou réduite (scale 0,97) et ne s'arrête à sa place qu'une fois la transition finie.
   */
  const revealSettled = () => Promise.all(document.getAnimations()
    .filter((animation) => animation instanceof CSSTransition && ((animation.effect as KeyframeEffect | null)?.target as Element | null)?.matches(".fade-in-up, .parallax-subtle"))
    .map((animation) => animation.finished)).then(() => undefined);

  it("garde l'en-tête en haut de l'écran après un défilement de 1 500 px (PUB-01)", async () => {
    for (const width of [1440, 390]) {
      for (const route of ["/", "/faq", "/employers", "/venture/pratique-clinique"]) {
        const page = await open(route, { width });
        await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "instant" }));
        const position = await page.evaluate(() => ({ scrollY: window.scrollY, top: document.querySelector("header.site-nav")?.getBoundingClientRect().top ?? null }));
        expect(position.scrollY, `${route} à ${width} px`).toBeGreaterThan(500);
        expect(position.top, `${route} à ${width} px`).toBe(0);
        await page.context().close();
      }
    }
  }, 120_000);

  it("laisse l'en-tête fixe pendant l'animation d'entrée d'une page, qui reste celle du contenu (PUB-01)", async () => {
    for (const width of [1440, 390]) {
      const page = await open("/faq", { width });
      await page.evaluate(() => history.pushState(null, "", "/employers"));
      await page.waitForFunction(() => location.pathname === "/employers" && document.querySelector(".page-transition main form") !== null);
      // Retour arrière vers /faq : la page revient avec son animation d'entrée, figée ici à son début.
      const during = await page.evaluate(() => new Promise<{ animations: number; scrollY: number; headerTop: number; transformedAncestors: string[]; mainOpacity: string }>((resolve) => {
        const observer = new MutationObserver(() => {
          if (location.pathname !== "/faq" || !document.querySelector(".page-transition main")) return;
          observer.disconnect();
          const animations = document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === "page-transition-enter");
          for (const animation of animations) {
            animation.pause();
            animation.currentTime = 0;
          }
          window.scrollTo({ top: 1500, behavior: "instant" });
          const header = document.querySelector("header.site-nav")!;
          const transformedAncestors: string[] = [];
          for (let node = header.parentElement; node; node = node.parentElement) {
            if (getComputedStyle(node).transform !== "none") transformedAncestors.push(node.tagName + "." + node.className);
          }
          resolve({ animations: animations.length, scrollY: window.scrollY, headerTop: header.getBoundingClientRect().top, transformedAncestors, mainOpacity: getComputedStyle(document.querySelector(".page-transition main")!).opacity });
        });
        observer.observe(document.body, { childList: true, subtree: true });
        history.back();
      }));
      expect(during.animations, `${width} px`).toBeGreaterThan(0);
      expect(during.scrollY, `${width} px`).toBeGreaterThan(500);
      expect(during.transformedAncestors, `${width} px`).toEqual([]);
      expect(during.headerTop, `${width} px`).toBe(0);
      // Le contenu, lui, entre toujours en fondu.
      expect(during.mainOpacity, `${width} px`).toBe("0");
      await page.context().close();
    }

    // Sans en-tête (réservation, espace candidat…), la page entière garde l'animation.
    const booking = await open("/booking");
    expect(await booking.evaluate(() => getComputedStyle(document.querySelector(".page-transition")!).animationName)).toBe("page-transition-enter");
    await booking.context().close();
  }, 120_000);

  it("garde sous l'en-tête fixe l'élément qui reçoit le focus en remontant au clavier (PUB-01, WCAG 2.4.11)", async () => {
    for (const [route, width] of [["/employers", 1366], ["/faq", 1366], ["/employers", 390], ["/", 390]] as const) {
      const page = await open(route, { width, height: width < 768 ? 844 : 900 });
      // Du premier lien du pied de page, Maj+Tab remonte dans le formulaire ou la FAQ.
      await page.evaluate(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
        document.querySelector<HTMLElement>("footer a[href], footer button")!.focus();
      });
      for (let step = 0; step < 14; step++) {
        await page.keyboard.press("Shift+Tab");
        await page.evaluate(scrollSettled);
        const hidden = await page.evaluate(() => {
          const focused = document.activeElement as HTMLElement | null;
          const header = document.querySelector("header.site-nav")!;
          if (!focused || focused === document.body || header.contains(focused)) return null;
          const box = focused.getBoundingClientRect();
          const label = `${focused.tagName.toLowerCase()} « ${(focused.getAttribute("placeholder") || focused.textContent || "").trim().slice(0, 40)} » [${Math.round(box.top)}, ${Math.round(box.bottom)}]`;
          if (box.bottom <= 0 || box.top >= innerHeight) return `${label} hors de l'écran`;
          const covered = [[box.left + box.width / 2, box.top + box.height / 2], [box.left + 4, box.top + 2]].some(([x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return hit !== null && header.contains(hit) && !focused.contains(hit);
          });
          return covered ? `${label} sous l'en-tête` : null;
        });
        expect(hidden, `${route} à ${width} px, Maj+Tab n° ${step + 1}`).toBeNull();
      }
      await page.context().close();
    }
  }, 120_000);

  it("amène en haut de l'écran la section choisie dans le menu ou par « Me contacter », comme une adresse /#section (PUB-01)", async () => {
    // Chaque section a sa propre marge haute : elle ne doit pas s'arrêter en plus sous le scroll-padding de l'en-tête.
    for (const width of [1600, 390]) {
      for (const [id, trigger] of [["services", "menu"], ["contact", "menu"], ["contact", "hero"]] as const) {
        // Dès 1024 px, l'en-tête ne liste plus les sections de l'accueil, sauf Contact (PUB-08).
        if (width >= 1024 && id === "services" && trigger === "menu") continue;
        const page = await open("/", { width, height: width < 768 ? 844 : 900, consent: true });
        if (trigger === "hero") {
          await page.locator("#hero").getByRole("button", { name: contentFr.nav.getInTouch }).click();
        } else {
          if (width < 1024) await page.getByRole("button", { name: "Ouvrir le menu" }).click();
          const name = id === "services" ? contentFr.nav.services : contentFr.nav.contact;
          await page.locator(width < 1024 ? "#mobile-navigation" : "header nav").getByRole("link", { name, exact: true }).click();
          // Un vrai lien /#section, que l'accueil fait défiler sans changer d'adresse.
          expect(await page.evaluate(() => location.pathname + location.hash), `${id} par ${trigger} à ${width} px`).toBe("/");
        }
        await page.waitForFunction(() => window.scrollY > 0);
        await page.evaluate(scrollSettled);
        // Arrivée à l'écran, la section se révèle : sa place est celle d'après la transition.
        await page.waitForFunction((sectionId) => [...document.querySelectorAll(".fade-in-up, .parallax-subtle")]
          .filter((node) => node.contains(document.getElementById(sectionId)))
          .every((node) => node.classList.contains("visible")), id);
        await page.evaluate(revealSettled);
        const landed = await page.evaluate((sectionId) => ({
          section: document.getElementById(sectionId)!.getBoundingClientRect().top,
          heading: document.querySelector(`#${sectionId} h2`)!.getBoundingClientRect().top,
          header: document.querySelector("header.site-nav")!.getBoundingClientRect().bottom,
        }), id);
        expect(Math.abs(landed.section), `${id} par ${trigger} à ${width} px`).toBeLessThanOrEqual(1);
        expect(landed.heading, `${id} par ${trigger} à ${width} px`).toBeGreaterThanOrEqual(landed.header);
        await page.context().close();
      }
    }
  }, 120_000);

  it("ouvre en haut la page qu'atteint un lien, sans sauter au changement d'onglet de /legal, et laisse ancres, Retour et Avance à leur place (PUB-01)", async () => {
    /** Après une navigation : la route rendue, l'animation d'entrée finie, le défilement arrêté. */
    const settled = (page: Page, address: string) => page.waitForFunction((expected) => location.pathname + location.search + location.hash === expected && !document.querySelector(".app-loading-shell") && document.querySelector("main") !== null, address)
      .then(() => page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === "page-transition-enter").map((animation) => animation.finished))))
      .then(() => page.evaluate(scrollSettled));
    const state = (page: Page) => page.evaluate(() => {
      const tabs = document.querySelector('[role="group"][aria-label="Sections juridiques"]')?.getBoundingClientRect();
      return {
        scrollY: Math.round(window.scrollY),
        tab: document.querySelector('[aria-label="Sections juridiques"] [aria-current="page"]')?.textContent?.trim() ?? null,
        // The tabs are seen when they sit between the bottom of the fixed header and the bottom of the screen.
        tabsSeen: tabs ? tabs.top >= document.querySelector("header.site-nav")!.getBoundingClientRect().bottom - 1 && tabs.bottom <= innerHeight : false,
        entries: history.length,
      };
    });
    const toBottom = (page: Page) => page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    const footerLink = (page: Page, name: string) => page.locator("footer").getByRole("link", { name, exact: true });

    for (const width of [1600, 390]) {
      const where = `${width} px`;
      const page = await open("/faq", { width, height: width < 768 ? 844 : 900, consent: true });
      // A footer link to another page opens it at its top, its tabs in view.
      await toBottom(page);
      const faqY = await page.evaluate(() => window.scrollY);
      expect(faqY, where).toBeGreaterThan(500);
      await footerLink(page, contentFr.footer.privacy).click();
      await settled(page, "/legal?tab=privacy");
      expect(await state(page), where).toMatchObject({ scrollY: 0, tab: "Politique de Confidentialité", tabsSeen: true });

      // A tab chosen on the page replaces the address and leaves the page where it is (the tabs well
      // below the header, so that the focus the click gives them moves nothing either).
      const tabsAt = await page.evaluate(() => Math.round(document.querySelector('[role="group"][aria-label="Sections juridiques"]')!.getBoundingClientRect().top + window.scrollY - document.querySelector("header.site-nav")!.getBoundingClientRect().bottom - 120));
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), tabsAt);
      const before = await state(page);
      await page.getByRole("button", { name: "Conditions Générales" }).click();
      await settled(page, "/legal?tab=terms");
      expect(await state(page), where).toMatchObject({ scrollY: before.scrollY, tab: "Conditions Générales", entries: before.entries });
      expect(before.scrollY, where).toBeGreaterThan(0);

      // A footer link to the page shown, from its bottom: back at the top, on the tab it opens.
      await toBottom(page);
      const termsY = await page.evaluate(() => window.scrollY);
      await footerLink(page, contentFr.footer.privacy).click();
      await settled(page, "/legal?tab=privacy");
      expect(await state(page), where).toMatchObject({ scrollY: 0, tab: "Politique de Confidentialité", tabsSeen: true });

      // Back and Forward: the browser gives each page back where it was left, nothing sends it to the top.
      await page.evaluate(() => history.back());
      await settled(page, "/legal?tab=terms");
      expect(Math.abs((await state(page)).scrollY - termsY), `${where}, retour sur /legal?tab=terms`).toBeLessThanOrEqual(2);
      await page.evaluate(() => history.back());
      await settled(page, "/faq");
      expect(Math.abs((await state(page)).scrollY - faqY), `${where}, retour sur /faq`).toBeLessThanOrEqual(2);
      await page.evaluate(() => history.forward());
      await settled(page, "/legal?tab=terms");
      expect((await state(page)).scrollY, `${where}, avance sur /legal?tab=terms`).toBeGreaterThan(0);

      // Another route the code replaces or pushes opens at its top too.
      await toBottom(page);
      await page.evaluate(() => history.replaceState(null, "", "/employers"));
      await settled(page, "/employers");
      expect((await state(page)).scrollY, `${where}, /employers remplacée`).toBe(0);
      await toBottom(page);
      await page.evaluate(() => history.pushState(null, "", "/"));
      await settled(page, "/");
      expect((await state(page)).scrollY, `${where}, / poussée`).toBe(0);

      // An address with an anchor is left to the page. Shown, the home page stays at the section it
      // shows (once past the first 500 ms in which it brings up the section of its address).
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollTo({ top: document.getElementById("services")!.getBoundingClientRect().top + window.scrollY, behavior: "instant" }));
      const servicesY = await page.evaluate(() => window.scrollY);
      expect(servicesY, where).toBeGreaterThan(500);
      await page.evaluate(() => history.pushState(null, "", "/#contact"));
      await settled(page, "/#contact");
      expect((await state(page)).scrollY, `${where}, /#contact poussée sur l'accueil`).toBe(Math.round(servicesY));
      // Reached from another page, it brings the section to the top of the screen, as before.
      await page.evaluate(() => history.pushState(null, "", "/faq"));
      await settled(page, "/faq");
      await page.evaluate(() => history.pushState(null, "", "/#contact"));
      await settled(page, "/#contact");
      await page.waitForFunction(() => [...document.querySelectorAll(".fade-in-up, .parallax-subtle")]
        .filter((node) => node.contains(document.getElementById("contact")))
        .every((node) => node.classList.contains("visible")));
      await page.evaluate(revealSettled);
      await page.waitForTimeout(600);
      await page.evaluate(scrollSettled);
      expect(Math.abs(await page.evaluate(() => document.getElementById("contact")!.getBoundingClientRect().top)), `${where}, /#contact depuis /faq`).toBeLessThanOrEqual(1);
      await page.context().close();
    }
  }, 120_000);

  it("garde « MAINTENANCE », le sur-titre de l'accueil et les adresses email dans leur cadre (PUB-17, PUB-18, PUB-19)", async () => {
    // /maintenance: the status code fits in its card from 320 px, the page does not scroll sideways.
    for (const width of [320, 390]) {
      const page = await open("/maintenance", { width, height: 844, consent: true });
      const code = await page.evaluate(() => {
        const element = [...document.querySelectorAll("main p")].find((paragraph) => paragraph.textContent === "MAINTENANCE")!;
        const range = document.createRange();
        range.selectNodeContents(element);
        const text = range.getBoundingClientRect();
        const card = element.closest("section")!.getBoundingClientRect();
        return { inside: text.left >= card.left && text.right <= card.right, pageWidth: document.documentElement.scrollWidth };
      });
      expect(code, `/maintenance à ${width} px`).toEqual({ inside: true, pageWidth: width });
      await page.context().close();
    }
    // /error: « 500 » fits as it is and keeps its size on a phone.
    const error = await open("/error", { width: 390, height: 844, consent: true });
    expect(await error.locator("main p", { hasText: /^500$/ }).evaluate((code) => getComputedStyle(code).fontSize)).toBe("48px");
    await error.context().close();

    // Home: the kicker sits on its own line above the credentials badge, never touching it; on a
    // phone its two lines are balanced, not « HIPPOCAMPUS CONSULTING · » over « FRANCE ».
    for (const width of [1024, 1280, 1440, 390]) {
      const page = await open("/", { width, height: 900, consent: true });
      const hero = await page.evaluate(() => {
        const kicker = document.querySelector("#hero .eyebrow-label")!;
        const badge = kicker.nextElementSibling!.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(kicker);
        const lines = new Map<number, number>();
        for (const rect of range.getClientRects()) lines.set(Math.round(rect.top), (lines.get(Math.round(rect.top)) ?? 0) + rect.width);
        const widths = [...lines.values()];
        const rects = [...range.getClientRects()].filter((rect) => rect.width > 0).sort((a, b) => a.top - b.top);
        const style = getComputedStyle(kicker);
        return {
          gap: badge.top - kicker.getBoundingClientRect().bottom,
          lines: widths.length,
          balance: Math.min(...widths) / Math.max(...widths),
          lineHeight: parseFloat(style.lineHeight) / parseFloat(style.fontSize),
          // Room between the glyphs of one line and those of the next (negative: they overlap).
          lineGap: rects.at(-1)!.top - rects[0].bottom,
        };
      });
      expect(hero.gap, `${width} px`).toBeGreaterThanOrEqual(16);
      expect(hero.lines, `${width} px`).toBeLessThanOrEqual(2);
      // A normal line height, not the 1 of .eyebrow-label, so that two lines do not touch.
      expect(hero.lineHeight, `${width} px`).toBeGreaterThanOrEqual(1.4);
      if (hero.lines === 2) {
        expect(hero.balance, `${width} px`).toBeGreaterThan(0.4);
        expect(hero.lineGap, `${width} px`).toBeGreaterThanOrEqual(0);
      }
      await page.context().close();
    }

    // The 39-character contact address breaks inside its line rather than widening a 320 px page.
    for (const route of ["/legal", "/legal?tab=privacy", "/booking/confirmation?status=success&trackingId=VISUAL-TEST-2026"]) {
      const page = await open(route, { width: 320, height: 700, consent: true });
      const layout = await page.evaluate(() => ({
        emails: document.querySelectorAll('main a[href^="mailto:"]').length,
        outside: [...document.querySelectorAll('a[href^="mailto:"]')].filter((link) => link.getBoundingClientRect().right > innerWidth + 0.5).map((link) => link.textContent),
        pageWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.emails, route).toBeGreaterThan(0);
      expect({ outside: layout.outside, pageWidth: layout.pageWidth }, route).toEqual({ outside: [], pageWidth: 320 });
      await page.context().close();
    }
  }, 120_000);

  it("garde un contour aux champs de réservation et de contact qui ont le focus en couleurs forcées, invisible sinon (A11Y-08)", async () => {
    for (const [route, field] of [["/booking", "#booking-name"], ["/", "#contact-name"]] as const) {
      const page = await open(route, { width: 1366, consent: true });
      const outline = async (forcedColors: "active" | "none") => {
        await page.emulateMedia({ forcedColors });
        await page.focus(field);
        return page.locator(field).evaluate((element) => { const style = getComputedStyle(element); return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor }; });
      };
      // Forced colors (Windows high contrast) drop the focus shadow: only an outline can show the focus.
      const forced = await outline("active");
      expect(forced.style, route).toBe("solid");
      expect(forced.width, route).toBeGreaterThanOrEqual(2);
      expect(forced.color, route).not.toBe("rgba(0, 0, 0, 0)");
      expect(await outline("none"), route).toMatchObject({ style: "solid", color: "rgba(0, 0, 0, 0)" });
      await page.context().close();
    }
  }, 60_000);

  it("met la réservation en tête du menu mobile et dans l'en-tête dès 1024 px (PUB-02)", async () => {
    const mobile = await open("/faq", { width: 390, height: 844 });
    await mobile.getByRole("button", { name: "Ouvrir le menu" }).click();
    const firstEntry = mobile.locator("#mobile-navigation nav > *").first();
    expect(await firstEntry.evaluate((element) => element.outerHTML)).toMatch(/^<a [^>]*href="\/booking"/);
    expect(await firstEntry.isVisible()).toBe(true);
    expect(await firstEntry.textContent()).toBe(contentFr.hero.bookConsultation);
    expect(await mobile.locator("#mobile-navigation").getByText(contentFr.nav.getInTouch, { exact: true }).count()).toBe(0);
    await mobile.context().close();

    // « Consultation » de la navigation dès 1024 px, le bouton en plus dès 1280 px (PUB-08).
    for (const [width, visible] of [[800, []], [1024, [contentFr.nav.consultation]], [1280, [contentFr.nav.consultation, contentFr.hero.bookConsultation]], [1536, [contentFr.nav.consultation, contentFr.hero.bookConsultation]]] as const) {
      const page = await open("/faq", { width });
      const shown = await page.locator('header.site-nav a[href="/booking"]').filter({ visible: true }).allTextContents();
      expect(shown, `${width} px`).toEqual(visible);
      await page.context().close();
    }
  }, 120_000);

  it("montre les rubriques principales dès 1024 px sans chevauchement, et le menu compact en dessous (PUB-08)", async () => {
    // Le français, et l'allemand aux libellés les plus longs.
    for (const [language, { nav }] of [["fr", contentFr], ["de", contentDe]] as const) {
      for (const width of [360, 430, 800, 1024, 1180, 1280, 1366, 1440, 1600]) {
        const page = await open("/faq", { width, language, consent: true });
        const header = await page.evaluate(() => {
          const box = (element: Element | null) => {
            const rect = element?.getBoundingClientRect();
            return rect && rect.width > 0 ? { left: rect.left, right: rect.right } : null;
          };
          const row = document.querySelector("header.site-nav .site-nav-container")!;
          const nav = row.querySelector("nav");
          const actions = [...row.children[2].children].map(box).filter((entry) => entry !== null);
          return {
            logo: box(row.querySelector(".brand-lockup img")),
            lockup: box(row.querySelector(".brand-lockup")),
            nav: box(nav),
            links: nav && box(nav) ? [...nav.querySelectorAll("a")].map((link) => ({ text: link.textContent, clipped: link.scrollWidth > link.clientWidth + 1 })) : [],
            actions: { left: Math.min(...actions.map((entry) => entry.left)), right: Math.max(...actions.map((entry) => entry.right)) },
            burger: box(row.querySelector('[aria-controls="mobile-navigation"]')),
            overflow: document.documentElement.scrollWidth - innerWidth,
          };
        });
        const label = `${language}, ${width} px`;
        expect(header.overflow, label).toBeLessThanOrEqual(0);
        expect(header.logo, label).not.toBeNull();
        if (width >= 1024) {
          expect(header.links.map((link) => link.text), label).toEqual([nav.consultation, nav.healthQuestions, nav.recruitment, nav.employers, nav.contact]);
          expect(header.links.filter((link) => link.clipped), label).toEqual([]);
          expect(header.lockup!.right, label).toBeLessThan(header.nav!.left);
          expect(header.nav!.right, label).toBeLessThan(header.actions.left);
          expect(header.burger, label).toBeNull();
        } else {
          expect(header.nav, label).toBeNull();
          expect(header.burger, label).not.toBeNull();
          // Le logo reste entier sur les téléphones de 360 à 430 px (M19 / PUB-UI-01).
          expect(header.logo!.right, label).toBeLessThan(header.actions.left);
        }
        await page.context().close();
      }
    }
  }, 240_000);

  it("ne laisse flotter ni pastille cookies ni WhatsApp sur les formulaires, et rouvre le choix depuis le pied de page (PUB-12)", async () => {
    for (const route of ["/booking", "/employers", "/questions-anesthesie", "/recruitment/standard", "/gdpr"]) {
      const page = await open(route, { width: 390, height: 844, consent: true });
      expect(await page.locator(".cookie-preferences-shortcut, .whatsapp-contact-float").count(), route).toBe(0);
      await page.context().close();
    }
    const home = await open("/", { width: 390, height: 844, consent: true });
    expect(await home.locator(".whatsapp-contact-float").count()).toBe(1);
    expect(await home.locator(".cookie-preferences-shortcut").count()).toBe(0);
    const manage = home.locator("footer").getByRole("button", { name: "Gérer les cookies" });
    await manage.click();
    const dialog = home.getByRole("dialog", { name: "Préférences cookies" });
    await dialog.waitFor();
    await home.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    expect(await manage.evaluate((element) => element === document.activeElement)).toBe(true);
    await home.context().close();
  }, 120_000);

  it("garde l'accueil et la confirmation de réservation dans l'écran en allemand, en anglais et en chinois, de 320 px (PUB-17, PUB-19)", async () => {
    for (const language of ["de", "en", "zh"]) {
      for (const width of [320, 360]) {
        for (const route of ["/", "/booking/confirmation?status=success&trackingId=VISUAL-TEST-2026"]) {
          const page = await open(route, { width, height: 844, consent: true, language });
          // Revealed sections only: one not yet shown is shifted (.fade-in-up).
          await page.evaluate(() => document.querySelectorAll(".fade-in-up").forEach((section) => section.classList.add("visible")));
          await page.evaluate(revealSettled);
          const layout = await page.evaluate(() => {
            const outside = (element: Element, frame: Element | null) => frame !== null && element.getBoundingClientRect().right > frame.getBoundingClientRect().right + 0.5;
            return {
              pageWidth: document.documentElement.scrollWidth,
              // « Gesundheitsunternehmen » in its column of the home page, « Datenschutzerklärung » in its card.
              outOfCard: [
                ...[...document.querySelectorAll(".stat-card p")].filter((label) => outside(label, label.closest(".stat-card"))),
                ...[...document.querySelectorAll(".privacy-trust-card a, .privacy-trust-card p")].filter((text) => outside(text, text.closest(".privacy-trust-card"))),
              ].map((element) => element.textContent),
            };
          });
          expect(layout, `${route} en ${language} à ${width} px`).toEqual({ pageWidth: width, outOfCard: [] });
          await page.context().close();
        }
      }
    }
  }, 180_000);

  it("donne à l'accueil passé en anglais son titre, sa description et og:locale anglais, et rend en français ceux de la page pré-rendue (EN-10)", async () => {
    const page = await open("/", { consent: true });
    const head = () => page.evaluate(() => ({
      lang: document.documentElement.lang,
      title: document.title,
      description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content,
      ogLocale: document.querySelector<HTMLMetaElement>('meta[property="og:locale"]')?.content,
    }));
    const french = await head();
    expect(french).toMatchObject({ lang: "fr", title: STATIC_ROUTE_METADATA["/"].title, description: STATIC_ROUTE_METADATA["/"].description, ogLocale: "fr_FR" });

    await page.getByRole("button", { name: "FR — Changer de langue" }).click();
    await page.getByRole("menuitem", { name: "English" }).click();
    await page.waitForFunction(() => document.documentElement.lang === "en");
    expect(await head()).toEqual({ lang: "en", title: homeSeo.en.title, description: homeSeo.en.description, ogLocale: "en_GB" });

    await page.getByRole("button", { name: "EN — Change language" }).click();
    await page.getByRole("menuitem", { name: "Français" }).click();
    await page.waitForFunction(() => document.documentElement.lang === "fr");
    expect(await head()).toEqual(french);
    await page.context().close();
  }, 60_000);

  it("propose l'anglais à un navigateur sans français, sans changer la page tant que le visiteur ne choisit pas (EN-08)", async () => {
    for (const width of [320, 360, 1440]) {
      const page = await open("/", { width, language: null, locale: "en-US", consent: true });
      const offer = page.locator('[lang="en"][data-nosnippet]');
      await offer.waitFor();
      expect(await page.evaluate(() => document.documentElement.lang), `${width} px`).toBe("fr");
      const box = (await offer.boundingBox())!;
      expect(box.x, `${width} px`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${width} px`).toBeLessThanOrEqual(width);
      if (width >= 640) {
        // Le menu « Affichage » s'ouvre à la place de l'offre, qui revient à sa fermeture.
        await page.locator("header").getByRole("button", { name: "Affichage" }).click();
        expect(await offer.count(), `${width} px, menu Affichage ouvert`).toBe(0);
        await page.keyboard.press("Escape");
        await offer.waitFor();
      }
      // La page défile : l'offre ne reste pas au-dessus du contenu sous l'en-tête fixe.
      await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
      await offer.waitFor({ state: "detached" });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await offer.waitFor();
      // Passage à l'anglais sur place : la page n'est pas rechargée (EN-10).
      await page.evaluate(() => { (window as unknown as { before?: boolean }).before = true; });
      await offer.getByRole("button", { name: "Switch to English" }).click();
      await page.waitForFunction(() => document.documentElement.lang === "en");
      expect(await page.evaluate(() => (window as unknown as { before?: boolean }).before), `${width} px`).toBe(true);
      expect(await page.evaluate(() => localStorage.getItem("language")), `${width} px`).toBe("en");
      expect(await offer.count(), `${width} px`).toBe(0);
      await page.context().close();
    }
    const french = await open("/", { language: null, locale: "fr-FR", consent: true });
    expect(await french.locator('[lang="en"][data-nosnippet]').count()).toBe(0);
    await french.context().close();
  }, 120_000);

  it("garde la saisie d'une candidature quand le visiteur passe en anglais (EN-10)", async () => {
    const page = await open("/recruitment/standard", { consent: true });
    await page.locator("#recruitment-firstName").fill("Ahmed");
    await page.getByRole("button", { name: "FR — Changer de langue" }).click();
    await page.getByRole("menuitem", { name: "English" }).click();
    await page.waitForFunction(() => document.documentElement.lang === "en");
    expect(await page.locator("#recruitment-firstName").inputValue()).toBe("Ahmed");
    expect(await page.getByRole("button", { name: "EN — Change language" }).count()).toBe(1);
    await page.context().close();
  }, 60_000);

  it("affiche l'accueil et le formulaire de candidature quand le navigateur refuse tout stockage au site (REC-22)", async () => {
    for (const route of ["/", "/recruitment/standard"]) {
      const pageErrors: string[] = [];
      const page = await open(route, { width: 390, height: 844, blockedStorage: true, pageErrors });
      expect(await page.evaluate(() => { try { return typeof localStorage; } catch (error) { return (error as DOMException).name; } }), route).toBe("SecurityError");
      // Language and theme by default, no choice read: the cookie banner asks, and closes once answered.
      expect(await page.evaluate(() => ({ lang: document.documentElement.lang, dark: document.documentElement.classList.contains("dark") })), route).toEqual({ lang: "fr", dark: true });
      await page.getByRole("button", { name: "Essentiels uniquement" }).click();
      await page.locator(".cookie-consent-banner").waitFor({ state: "detached" });
      if (route === "/recruitment/standard") {
        await page.locator("#recruitment-firstName").fill("Ahmed");
        await page.getByRole("button", { name: "FR — Changer de langue" }).click();
        await page.getByRole("menuitem", { name: "English" }).click();
        await page.waitForFunction(() => document.documentElement.lang === "en");
        expect(await page.locator("#recruitment-firstName").inputValue()).toBe("Ahmed");
      }
      expect(pageErrors, route).toEqual([]);
      await page.context().close();
    }
  }, 120_000);

  it("laisse atteindre au clavier la dernière entrée du menu mobile sur un écran peu haut, bandeau cookies fermé ou ouvert", async () => {
    // L'en-tête étant vraiment fixe (PUB-01), le menu doit défiler lui-même : sous 640 px, thème,
    // lisibilité renforcée et noir OLED n'existent que dans ce menu. Bandeau ouvert, il s'arrête
    // au-dessus (EN-03).
    for (const consent of [true, false]) {
      for (const [width, height] of [[390, 664], [360, 640], [844, 390]] as const) {
        const page = await open("/faq", { width, height, consent });
        await page.getByRole("button", { name: "Ouvrir le menu" }).click();
        // La dernière entrée, puis le dernier réglage du sous-menu « Affichage » une fois ouvert (PUB-08).
        for (const entry of ["#mobile-navigation nav > *", "#mobile-display-settings > button"]) {
          if (entry !== "#mobile-navigation nav > *") await page.locator("#mobile-navigation").getByRole("button", { name: "Affichage" }).click();
          const lastEntry = page.locator(entry).last();
          await lastEntry.focus();
          const reached = await lastEntry.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return { height: box.height, bottom: box.bottom, visible: hit !== null && element.contains(hit) };
          });
          const label = `${width}x${height}, bandeau ${consent ? "fermé" : "ouvert"}, ${entry}`;
          expect(reached.height, label).toBeGreaterThan(0);
          expect(reached.bottom, label).toBeLessThanOrEqual(height);
          expect(reached.visible, label).toBe(true);
        }
        await page.context().close();
      }
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
          // Contraste non textuel du contour d'un champ (WCAG 1.4.11).
          expect(field.borderContrast, `${route} ${theme} ${width} px`).toBeGreaterThanOrEqual(3);
          expect(field.height, `${route} ${theme} ${width} px`).toBeGreaterThanOrEqual(44);
        }
        await page.context().close();
      }
    }
  }, 120_000);

  it("affiche en entier la valeur choisie et le texte indicatif des champs form-control (A11Y-01)", async () => {
    for (const [route, width] of [["/employers", 1366], ["/employers", 1440], ["/employers", 390], ["/recruitment/vvip-offshore", 1366], ["/recruitment/vvip-offshore", 1440], ["/recruitment/vvip-offshore", 390]] as const) {
      const page = await open(route, { width });
      const clipped = await page.$$eval("main form .form-control:is(input, select)", (elements) => {
        const context = document.createElement("canvas").getContext("2d")!;
        return elements.filter((element) => element.getBoundingClientRect().width > 0).flatMap((element) => {
          const field = element as HTMLInputElement | HTMLSelectElement;
          const style = getComputedStyle(field);
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const text = field instanceof HTMLSelectElement ? field.selectedOptions[0]?.text ?? "" : field.placeholder;
          // La flèche d'un select occupe environ 20 px en plus de la marge intérieure.
          const room = field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - (field instanceof HTMLSelectElement ? 20 : 0);
          const needed = context.measureText(text).width;
          return needed > room ? [`« ${text} » : ${Math.ceil(needed)} px pour ${Math.floor(room)}`] : [];
        });
      });
      expect(clipped, `${route} à ${width} px`).toEqual([]);
      await page.context().close();
    }
  }, 120_000);

  it("laisse voir ce qui reçoit le focus en avançant au clavier dans /employers, bandeau cookies fermé ou ouvert (A11Y-01, WCAG 2.4.11)", async () => {
    // De 1024 à 1439 px, le formulaire empile ses champs et dépasse de loin la colonne de gauche,
    // dont le dernier lien reçoit le focus avant lui.
    for (const [width, height, consent] of [[1366, 657, true], [1280, 600, true], [1366, 768, false], [1280, 720, false], [1024, 768, false]] as const) {
      const page = await open("/employers", { width, height, consent });
      expect(await page.locator(".cookie-consent-banner").count(), `${width}x${height}`).toBe(consent ? 0 : 1);
      const reached: string[] = [];
      for (let step = 0; step < 40; step++) {
        await page.keyboard.press("Tab");
        await page.evaluate(scrollSettled);
        const state = await page.evaluate(() => {
          const focused = document.activeElement as HTMLElement | null;
          const header = document.querySelector("header.site-nav")!;
          const banner = document.querySelector(".cookie-consent-banner");
          if (!focused || focused === document.body || header.contains(focused) || banner?.contains(focused)) return null;
          if (focused.closest("footer")) return { footer: true };
          const box = focused.getBoundingClientRect();
          const label = `${focused.tagName.toLowerCase()} « ${(focused.getAttribute("placeholder") || focused.textContent || "").trim().slice(0, 40)} » [${Math.round(box.top)}, ${Math.round(box.bottom)}]`;
          if (box.bottom <= 0 || box.top >= innerHeight) return { label, hidden: "hors de l'écran" };
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          if (hit && header.contains(hit)) return { label, hidden: "sous l'en-tête" };
          if (hit && banner?.contains(hit)) return { label, hidden: "sous le bandeau cookies" };
          return { label, hidden: null };
        });
        if (!state) continue;
        if ("footer" in state) break;
        reached.push(state.label);
        expect(state.hidden && `${state.label} ${state.hidden}`, `${width}x${height}, Tab n° ${step + 1}`).toBeNull();
      }
      expect(reached.some((label) => label.startsWith("a « Pourquoi choisir")), `${width}x${height}`).toBe(true);
      expect(reached.some((label) => label.startsWith("textarea")), `${width}x${height}`).toBe(true);
      await page.context().close();
    }
  }, 120_000);

  it("laisse toucher au-dessus du bandeau cookies le bouton de désinscription, le menu de langue et l'espace candidat (EN-03)", async () => {
    const token = "a".repeat(40);
    // iPhone 14, iPhone SE, Galaxy S8 ; le bandeau cookies est ouvert (aucun choix enregistré).
    for (const [width, height] of [[390, 664], [320, 568], [360, 740]] as const) {
      const page = await open(`/recruitment/unsubscribe?token=${token}`, { width, height, touch: true });
      const unsubscribeCalls: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("recruitmentPreferences.unsubscribe")) unsubscribeCalls.push(request.url());
      });
      expect(await page.locator(".cookie-consent-banner").isVisible()).toBe(true);
      await page.getByRole("button", { name: "Ne plus recevoir ces opportunités" }).tap({ timeout: 5_000 });
      await expect.poll(() => unsubscribeCalls.length, { timeout: 5_000 }).toBe(1);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.getByRole("button", { name: "Changer de langue" }).tap();
      // Essai sans effet (trial) : Playwright vérifie que le doigt atteindrait bien chaque langue.
      for (const name of ["Français", "English", "Deutsch", "中文"]) await page.getByRole("menuitem", { name }).tap({ trial: true, timeout: 5_000 });
      await page.context().close();
    }

    // L'espace candidat n'a pas de bandeau, même sans choix enregistré : rien n'y couvre les commandes (ADM-16).
    for (const route of ["/candidate/access", "/candidate/reset-password"]) {
      const page = await open(route, { width: 320, height: 568, touch: true });
      expect(await page.locator(".cookie-consent-banner, .cookie-preferences-shortcut, .whatsapp-contact-float").count(), route).toBe(0);
      expect(await page.evaluate(() => document.documentElement.hasAttribute("data-cookie-banner-open")), route).toBe(false);
      await page.context().close();
    }

    // Pages voisines sur le plus petit écran : chaque commande se fait remonter au-dessus du bandeau.
    for (const route of ["/booking/confirmation?status=canceled", "/maintenance"]) {
      const page = await open(route, { width: 320, height: 568, touch: true });
      const covered = await page.evaluate(async () => {
        const banner = document.querySelector(".cookie-consent-banner")!;
        const controls = [...document.querySelectorAll<HTMLElement>(".page-transition :is(button, a[href], input, select, textarea):not(:disabled):not(.sr-only)")].filter((element) => element.getBoundingClientRect().width > 0);
        const result: string[] = [];
        for (const control of controls) {
          control.scrollIntoView({ block: "end", behavior: "instant" });
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const box = control.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          if (hit && banner.contains(hit)) result.push(`${control.tagName.toLowerCase()} « ${(control.getAttribute("aria-label") || control.textContent || "").trim().slice(0, 40)} »`);
        }
        return { controls: controls.length, result };
      });
      expect(covered.controls, route).toBeGreaterThan(0);
      expect(covered.result, route).toEqual([]);
      await page.context().close();
    }
  }, 120_000);

  it("nomme les champs d'un brief envoyé vide, y amène le focus et les marque en erreur (A11Y-03)", async () => {
    const ids = ["employer-organizationName", "employer-contactName", "employer-email", "employer-specialtyNeeded", "employer-country"];
    for (const [language, width, message] of [
      ["fr", 1366, "À compléter ou corriger : Établissement ou entreprise, Nom du responsable, Email, Spécialité médicale ou paramédicale recherchée, Pays / Zone géographique."],
      ["en", 390, "Please complete or correct: Organization or Company, Contact Name, Professional Email, Specialty / Profession Needed, Country / Region."],
    ] as const) {
      const page = await open("/employers", { language, width, height: width < 768 ? 844 : 900, consent: true });
      await page.fill("#employer-email", "rh@clinique");
      await page.locator("main form button[type=submit]").click();
      await expect.poll(() => page.locator("main form [role=alert]").textContent(), { timeout: 5_000 }).toBe(message);
      // Focus scrolls smoothly (scroll-behavior: smooth) up to the first field.
      await page.evaluate(scrollSettled);
      const state = await page.evaluate((fieldIds) => {
        const focused = document.activeElement as HTMLElement;
        const box = focused.getBoundingClientRect();
        const headerBottom = document.querySelector("header.site-nav")!.getBoundingClientRect().bottom;
        return {
          focused: focused.id,
          visible: box.top >= headerBottom && box.bottom <= innerHeight ? true : `[${Math.round(box.top)}, ${Math.round(box.bottom)}] sous ${Math.round(headerBottom)} / ${innerHeight}`,
          fields: fieldIds.map((id) => { const field = document.getElementById(id)!; return `${id} ${field.getAttribute("aria-invalid")} ${field.classList.contains("form-field-invalid")}`; }),
        };
      }, ids);
      expect(state.focused, language).toBe("employer-organizationName");
      expect(state.visible, `${language} : premier champ visible sous l'en-tête`).toBe(true);
      expect(state.fields, language).toEqual(ids.map((id) => `${id} true true`));
      // Corrected fields leave the error state as soon as they are typed in.
      await page.keyboard.type("Clinique du Golfe");
      expect(await page.getAttribute("#employer-organizationName", "aria-invalid")).toBe("false");
      expect(await page.getAttribute("#employer-contactName", "aria-invalid")).toBe("true");
      await page.context().close();
    }
  }, 120_000);

  it("nomme les champs d'une candidature ou d'une question envoyée vide, y amène un focus visible et garde la liste au choix du CV (A11Y-03)", async () => {
    for (const { route, language, width, message, first, other } of [
      { route: "/recruitment/standard", language: "fr", width: 1366, first: "recruitment-firstName", other: "recruitment-lastName",
        message: "À compléter ou corriger : Prénom, Nom, Email, Spécialité / profession, Pays d’obtention du diplôme, Pays ciblés, CV, Consentement au traitement des données." },
      { route: "/recruitment/standard", language: "en", width: 390, first: "recruitment-firstName", other: "recruitment-lastName",
        message: "Please complete or correct: First name, Last name, Professional email, Specialty / profession, Country where the diploma was obtained, Target countries, CV, Consent to data processing." },
      { route: "/recruitment/vvip-offshore", language: "en", width: 1366, first: "vvip-firstName", other: "vvip-lastName",
        message: "Please complete or correct: First name, Last name, Professional email, Preferred Environment, Country where diploma was obtained, CV, Consent to data processing." },
      { route: "/questions-anesthesie", language: "fr", width: 390, first: "medical-question-firstName", other: "medical-question-lastName",
        message: "À compléter ou corriger : Prénom, Nom, Email, Téléphone, Votre question, Consentement au traitement de votre question, Avertissement sur les urgences." },
    ]) {
      const label = `${route} (${language}, ${width} px)`;
      // The anti-bot check is passed, as it is for most visitors before they send.
      const page = await open(route, { language, width, height: width < 768 ? 844 : 900, consent: true, turnstileToken: "test-token" });
      const submit = page.locator("main form button[type=submit]");
      await expect.poll(() => submit.isEnabled(), { timeout: 5_000 }).toBe(true);
      await submit.click();
      await expect.poll(() => page.locator("main form [role=alert]").allTextContents(), { timeout: 5_000 }).toEqual([message]);
      await page.evaluate(scrollSettled);
      const state = await page.evaluate((otherId) => {
        const focused = document.activeElement as HTMLElement;
        const other = document.getElementById(otherId)!;
        const box = focused.getBoundingClientRect();
        const headerBottom = document.querySelector("header.site-nav")!.getBoundingClientRect().bottom;
        const ring = (element: Element) => { const style = getComputedStyle(element); return `${style.outlineStyle} ${style.outlineWidth} ${style.borderColor} ${style.boxShadow}`; };
        return {
          focused: focused.id,
          invalid: [focused.getAttribute("aria-invalid"), other.getAttribute("aria-invalid")],
          visible: box.top >= headerBottom && box.bottom <= innerHeight ? true : `[${Math.round(box.top)}, ${Math.round(box.bottom)}] sous ${Math.round(headerBottom)} / ${innerHeight}`,
          focusOutline: getComputedStyle(focused).outlineStyle,
          sameLookAsOtherInvalidField: ring(focused) === ring(other),
          focusVisible: focused.matches(":focus-visible"),
        };
      }, other);
      expect(state.focused, label).toBe(first);
      expect(state.invalid, label).toEqual(["true", "true"]);
      expect(state.visible, `${label} : premier champ visible sous l'en-tête`).toBe(true);
      expect(state.focusVisible, label).toBe(true);
      // The field that has focus stands out from the other fields in error (WCAG 2.4.7).
      expect(state.focusOutline, label).toBe("solid");
      expect(state.sameLookAsOtherInvalidField, label).toBe(false);
      await page.context().close();
    }

    // A CV chosen after a refused send keeps the other fields in the alert, whether it is refused or accepted.
    const page = await open("/recruitment/standard", { language: "en", consent: true, turnstileToken: "test-token" });
    await expect.poll(() => page.locator("main form button[type=submit]").isEnabled(), { timeout: 5_000 }).toBe(true);
    await page.fill("#recruitment-firstName", "Amina");
    await page.locator("main form button[type=submit]").click();
    const alerts = () => page.locator("main form [role=alert]").allTextContents();
    await expect.poll(alerts, { timeout: 5_000 }).toEqual(["Please complete or correct: Last name, Professional email, Specialty / profession, Country where the diploma was obtained, Target countries, CV, Consent to data processing."]);
    await page.setInputFiles("#recruitment-cv", { name: "cv.doc", mimeType: "application/msword", buffer: Buffer.from("cv") });
    expect(await alerts()).toEqual(["Please complete or correct: Last name, Professional email, Specialty / profession, Country where the diploma was obtained, Target countries, Consent to data processing. Please attach a PDF or DOCX CV up to 4 MB (the legacy Word .doc format is not accepted)."]);
    await page.setInputFiles("#recruitment-cv", { name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
    expect(await alerts()).toEqual(["Please complete or correct: Last name, Professional email, Specialty / profession, Country where the diploma was obtained, Target countries, Consent to data processing."]);
    expect(await page.getAttribute("#recruitment-lastName", "aria-invalid")).toBe("true");
    await page.context().close();
  }, 120_000);

  it("signale dès son choix un CV trop lourd ou au mauvais format et traduit les spécialités (REC-04, A11Y-03)", async () => {
    const tooLarge = { name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(4 * 1024 * 1024 + 1) };
    const legacyWord = { name: "cv.doc", mimeType: "application/msword", buffer: Buffer.from("cv") };
    const accepted = { name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") };
    const alerts = (page: Awaited<ReturnType<typeof open>>) => page.locator("main form [role=alert]").allTextContents();

    const standard = await open("/recruitment/standard", { language: "en", consent: true });
    await standard.setInputFiles("#recruitment-cv", tooLarge);
    expect(await alerts(standard)).toContain("Please attach a PDF or DOCX CV up to 4 MB (the legacy Word .doc format is not accepted).");
    expect(await standard.getAttribute("#recruitment-cv", "aria-invalid")).toBe("true");
    // The size of the chosen file comes with the limit, which stays visible; one byte over it reads over it.
    expect(await standard.textContent("#recruitment-cv-hint")).toBe("4.01\u00a0MB · CV (PDF or DOCX — 4 MB maximum)");
    await standard.setInputFiles("#recruitment-cv", accepted);
    expect(await alerts(standard)).not.toContain("Please attach a PDF or DOCX CV up to 4 MB (the legacy Word .doc format is not accepted).");
    expect(await standard.getAttribute("#recruitment-cv", "aria-invalid")).toBe("false");

    await standard.getByLabel("Search a specialty…").fill("emergency");
    const options = await standard.$$eval("#recruitment-specialty option", (elements) => elements.map((option) => `${(option as HTMLOptionElement).value} → ${option.textContent}`));
    expect(options).toContain("Médecine d’urgence → Emergency medicine");
    await standard.selectOption("#recruitment-specialty", "Médecine d’urgence");
    expect(await standard.getByText("Selected: Emergency medicine").isVisible()).toBe(true);
    // "Other" opens a single field, named by a visible label, whose example is in the page language.
    await standard.getByLabel("Search a specialty…").fill("");
    await standard.selectOption("#recruitment-specialty", "Autre spécialité ou profession");
    const customSpecialty = standard.getByLabel("Specify your specialty or profession *", { exact: true });
    expect(await customSpecialty.count()).toBe(1);
    expect(await standard.getByText("Specify your specialty or profession *", { exact: true }).isVisible()).toBe(true);
    expect(await customSpecialty.getAttribute("placeholder")).toBe("e.g. Perfusionist, hearing aid specialist…");
    await standard.context().close();

    const vvip = await open("/recruitment/vvip-offshore", { language: "en", consent: true });
    await vvip.setInputFiles("#vvip-cv", legacyWord);
    expect(await alerts(vvip)).toContain("Please attach a valid PDF or DOCX CV (max 4 MB; the legacy Word .doc format is not accepted).");
    expect(await vvip.getAttribute("#vvip-cv", "aria-invalid")).toBe("true");
    await vvip.context().close();
  }, 120_000);

  it("garde masquées à l'écran les réponses repliées de la FAQ, et les imprime avec les autres (SEOP-03)", async () => {
    const page = await open("/faq", { consent: true });
    const answers = page.locator('[data-slot="accordion-content"]');
    const visible = () => answers.evaluateAll((panels) => panels.map((panel) => panel.checkVisibility()));
    const count = await answers.count();
    expect(count).toBeGreaterThan(0);
    expect(await visible()).toEqual(Array(count).fill(false));

    await page.emulateMedia({ media: "print" });
    expect(await visible()).toEqual(Array(count).fill(true));
    expect(await page.getByText(/Le tarif de base est de 100/).isVisible()).toBe(true);

    await page.emulateMedia({ media: "screen" });
    expect(await visible()).toEqual(Array(count).fill(false));
    await page.context().close();
  }, 60_000);

  /**
   * A11Y-22 : axe-core sur les pages réellement affichées, critères WCAG 2.2 A et AA. Une
   * violation « serious » ou « critical » fait échouer le test ; les « moderate » et « minor »
   * relèvent de la recette manuelle (EXTERNAL_VALIDATION_REGISTER.md). Aucune règle n'est
   * écartée : seul un élément nommé ci-dessous l'est, pour une règle, avec sa raison. Les pages
   * s'ouvrent avec un choix de cookies enregistré ; l'accueil l'est aussi sans, avec le bandeau
   * cookies de la première visite.
   */
  const AXE_ROUTES = ["/", "/booking", "/questions-anesthesie", "/recruitment", "/recruitment/standard", "/employers", "/faq", "/gdpr", "/legal", "/candidate/access"];
  const AXE_SCREENS = [...AXE_ROUTES.map((route) => ({ route, consent: true })), { route: "/", consent: false }];
  const AXE_EXCEPTIONS = [
    {
      rule: "label-content-name-mismatch",
      target: ".brand-lockup",
      reason: "Le nom du logo, « Dr. Ben Lallahom — Accueil », commence par son libellé principal (A11Y-18, WCAG 2.5.3) ; la signature « ABL / HIPPOCAMPUS » et les titres « MD, DESAIC » affichés autour, décoratifs, n'y sont pas répétés.",
    },
  ] as const;

  it("ne laisse aucune violation axe sérieuse ou critique sur les pages publiques principales, en thème clair et sombre, sur ordinateur et téléphone (A11Y-22)", async () => {
    const violations: string[] = [];
    const excepted = new Set<string>();
    for (const theme of ["light", "dark"] as const) {
      for (const [width, height, touch] of [[1366, 900, false], [390, 844, true]] as const) {
        for (const { route, consent } of AXE_SCREENS) {
          const page = await open(route, { width, height, theme, touch, consent });
          const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
          for (const violation of results.violations.filter((found) => found.impact === "serious" || found.impact === "critical")) {
            const nodes = violation.nodes.filter((node) => {
              const exception = AXE_EXCEPTIONS.find(({ rule, target }) => rule === violation.id && node.target.join(" ") === target);
              if (exception) excepted.add(`${exception.rule} ${exception.target}`);
              return !exception;
            });
            if (nodes.length) violations.push(`${route}${consent ? "" : " (bandeau cookies)"} (${theme}, ${width} px) ${violation.id} : ${nodes.slice(0, 3).map((node) => node.target.join(" ")).join(" | ")}`);
          }
          await page.context().close();
        }
      }
    }
    expect(violations).toEqual([]);
    // An exception that no longer matches anything is removed rather than kept unread.
    expect([...excepted].sort()).toEqual(AXE_EXCEPTIONS.map(({ rule, target }) => `${rule} ${target}`).sort());
  }, 300_000);

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
