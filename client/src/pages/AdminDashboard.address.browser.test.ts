import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Le tableau de bord dans un vrai navigateur. ADM-09 : la section et l’élément
 * vivent dans l’adresse (/admin?tab=…&ref=…) ; le lien d’une notification
 * ouvre la section sur l’élément, une actualisation les garde, et le bouton
 * Retour revient à la section précédente. ADM-08 : sur un ordinateur, les
 * treize onglets passent à la ligne au lieu de sortir de l’écran. Le client est
 * servi par Vite, Clerk est remplacé par un administrateur déjà connecté et
 * chaque procédure tRPC répond par des données fictives. Ne tourne que si un
 * Chromium est disponible, comme AdminDashboard.gdpr.browser.test.ts :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/pages/AdminDashboard.address.browser.test.ts
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

const REFERENCE = "CBROWSERREF01";
const message = (id: number, trackingId: string) => ({
  id, trackingId, name: `Expéditeur ${id}`, email: `expediteur${id}@test.local`, phone: null, message: "Bonjour", gdprConsent: 1, read: 0,
  createdAt: new Date(Date.UTC(2026, 9, 1, 8, id)),
});

/** A fake procedure: its input is the one the page sent, of the shape the procedure declares. */
type Procedure = (input: never) => unknown;
const searches: Array<string | undefined> = [];
const procedures: Record<string, Procedure> = {
  "auth.me": () => ({ id: 1, openId: "user_owner", name: "Dr Test", email: "owner@test.local", role: "admin", mfaVerified: true }),
  "adminSecurity.status": () => ({ verified: true }),
  // The server's search: the reference finds its message alone.
  "admin.contacts.list": ({ search }: { search?: string }) => {
    searches.push(search);
    const items = [message(1, REFERENCE), message(2, "COTHERMSG0002")].filter((item) => !search || item.trackingId === search);
    return { items, total: items.length };
  },
  "admin.gdprRequests.list": () => ({ items: [], total: 0 }),
};

describe.skipIf(!executablePath)("adresse et onglets de l’admin dans un navigateur", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||= "pk_test_browser_stub";
    const stubDir = path.join(root, "node_modules/.vite/admin-address-browser-test-stubs");
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(path.join(stubDir, "clerk-react.js"), CLERK_STUB);
    server = await createServer({
      configFile: path.join(root, "vite.config.ts"),
      cacheDir: path.join(root, "node_modules/.vite/admin-address-browser-test"),
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

  async function openAdmin(address: string, contextOptions: BrowserContextOptions): Promise<Page> {
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
          // Les autres sections ne servent pas ici : elles affichent leur état d'erreur.
          status = 500;
          return { error: superjson.serialize({ message: "Hors du test", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: name } }) };
        }
        return { result: { data: superjson.serialize(procedures[name]((inputs[index] ? superjson.deserialize(inputs[index]) : {}) as never)) } };
      });
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(`${baseUrl}${address}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Administration" }).waitFor({ timeout: 30_000 });
    return page;
  }

  const currentTab = (page: Page) => page.locator('nav [aria-current="page"]').innerText();

  it("ouvre depuis le lien d’une notification la section sur son élément, le garde à l’actualisation et revient en arrière d’une section", async () => {
    searches.length = 0;
    const page = await openAdmin(`/admin?tab=contacts&ref=${REFERENCE}`, { viewport: { width: 1366, height: 768 } });
    await page.getByText("Expéditeur 1", { exact: true }).waitFor();
    expect(await currentTab(page)).toBe("Messages");
    expect(await page.locator("#contacts-search").inputValue()).toBe(REFERENCE);
    expect(await page.getByText("Expéditeur 2", { exact: true }).count()).toBe(0);
    // Searched at once: the full list is never asked for first.
    expect(searches).not.toContain(undefined);

    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Expéditeur 1", { exact: true }).waitFor();
    expect(await currentTab(page)).toBe("Messages");
    expect(await page.locator("#contacts-search").inputValue()).toBe(REFERENCE);

    await page.getByRole("button", { name: "RGPD", exact: true }).click();
    await page.waitForURL(`${baseUrl}/admin?tab=gdpr`);
    expect(await currentTab(page)).toBe("RGPD");

    await page.goBack();
    await page.waitForURL(`${baseUrl}/admin?tab=contacts&ref=${REFERENCE}`);
    await page.getByText("Expéditeur 1", { exact: true }).waitFor();
    expect(await currentTab(page)).toBe("Messages");
    expect(await page.locator("#contacts-search").inputValue()).toBe(REFERENCE);

    // The open section chosen again leaves the element: the whole list.
    await page.getByRole("button", { name: "Messages", exact: true }).click();
    await page.waitForURL(`${baseUrl}/admin?tab=contacts`);
    await page.getByText("Expéditeur 2", { exact: true }).waitFor();
    expect(await page.locator("#contacts-search").inputValue()).toBe("");
    await page.context().close();
  }, 60_000);

  it("ouvre la vue d’ensemble pour une section inconnue, et n’y reprend aucune référence d’une autre forme", async () => {
    const page = await openAdmin("/admin?tab=inconnue&ref=jeanne%40example.test", { viewport: { width: 1366, height: 768 } });
    expect(await currentTab(page)).toBe("Vue d'ensemble");
    await page.getByRole("button", { name: "Messages", exact: true }).click();
    await page.waitForURL(`${baseUrl}/admin?tab=contacts`);
    expect(await page.locator("#contacts-search").inputValue()).toBe("");
    await page.context().close();
  }, 60_000);

  for (const width of [1440, 1280, 1024, 768]) {
    it(`à ${width} px, montre les treize onglets dans l’écran, sans défilement horizontal`, async () => {
      const page = await openAdmin("/admin", { viewport: { width, height: 900 } });
      const layout = await page.evaluate(() => {
        const bar = document.querySelector('[aria-label="Navigation des sections d’administration"]') as HTMLElement;
        const tabs = Array.from(bar.querySelectorAll("button")).map((button) => button.getBoundingClientRect());
        return {
          tabs: tabs.length,
          outside: tabs.filter((rect) => rect.left < 0 || rect.right > window.innerWidth || rect.width === 0).length,
          barOverflows: bar.scrollWidth > bar.clientWidth,
          pageOverflows: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      expect(layout).toEqual({ tabs: 13, outside: 0, barOverflows: false, pageOverflows: false });
      await page.context().close();
    }, 60_000);
  }
});
