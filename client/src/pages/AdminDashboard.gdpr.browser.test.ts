import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Admin > RGPD dans un vrai navigateur (RGPD-12) : « Ses données » sur une demande en bas de la
 * liste amène la recherche de la personne sous l'en-tête collant, place le focus sur son titre
 * et annonce les résultats, sur mobile comme sur un bureau. Le client est servi par Vite, Clerk
 * est remplacé par un administrateur déjà connecté et chaque procédure tRPC répond par des
 * données fictives. Ne tourne que si un Chromium est disponible, comme BookingPage.browser.test.ts :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/pages/AdminDashboard.gdpr.browser.test.ts
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

/** Administrateur déjà connecté : seules les fonctions de @clerk/react utilisées par l'admin. */
const CLERK_STUB = `
export const ClerkProvider = ({ children }) => children;
export const SignInButton = ({ children }) => children;
export const UserButton = () => null;
export const useAuth = () => ({ isLoaded: true, isSignedIn: true });
export const useClerk = () => ({ signOut: async () => undefined });
`;

const TOTAL = 30;
const request = (id: number) => ({
  id,
  trackingId: `GDPR-BROWSER-${String(id).padStart(2, "0")}`,
  name: `Demandeur ${id}`,
  email: `demandeur${id}@test.local`,
  phone: null,
  requestType: "access",
  description: "Merci de me transmettre mes données.",
  status: "pending",
  notes: null,
  responseDate: null,
  read: 0,
  createdAt: new Date(Date.UTC(2026, 9, 1, 8, id)),
  updatedAt: new Date(Date.UTC(2026, 9, 1, 8, id)),
});

type Procedure = (input: any) => unknown;
const procedures: Record<string, Procedure> = {
  "auth.me": () => ({ id: 1, openId: "user_owner", name: "Dr Test", email: "owner@test.local", role: "admin", mfaVerified: true }),
  "adminSecurity.status": () => ({ verified: true }),
  "admin.gdprRequests.list": ({ offset, limit }) => ({
    items: Array.from({ length: Math.max(0, Math.min(limit, TOTAL - offset)) }, (_, index) => request(offset + index + 1)),
    total: TOTAL,
  }),
  "admin.personalData.find": ({ email }) => ({
    email,
    contactMessages: [{ id: 1, trackingId: "CBROWSER0001", name: "Demandeur", email, phone: null, message: "Bonjour", gdprConsent: 1, read: 1, createdAt: new Date(Date.UTC(2026, 8, 1)) }],
    medicalQuestions: [],
    gdprRequests: [{ ...request(25), email }],
    appointments: [],
    recruitment: { applications: [], candidateAccountWithoutApplication: false },
    totals: { contactMessages: 1, medicalQuestions: 0, gdprRequests: 1, appointments: 0, recruitmentApplications: 0 },
    erasableRows: 1,
  }),
};

describe.skipIf(!executablePath)("Demandes RGPD de l’admin dans un navigateur", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||= "pk_test_browser_stub";
    const stubDir = path.join(root, "node_modules/.vite/gdpr-admin-browser-test-stubs");
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(path.join(stubDir, "clerk-react.js"), CLERK_STUB);
    server = await createServer({
      configFile: path.join(root, "vite.config.ts"),
      cacheDir: path.join(root, "node_modules/.vite/gdpr-admin-browser-test"),
      resolve: { alias: [{ find: /^@clerk\/react$/, replacement: path.join(stubDir, "clerk-react.js") }] },
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

  async function openGdprRequests(contextOptions: BrowserContextOptions): Promise<Page> {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    await page.route("**/api/trpc/**", async (route) => {
      const url = new URL(route.request().url());
      const names = url.pathname.replace(/^.*\/api\/trpc\//, "").split(",");
      const rawInput = route.request().method() === "GET" ? url.searchParams.get("input") : route.request().postData();
      const inputs = rawInput ? JSON.parse(rawInput) : {};
      let status = 200;
      const body = names.map((name, index) => {
        if (!procedures[name]) {
          // Les autres onglets ne servent pas ici : ils affichent leur état d'erreur.
          status = 500;
          return { error: superjson.serialize({ message: "Hors du test", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: name } }) };
        }
        return { result: { data: superjson.serialize(procedures[name](inputs[index] ? superjson.deserialize(inputs[index]) : undefined)) } };
      });
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Administration" }).waitFor({ timeout: 30_000 });
    if (await page.locator("#admin-active-tab").isVisible()) await page.locator("#admin-active-tab").selectOption("gdpr");
    else await page.getByRole("button", { name: "RGPD", exact: true }).click();
    await page.getByText("Demandeur 25", { exact: true }).waitFor();
    return page;
  }

  async function openPersonalDataFromRequest(page: Page) {
    const button = page.getByRole("button", { name: "Ses données" }).nth(24);
    await button.scrollIntoViewIfNeeded();
    await button.click();

    // The focus moves to the panel's title, which is read out first…
    await page.waitForFunction(() => document.activeElement?.id === "personal-data-search-title", undefined, { timeout: 5_000 });
    // …then the results, once found.
    await page.waitForFunction(
      () => document.querySelector('#personal-data-search > [role="status"]')?.textContent === "2 élément(s) enregistré(s) pour demandeur25@test.local.",
      undefined,
      { timeout: 5_000 },
    );
    // The page scrolls smoothly (scroll-behavior): read the position once it has stopped.
    await page.waitForFunction(() => {
      const top = document.getElementById("personal-data-search-title")!.getBoundingClientRect().top;
      return top >= document.querySelector("header")!.getBoundingClientRect().bottom && top < window.innerHeight / 2;
    }, undefined, { timeout: 5_000 });
    await page.waitForTimeout(400);
    const position = await page.evaluate(() => ({
      titleTop: document.getElementById("personal-data-search-title")!.getBoundingClientRect().top,
      headerBottom: document.querySelector("header")!.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
    }));
    expect(await page.locator("#personal-data-email").inputValue()).toBe("demandeur25@test.local");
    return position;
  }

  it("sur mobile, amène la recherche sous l’en-tête, place le focus sur son titre et annonce les résultats", async () => {
    const page = await openGdprRequests({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 });
    const position = await openPersonalDataFromRequest(page);
    expect(position.titleTop).toBeGreaterThanOrEqual(position.headerBottom);
    expect(position.titleTop).toBeLessThan(position.viewportHeight / 2);
    await page.context().close();
  }, 60_000);

  it("sur un bureau, fait de même", async () => {
    const page = await openGdprRequests({ viewport: { width: 1366, height: 768 } });
    const position = await openPersonalDataFromRequest(page);
    expect(position.scrollY).toBeGreaterThan(0);
    expect(position.titleTop).toBeGreaterThanOrEqual(position.headerBottom);
    expect(position.titleTop).toBeLessThan(position.viewportHeight / 2);
    await page.context().close();
  }, 60_000);
});
