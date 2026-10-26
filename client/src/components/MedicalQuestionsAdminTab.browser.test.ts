import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Admin > Questions santé dans un vrai navigateur (ADM-01) : sur mobile, toucher une question
 * amène son détail à l'écran et y place le focus ; sur un bureau, ni la page ni le focus ne
 * bougent. Le client est servi par Vite, Clerk est remplacé par un administrateur déjà connecté
 * et chaque procédure tRPC répond par des données fictives. Ne tourne que si un Chromium est
 * disponible, comme BookingPage.browser.test.ts :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/components/MedicalQuestionsAdminTab.browser.test.ts
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

const TOTAL = 60;
const question = (id: number) => ({
  id,
  trackingId: `QMED-BROWSER${String(id).padStart(2, "0")}-00000`,
  firstName: "Jeanne",
  lastName: `Patiente${id}`,
  email: `p${id}@test.local`,
  phone: "+33600000000",
  question: "Peut-on boire de l’eau avant une anesthésie ?",
  status: "submitted",
  createdAt: new Date(Date.UTC(2026, 7, 1, 8, id)),
  publicationConsent: 0,
  adminResponse: null,
  publicQuestion: null,
  publicResponse: null,
  responseSentAt: null,
});

type Procedure = (input: any) => unknown;
const procedures: Record<string, Procedure> = {
  "auth.me": () => ({ id: 1, openId: "user_owner", name: "Dr Test", email: "owner@test.local", role: "admin", mfaVerified: true }),
  "adminSecurity.status": () => ({ verified: true }),
  "medicalQuestions.admin.list": ({ offset, limit }) => ({
    items: Array.from({ length: Math.max(0, Math.min(limit, TOTAL - offset)) }, (_, index) => question(offset + index + 1)),
    total: TOTAL,
  }),
  "medicalQuestions.admin.get": ({ id }) => question(id),
};

describe.skipIf(!executablePath)("Questions santé de l’admin dans un navigateur", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||= "pk_test_browser_stub";
    const stubDir = path.join(root, "node_modules/.vite/medical-questions-admin-browser-test-stubs");
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(path.join(stubDir, "clerk-react.js"), CLERK_STUB);
    server = await createServer({
      configFile: path.join(root, "vite.config.ts"),
      cacheDir: path.join(root, "node_modules/.vite/medical-questions-admin-browser-test"),
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

  async function openMedicalQuestions(contextOptions: BrowserContextOptions): Promise<Page> {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.route((url) => !url.href.startsWith(baseUrl), (request) => request.abort());
    await page.route("**/api/trpc/**", async (request) => {
      const url = new URL(request.request().url());
      const names = url.pathname.replace(/^.*\/api\/trpc\//, "").split(",");
      const rawInput = request.request().method() === "GET" ? url.searchParams.get("input") : request.request().postData();
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
      return request.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Administration" }).waitFor({ timeout: 30_000 });
    if (await page.locator("#admin-active-tab").isVisible()) await page.locator("#admin-active-tab").selectOption("medicalQuestions");
    else await page.getByRole("button", { name: "Questions santé" }).click();
    await page.getByText(`50 sur ${TOTAL} question(s)`).waitFor();
    return page;
  }

  const detail = (page: Page) => page.getByRole("region", { name: "Question sélectionnée" });

  it("sur mobile, amène le détail de la question touchée à l’écran, sous l’en-tête, et y place le focus", async () => {
    const page = await openMedicalQuestions({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 });
    const card = page.getByRole("button", { name: /Patiente40\b/ });
    await card.scrollIntoViewIfNeeded();
    await card.tap();

    await detail(page).getByRole("heading", { name: "Jeanne Patiente40" }).waitFor();
    await page.waitForFunction(() => {
      const region = document.querySelector('[aria-label="Question sélectionnée"]')!;
      const top = region.getBoundingClientRect().top;
      return top >= document.querySelector("header")!.getBoundingClientRect().bottom && top < window.innerHeight / 2;
    }, undefined, { timeout: 5_000 });
    expect(await detail(page).evaluate((region) => document.activeElement === region)).toBe(true);
    await page.context().close();
  }, 60_000);

  it("sur un bureau, laisse la page et le focus là où ils sont : le détail est déjà à côté de la liste", async () => {
    const page = await openMedicalQuestions({ viewport: { width: 1440, height: 900 } });
    await page.mouse.wheel(0, 400);
    await page.waitForFunction(() => window.scrollY > 0);
    const scrolled = await page.evaluate(() => window.scrollY);
    const card = page.getByRole("button", { name: /Patiente5\b/ });
    await card.click();

    await detail(page).getByRole("heading", { name: "Jeanne Patiente5" }).waitFor();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    expect(await card.evaluate((button) => document.activeElement === button)).toBe(true);
    await page.context().close();
  }, 60_000);
});
