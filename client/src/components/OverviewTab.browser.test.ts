import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Admin > Vue d'ensemble dans un vrai navigateur (ADM-06) : chaque texte des cartes « Au quotidien »
 * et « Indicateurs », dont l'échéance RGPD proche (ambre) ou dépassée (rouge), se lit sur sa carte
 * dans le thème sombre (celui par défaut) comme dans le thème clair. Le client est servi par Vite,
 * Clerk est remplacé par un administrateur déjà connecté et chaque procédure tRPC répond par des
 * données fictives. Ne tourne que si un Chromium est disponible, comme BookingPage.browser.test.ts :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/components/OverviewTab.browser.test.ts
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

/** Administrateur déjà connecté : seules les fonctions de @clerk/react utilisées par l'admin. */
const CLERK_STUB = `
export const ClerkProvider = ({ children }) => children;
export const SignInButton = ({ children }) => children;
export const UserButton = () => null;
export const useAuth = () => ({ isLoaded: true, isSignedIn: true });
export const useClerk = () => ({ signOut: async () => undefined });
`;

const DAY_MS = 24 * 60 * 60 * 1000;
/** The GDPR deadline the overview shows, set before each page. */
let gdprDeadlineInDays = 3;

/** A fake procedure: its input is the one the page sent, of the shape the procedure declares. */
type Procedure = (input: never) => unknown;
const procedures: Record<string, Procedure> = {
  "auth.me": () => ({
    id: 1,
    openId: "user_owner",
    name: "Dr Test",
    email: "owner@test.local",
    role: "admin",
    mfaVerified: true,
  }),
  "adminSecurity.status": () => ({ verified: true }),
  "system.configurationStatus": () => ({
    ok: true,
    missing: [],
    enforced: true,
    warnings: [],
  }),
  "admin.stats": () => ({
    appointments: {
      today: 3,
      tomorrow: 1,
      upcomingWeek: { count: 9, lastDay: "2026-11-13" },
    },
    medicalQuestions: {
      open: 4,
      oldestReceivedAt: new Date(Date.now() - 6 * DAY_MS),
      recentAnswers: { count: 12, averageResponseMs: 2.5 * DAY_MS },
    },
    unreadMessages: 7,
    gdprRequests: {
      open: 2,
      nextDeadline: new Date(Date.now() + gdprDeadlineInDays * DAY_MS),
    },
    documentsToReview: 2,
    applications: { new: 5, lastWeek: 4, lastFourWeeks: 10 },
    bookingConversion: { started: 29, paid: 18 },
    revenue: {
      currentMonth: { month: "2026-11", amount: "17750.00" },
      previousMonth: { month: "2026-10", amount: "1250.50" },
    },
  }),
};

type ShownText = {
  text: string;
  color: [number, number, number];
  background: [number, number, number];
};

describe.skipIf(!executablePath)(
  "Vue d’ensemble de l’administration dans un navigateur",
  () => {
    let server: ViteDevServer;
    let browser: Browser;
    let baseUrl: string;

    beforeAll(async () => {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||= "pk_test_browser_stub";
      const stubDir = path.join(
        root,
        "node_modules/.vite/overview-tab-browser-test-stubs"
      );
      mkdirSync(stubDir, { recursive: true });
      writeFileSync(path.join(stubDir, "clerk-react.js"), CLERK_STUB);
      server = await createServer({
        configFile: path.join(root, "vite.config.ts"),
        cacheDir: path.join(
          root,
          "node_modules/.vite/overview-tab-browser-test"
        ),
        resolve: {
          alias: [
            {
              find: /^@clerk\/react$/,
              replacement: path.join(stubDir, "clerk-react.js"),
            },
          ],
        },
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
    });

    async function openOverview(theme: "dark" | "light" | null): Promise<Page> {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      // No stored choice: the site's default theme, dark.
      if (theme)
        await context.addInitScript(
          stored => localStorage.setItem("theme", stored),
          theme
        );
      const page = await context.newPage();
      await page.route(
        url => !url.href.startsWith(baseUrl),
        request => request.abort()
      );
      await page.route("**/api/trpc/**", async request => {
        const url = new URL(request.request().url());
        const names = url.pathname.replace(/^.*\/api\/trpc\//, "").split(",");
        let status = 200;
        const body = names.map(name => {
          if (!procedures[name]) {
            // Les autres panneaux ne servent pas ici : ils affichent leur état d'erreur.
            status = 500;
            return {
              error: superjson.serialize({
                message: "Hors du test",
                code: -32603,
                data: {
                  code: "INTERNAL_SERVER_ERROR",
                  httpStatus: 500,
                  path: name,
                },
              }),
            };
          }
          return {
            result: {
              data: superjson.serialize(procedures[name](undefined as never)),
            },
          };
        });
        return request.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      });
      await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
      await page
        .getByRole("heading", { name: "Indicateurs" })
        .waitFor({ timeout: 30_000 });
      return page;
    }

    /** Each text of the overview's cards (not the decorative arrows) with its colour and the colour under it. */
    function cardTexts(page: Page): Promise<ShownText[]> {
      return page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        const paint = (colors: string[]) => {
          context.globalCompositeOperation = "copy";
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, 1, 1);
          context.globalCompositeOperation = "source-over";
          for (const color of colors) {
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
          }
          const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
          return [red, green, blue] as [number, number, number];
        };
        const sections = [
          ...document.querySelectorAll(
            '[aria-labelledby="overview-follow-ups-title"], [aria-labelledby="overview-indicators-title"]'
          ),
        ];
        const elements = sections
          .flatMap(section => [...section.querySelectorAll("button *")])
          .filter(
            element =>
              !element.closest('[aria-hidden="true"]') &&
              [...element.childNodes].some(
                node =>
                  node.nodeType === Node.TEXT_NODE && node.textContent!.trim()
              ) &&
              element.getClientRects().length > 0
          );
        return elements.map(element => {
          const backgrounds: string[] = [];
          for (
            let node: Element | null = element;
            node;
            node = node.parentElement
          )
            backgrounds.unshift(getComputedStyle(node).backgroundColor);
          return {
            text: [...element.childNodes]
              .filter(node => node.nodeType === Node.TEXT_NODE)
              .map(node => node.textContent)
              .join("")
              .trim(),
            color: paint([...backgrounds, getComputedStyle(element).color]),
            background: paint(backgrounds),
          };
        });
      });
    }

    const luminance = ([red, green, blue]: [number, number, number]) => {
      const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
      );
    };
    const contrast = ({ color, background }: ShownText) => {
      const [light, dark] = [luminance(color), luminance(background)].sort(
        (a, b) => b - a
      );
      return (light + 0.05) / (dark + 0.05);
    };

    it.each([
      ["sombre (par défaut)", "Échéance proche", null, 3],
      ["sombre (par défaut)", "Échéance dépassée", null, -3],
      ["clair", "Échéance proche", "light", 3],
      ["clair", "Échéance dépassée", "light", -3],
    ] as const)(
      "thème %s : chaque texte des cartes se lit, « %s » compris",
      async (_label, gdprText, theme, deadlineInDays) => {
        gdprDeadlineInDays = deadlineInDays;
        const page = await openOverview(theme);
        expect(
          await page.evaluate(() =>
            document.documentElement.classList.contains("dark")
          )
        ).toBe(theme !== "light");
        const texts = await cardTexts(page);
        const shown = texts.map(({ text }) => text).join(" | ");
        for (const expected of [
          gdprText,
          "Rendez-vous aujourd’hui",
          "Nouvelles candidatures",
          "Conversion des réservations · 30 jours",
          "Délai moyen de réponse aux questions · 30 jours",
        ]) {
          expect(shown).toContain(expected);
        }
        for (const text of texts) {
          expect({ text: text.text, contrast: contrast(text) >= 4.5 }).toEqual({
            text: text.text,
            contrast: true,
          });
        }
        await page.context().close();
      },
      60_000
    );
  }
);
