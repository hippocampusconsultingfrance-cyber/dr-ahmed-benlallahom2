import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Admin > Candidatures dans un vrai navigateur (EXPL-02) : sur un téléphone, la ligne « Fichier : »
 * d'une candidature dépliée passe à la ligne au lieu d'élargir toute la page quand le nom du CV
 * stocké est long et sans espace, comme les autres champs saisis par le candidat (message,
 * certifications, disponibilité, mobilité). Le client est servi par Vite, Clerk est remplacé par un
 * administrateur déjà connecté et chaque procédure tRPC répond par des données fictives. Ne tourne
 * que si un Chromium est disponible, comme BookingPage.browser.test.ts :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/components/RecruitmentTab.browser.test.ts
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

/** A stored CV name as safeFileName leaves it: accented letters turned into _, no space, 180 characters with the extension. */
const STORED_CV_NAME = `${"CV_Dr_H_l_ne_B_r_nice_Lef_vre_Anesth_sie_R_animation_".repeat(4).slice(0, 176)}.pdf`;

const application = {
  id: 1, trackingId: "CV-2026-000001", firstName: "Hélène", lastName: "Bérénice", email: "helene.berenice@test.local", phone: null, specialty: "Anesthésie-réanimation",
  targetCountries: "[\"France\"]", languages: "[\"Français\"]", diplomaCountry: null, availability: null, mobility: null, certifications: null, yearsExperience: 8, message: null,
  status: "new", adminNotes: null, language: "fr", aiScore: null, aiSummary: null, aiStrengths: null, aiWeaknesses: null, aiExtractedSkills: null, aiMatchReasoning: null, aiAnalyzedAt: null,
  analysisStatus: "queued", analysisAttempts: 0, analysisLastError: null, analysisModel: null, analysisPromptVersion: null, extractionWarnings: null, extractionMethod: null, extractionTotalPages: null,
  ocrModelVersion: null, ocrConfidence: null, cvOriginalName: STORED_CV_NAME, cvSizeBytes: 245_760, fileValidationStatus: "accepted", fileSecurityScanVersion: null,
  createdAt: new Date(Date.UTC(2026, 9, 1, 8)), retentionUntil: null, certificationFacts: [], driveExport: null, emailDelivery: null,
  candidatePortalActive: false, candidatePortalInvitation: null, candidatePortalActivation: null,
};

type Procedure = (input: any) => unknown;

describe.skipIf(!executablePath)("Candidatures de l’admin dans un navigateur", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||= "pk_test_browser_stub";
    const stubDir = path.join(root, "node_modules/.vite/recruitment-tab-browser-test-stubs");
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(path.join(stubDir, "clerk-react.js"), CLERK_STUB);
    server = await createServer({
      configFile: path.join(root, "vite.config.ts"),
      cacheDir: path.join(root, "node_modules/.vite/recruitment-tab-browser-test"),
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

  async function openApplication(width: number, entered: Partial<Record<keyof typeof application, unknown>> = {}): Promise<Page> {
    const procedures: Record<string, Procedure> = {
      "auth.me": () => ({ id: 1, openId: "user_owner", name: "Dr Test", email: "owner@test.local", role: "admin", mfaVerified: true }),
      "adminSecurity.status": () => ({ verified: true }),
      "admin.recruitment.list": () => ({ items: [{ ...application, ...entered }], total: 1 }),
      "admin.recruitment.profiles.list": () => [],
      "admin.recruitment.driveExport.status": () => ({ connected: true, lastError: null, failedExports: 0 }),
    };
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => localStorage.setItem("language", "fr"));
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
    await page.locator("#admin-active-tab").selectOption("recruitment");
    await page.getByRole("button", { name: /Hélène Bérénice/ }).click();
    await page.getByText("Fichier :", { exact: true }).waitFor({ timeout: 30_000 });
    return page;
  }

  it.each([360, 412])("à %i px, le nom de CV stocké de 180 caractères passe à la ligne dans la candidature dépliée, sans défilement horizontal", async (width) => {
    const page = await openApplication(width);
    const layout = await page.evaluate((name) => {
      const line = Array.from(document.querySelectorAll("p")).find((element) => element.textContent?.startsWith("Fichier :"))!;
      const card = line.closest("article")!;
      return {
        pageWidth: document.documentElement.scrollWidth,
        lineText: line.textContent,
        lineRight: line.getBoundingClientRect().right,
        cardRight: card.getBoundingClientRect().right,
        nameShown: line.textContent?.includes(name),
      };
    }, STORED_CV_NAME);
    // On a phone, a page wider than the screen also widens the window (innerWidth): measured against the screen's width.
    expect(layout.pageWidth).toBeLessThanOrEqual(width);
    expect(layout.nameShown).toBe(true);
    expect(layout.lineText).toContain("(240 Ko)");
    expect(layout.lineRight).toBeLessThanOrEqual(layout.cardRight + 0.5);
    expect(layout.cardRight).toBeLessThanOrEqual(width);
    await page.context().close();
  }, 60_000);

  it("à 360 px, un lien sans espace dans le message et les autres champs saisis passent à la ligne, sans défilement horizontal", async () => {
    const link = "https://www.linkedin.com/in/helene_berenice_lefevre_anesthesie_reanimation_0123456789abcdef";
    const page = await openApplication(360, {
      message: `Mon profil: ${link}`,
      certifications: "ACLS_PALS_ATLS_DIU_Echographie_Reanimation_2025_renouvellement_en_cours",
      availability: "Immediatement_apres_preavis_de_trois_mois_negociable",
      mobility: "France_Suisse_Belgique_Luxembourg_Monaco_Emirats_Arabes_Unis",
    });
    const layout = await page.evaluate((labels) => {
      const lines = Array.from(document.querySelectorAll("p")).filter((element) => labels.some((label) => element.textContent?.startsWith(label)));
      const card = lines[0].closest("article")!;
      return {
        pageWidth: document.documentElement.scrollWidth,
        found: lines.length,
        widestRight: Math.max(...lines.map((line) => line.getBoundingClientRect().right)),
        cardRight: card.getBoundingClientRect().right,
        messageText: lines.find((line) => line.textContent?.startsWith("Message :"))?.textContent,
      };
    }, ["Message :", "Certifications déclarées :", "Disponibilité :", "Mobilité :"]);
    expect(layout.pageWidth).toBeLessThanOrEqual(360);
    expect(layout.found).toBe(4);
    expect(layout.messageText).toContain(link);
    expect(layout.widestRight).toBeLessThanOrEqual(layout.cardRight + 0.5);
    await page.context().close();
  }, 60_000);
});
