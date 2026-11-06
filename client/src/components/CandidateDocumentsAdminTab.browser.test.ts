import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Admin > Documents candidats dans un vrai navigateur : un nom de fichier ou un libellé « Autre
 * document » très long, sans espace, reste dans sa carte au lieu de faire défiler la page de côté,
 * et l’option « Tous » du filtre se choisit encore sur un téléphone. Le client est servi par Vite,
 * Clerk est remplacé par un administrateur déjà connecté et chaque procédure tRPC répond par des
 * données fictives. Ne tourne que si un Chromium est disponible, comme BookingPage.browser.test.ts :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/components/CandidateDocumentsAdminTab.browser.test.ts
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

const LONG_FILE_NAME = `Curriculum_Vitae_${"Dr_Amina_Haddad_anesthesie_reanimation_CHU_".repeat(3)}2026.pdf`;
const LONG_OTHER_LABEL = "Attestation_de_reussite_au_concours_de_praticien_attache_associe_session_2024_CHU_de_Lyon_service_anesthesie_reanimation_et_medecine_perioperatoire".padEnd(154, "x");

const document = (id: number, overrides: Record<string, unknown>) => ({
  id,
  candidateId: 7,
  candidateEmail: "amina.haddad.candidate.with.a.long.address@example-hospital-recruitment.test",
  firstName: "Amina",
  lastName: "Haddad",
  category: "diploma",
  categoryOtherLabel: null,
  originalName: "diplome.pdf",
  mimeType: "application/pdf",
  sizeBytes: 120_000,
  validationStatus: "passed",
  status: "needs_review",
  analysisStatus: "needs_review",
  aiSummary: null,
  aiExtractedData: null,
  aiConfidence: null,
  aiFlags: null,
  aiModel: null,
  reviewNotes: null,
  createdAt: new Date(Date.UTC(2026, 9, 1)),
  analyzedAt: null,
  ...overrides,
});

type Procedure = (input: any) => unknown;

describe.skipIf(!executablePath)("Documents candidats de l’admin dans un navigateur", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||= "pk_test_browser_stub";
    const stubDir = path.join(root, "node_modules/.vite/candidate-documents-admin-browser-test-stubs");
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(path.join(stubDir, "clerk-react.js"), CLERK_STUB);
    server = await createServer({
      configFile: path.join(root, "vite.config.ts"),
      cacheDir: path.join(root, "node_modules/.vite/candidate-documents-admin-browser-test"),
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

  async function openDocuments(width: number, language: string): Promise<{ page: Page; listInputs: unknown[] }> {
    const listInputs: unknown[] = [];
    const procedures: Record<string, Procedure> = {
      "auth.me": () => ({ id: 1, openId: "user_owner", name: "Dr Test", email: "owner@test.local", role: "admin", mfaVerified: true }),
      "adminSecurity.status": () => ({ verified: true }),
      "admin.candidateDocuments.list": (input) => {
        listInputs.push(input);
        return [
          document(1, { originalName: LONG_FILE_NAME }),
          document(2, { category: "other", categoryOtherLabel: LONG_OTHER_LABEL, originalName: "attestation.pdf" }),
        ];
      },
    };
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
    await context.addInitScript((storedLanguage) => localStorage.setItem("language", storedLanguage), language);
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
    if (await page.locator("#admin-active-tab").isVisible()) await page.locator("#admin-active-tab").selectOption("candidateDocuments");
    else await page.getByRole("button", { name: "Documents candidats" }).click();
    await page.getByText(LONG_FILE_NAME, { exact: false }).waitFor({ timeout: 30_000 });
    return { page, listInputs };
  }

  it.each([
    [412, "en"],
    [360, "fr"],
    [1440, "fr"],
  ])("à %i px (%s), un nom de fichier et un libellé très longs restent dans leur carte, sans défilement horizontal, et « Tous » se choisit", async (width, language) => {
    const { page, listInputs } = await openDocuments(width, language);
    const layout = await page.evaluate(({ name, label }) => {
      const text = (needle: string) => Array.from(document.querySelectorAll("[data-slot='card-title'], [data-slot='card-description']")).find((element) => element.textContent?.includes(needle))!;
      const within = (element: Element) => element.getBoundingClientRect().right <= (element.closest("[data-slot='card']")?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY) + 0.5;
      return {
        pageWidth: document.documentElement.scrollWidth,
        nameInCard: within(text(name)),
        labelInCard: within(text(label)),
        nameRight: text(name).getBoundingClientRect().right,
        labelRight: text(label).getBoundingClientRect().right,
      };
    }, { name: LONG_FILE_NAME, label: LONG_OTHER_LABEL });
    // On a phone, a page wider than the screen also widens the window (innerWidth): measured against the screen's width.
    expect(layout.pageWidth).toBeLessThanOrEqual(width);
    expect(layout).toMatchObject({ nameInCard: true, labelInCard: true });
    expect(Math.max(layout.nameRight, layout.labelRight)).toBeLessThanOrEqual(width);

    const all = language === "en" ? "All" : "Tous";
    await page.locator("#candidate-document-filter").click();
    await page.getByRole("option", { name: all }).click();
    await expect.poll(() => listInputs.some((input) => (input as { status?: string } | undefined)?.status === undefined)).toBe(true);
    expect(await page.locator("#candidate-document-filter").textContent()).toContain(all);
    await page.context().close();
  }, 60_000);
});
