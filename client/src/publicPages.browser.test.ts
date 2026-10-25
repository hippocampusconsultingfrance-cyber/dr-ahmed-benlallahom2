import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent } from "@/components/cookieConsentState";
import { contentFr } from "@/data/content-fr";

/**
 * Pages publiques dans un vrai navigateur : le client est servi par Vite et tRPC répond par des
 * données vides, sans serveur ni base. Ne tourne que si un Chromium est disponible :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/publicPages.browser.test.ts
 * sinon le Chromium installé par Playwright, puis celui du système (/usr/bin/chromium, comme
 * scripts/visual-regression.mjs, ou /usr/bin/google-chrome, présent sur les machines de la CI).
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

  /** Sans consentement enregistré (par défaut), le bandeau cookies est ouvert en bas de l'écran. */
  async function open(route: string, { width = 1440, height = 800, theme = "dark" as Theme, touch = false, consent = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
    await context.addInitScript(({ storedTheme, storedConsent }) => {
      localStorage.setItem("language", "fr");
      localStorage.setItem("theme", storedTheme);
      if (storedConsent) localStorage.setItem(storedConsent.key, storedConsent.value);
    }, { storedTheme: theme, storedConsent: consent ? { key: COOKIE_CONSENT_STORAGE_KEY, value: JSON.stringify(createCookieConsent(false)) } : null });
    const page = await context.newPage();
    await page.route("**/api/trpc/**", (request) => {
      const procedures = new URL(request.request().url()).pathname.replace(/^.*\/api\/trpc\//, "").split(",");
      return request.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(procedures.map(() => ({ result: { data: superjson.serialize(null) } }))) });
    });
    await page.route("https://challenges.cloudflare.com/**", (request) => request.abort());
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
        const page = await open("/", { width, height: width < 768 ? 844 : 900, consent: true });
        if (trigger === "hero") {
          await page.locator("#hero").getByRole("button", { name: contentFr.nav.getInTouch }).click();
        } else {
          if (width < 1536) await page.getByRole("button", { name: "Ouvrir le menu" }).click();
          const name = id === "services" ? contentFr.nav.services : contentFr.nav.contact;
          await page.locator(width < 1536 ? "#mobile-navigation" : "header nav").getByRole("button", { name, exact: true }).click();
        }
        await page.waitForFunction(() => window.scrollY > 0);
        await page.evaluate(scrollSettled);
        const landed = await page.evaluate((sectionId) => ({
          section: document.getElementById(sectionId)!.getBoundingClientRect().top,
          heading: document.querySelector(`#${sectionId} h2`)!.getBoundingClientRect().top,
          header: document.querySelector("header.site-nav")!.getBoundingClientRect().bottom,
        }), id);
        expect(landed.section, `${id} par ${trigger} à ${width} px`).toBeLessThanOrEqual(1);
        expect(landed.heading, `${id} par ${trigger} à ${width} px`).toBeGreaterThanOrEqual(landed.header);
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

  it("laisse atteindre au clavier la dernière entrée du menu mobile sur un écran peu haut, bandeau cookies fermé ou ouvert", async () => {
    // L'en-tête étant vraiment fixe (PUB-01), le menu doit défiler lui-même : sous 640 px, thème,
    // lisibilité renforcée et noir OLED n'existent que dans ce menu. Bandeau ouvert, il s'arrête
    // au-dessus (EN-03).
    for (const consent of [true, false]) {
      for (const [width, height] of [[390, 664], [360, 640], [844, 390]] as const) {
        const page = await open("/faq", { width, height, consent });
        await page.getByRole("button", { name: "Ouvrir le menu" }).click();
        const lastEntry = page.locator("#mobile-navigation nav > *").last();
        await lastEntry.focus();
        const reached = await lastEntry.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return { height: box.height, bottom: box.bottom, visible: hit !== null && element.contains(hit) };
        });
        const label = `${width}x${height}, bandeau ${consent ? "fermé" : "ouvert"}`;
        expect(reached.height, label).toBeGreaterThan(0);
        expect(reached.bottom, label).toBeLessThanOrEqual(height);
        expect(reached.visible, label).toBe(true);
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

    // Pages voisines sur le plus petit écran : chaque commande se fait remonter au-dessus du bandeau.
    for (const route of ["/candidate/access", "/candidate/reset-password", "/booking/confirmation?status=canceled", "/maintenance"]) {
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
