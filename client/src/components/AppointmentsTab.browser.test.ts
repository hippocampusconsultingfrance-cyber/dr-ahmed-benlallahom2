import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Admin > Réservations imprimé dans un vrai navigateur (ADM-18) : l'agenda des consultations se lit
 * sur papier dans le thème sombre (celui par défaut) comme dans le thème clair, chaque texte de
 * l'agenda contrastant avec le fond qui s'imprime vraiment sous lui, et rien d'autre de l'onglet ne
 * s'imprime. Le client est servi par Vite, Clerk est remplacé par un administrateur déjà connecté et
 * chaque procédure tRPC répond par des données fictives. Ne tourne que si un Chromium est
 * disponible, comme BookingPage.browser.test.ts :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/components/AppointmentsTab.browser.test.ts
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

/** Three paid consultations over the agenda's first days, one of them already done. */
const consultation = (
  from: string,
  id: number,
  dayOffset: number,
  appointmentStatus: string
) => {
  const [year, month, day] = from.split("-").map(Number);
  return {
    id,
    trackingId: `APTPRINT000${id}`,
    customerName: `Patient ${id}`,
    customerPhone: "+33600000000",
    appointmentDate: new Date(
      Date.UTC(year, month - 1, day + dayOffset, 9, 30)
    ),
    duration: 30,
    appointmentStatus,
    language: "fr",
  };
};

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
    ok: false,
    missing: ["RESEND_WEBHOOK_SECRET"],
  }),
  "admin.appointments.list": () => ({ items: [], total: 0 }),
  "admin.appointments.agenda": ({ from }: { from: string }) => ({
    items: [
      consultation(from, 1, 0, "completed"),
      consultation(from, 2, 1, "confirmed"),
      consultation(from, 3, 2, "no_show"),
    ],
    truncated: false,
  }),
};

type PrintedText = {
  text: string;
  color: [number, number, number];
  background: [number, number, number];
};

describe.skipIf(!executablePath)("Agenda des consultations imprimé", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||= "pk_test_browser_stub";
    const stubDir = path.join(
      root,
      "node_modules/.vite/appointments-tab-browser-test-stubs"
    );
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(path.join(stubDir, "clerk-react.js"), CLERK_STUB);
    server = await createServer({
      configFile: path.join(root, "vite.config.ts"),
      cacheDir: path.join(
        root,
        "node_modules/.vite/appointments-tab-browser-test"
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
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  async function printAppointmentsTab(
    theme: "dark" | "light" | null
  ): Promise<Page> {
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
      const rawInput =
        request.request().method() === "GET"
          ? url.searchParams.get("input")
          : request.request().postData();
      const inputs = rawInput ? JSON.parse(rawInput) : {};
      let status = 200;
      const body = names.map((name, index) => {
        if (!procedures[name]) {
          // Les autres onglets ne servent pas ici : ils affichent leur état d'erreur.
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
            data: superjson.serialize(
              procedures[name](
                (inputs[index]
                  ? superjson.deserialize(inputs[index])
                  : undefined) as never
              )
            ),
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
      .getByRole("heading", { name: "Administration" })
      .waitFor({ timeout: 30_000 });
    await page
      .getByRole("button", { name: "Réservations", exact: true })
      .click();
    const agenda = page.getByRole("region", {
      name: "Agenda des consultations",
    });
    await agenda.getByText("Patient 3").waitFor({ timeout: 30_000 });
    await page
      .getByRole("alert")
      .filter({ hasText: "Configuration de production incomplète" })
      .waitFor();
    await page.emulateMedia({ media: "print" });
    return page;
  }

  /**
   * Each text of the agenda with its colour and the colour printed under it: every background
   * from the page to the text, painted in turn on white paper as print-color-adjust prints them.
   */
  function printedTexts(page: Page): Promise<PrintedText[]> {
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
      const agenda = document.querySelector(
        '[aria-labelledby="appointments-agenda-title"]'
      )!;
      const elements = [agenda, ...agenda.querySelectorAll("*")].filter(
        element =>
          [...element.childNodes].some(
            node => node.nodeType === Node.TEXT_NODE && node.textContent!.trim()
          ) && element.getClientRects().length > 0
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
  const contrast = ({ color, background }: PrintedText) => {
    const [light, dark] = [luminance(color), luminance(background)].sort(
      (a, b) => b - a
    );
    return (light + 0.05) / (dark + 0.05);
  };

  it.each([
    ["sombre (par défaut)", null],
    ["clair", "light"],
  ] as const)(
    "thème %s : chaque texte de l’agenda imprimé se lit sur un fond clair, et lui seul s’imprime",
    async (_label, theme) => {
      const page = await printAppointmentsTab(theme);
      expect(
        await page.evaluate(() =>
          document.documentElement.classList.contains("dark")
        )
      ).toBe(theme !== "light");
      const texts = await printedTexts(page);
      const shown = texts.map(({ text }) => text).join(" | ");
      // The title, the period, each day's title and each patient's line, status included.
      for (const expected of [
        "Agenda des consultations",
        "Consultations payées",
        "Patient 1",
        "Patient 2",
        "Patient 3",
        "APTPRINT0003",
        "Confirmé",
        "Terminé",
        "Absent",
      ]) {
        expect(shown).toContain(expected);
      }
      expect(
        texts.filter(({ text }) =>
          /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) /i.test(text)
        )
      ).toHaveLength(3);
      for (const text of texts) {
        expect({ text: text.text, contrast: contrast(text) >= 4.5 }).toEqual({
          text: text.text,
          contrast: true,
        });
        // Paper, not a dark page: what prints under the text stays light.
        expect({
          text: text.text,
          background: luminance(text.background) > 0.8,
        }).toEqual({ text: text.text, background: true });
      }
      // The period buttons, the list, its filters, the Stripe refund form and the configuration alert stay on screen.
      await expect(
        page.getByRole("button", { name: "7 jours" }).isVisible()
      ).resolves.toBe(false);
      await expect(
        page
          .getByRole("group", { name: "Filtrer les réservations" })
          .isVisible()
      ).resolves.toBe(false);
      await expect(
        page
          .getByRole("heading", { name: "Rembourser un paiement non confirmé" })
          .isVisible()
      ).resolves.toBe(false);
      await expect(
        page.getByText("Configuration de production incomplète").isVisible()
      ).resolves.toBe(false);
      // Three consultations on a single A4 sheet, with no blank page before or after them, once the
      // print fonts have loaded (a capture taken while they load is laid out twice).
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const pdf = (await page.pdf({ format: "A4" })).toString("latin1");
      expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
      await page.context().close();
    },
    60_000
  );
});
