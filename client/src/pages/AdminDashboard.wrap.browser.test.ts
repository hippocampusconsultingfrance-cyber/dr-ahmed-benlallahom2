import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Onglets de l’admin dans un vrai navigateur, sur un téléphone de 360 px (EXPL-02) : ce qu’un
 * patient, un visiteur, un candidat ou un employeur a saisi (un lien ou un mot de 300 caractères
 * sans espace, un nom sans espace) passe à la ligne dans sa carte au lieu d’élargir la page, dans
 * Messages, Candidatures (certifications d’une fiche dépliée), Réservations, RGPD, Témoignages,
 * Vivier et Missions. Le détail d’une réservation et un témoignage, sur deux lignes, se lisent en
 * entier par « Voir tout ». Le client est servi par Vite, Clerk est remplacé par un administrateur
 * déjà connecté et chaque procédure tRPC répond par des données fictives. Ne tourne que si un
 * Chromium est disponible, comme BookingPage.browser.test.ts :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/pages/AdminDashboard.wrap.browser.test.ts
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
const WIDTH = 360;

/** Administrateur déjà connecté : seules les fonctions de @clerk/react utilisées par l'admin. */
const CLERK_STUB = `
export const ClerkProvider = ({ children }) => children;
export const SignInButton = ({ children }) => children;
export const UserButton = () => null;
export const useAuth = () => ({ isLoaded: true, isSignedIn: true });
export const useClerk = () => ({ signOut: async () => undefined });
`;

/** A link of 300 characters without a space, as pasted in a form. */
const LONG_LINK = `https://www.example.test/${"profil_du_patient_sans_espace_".repeat(10)}`.slice(0, 300);
/** A word of 300 characters, as a certification or a name typed without a space. */
const LONG_WORD = "ACLS_PALS_ATLS_DIU_Echographie_Reanimation_".repeat(8).slice(0, 300);
const LONG_NAME = "Jean-Baptiste-Alexandre-Maximilien_de_la_Tour_dAuvergne_Lauraguais";
const at = new Date(Date.UTC(2026, 9, 20, 8));

const application = {
  id: 1, trackingId: "CV-2026-000001", firstName: "Hélène", lastName: "Bérénice", email: "helene.berenice@test.local", phone: null, specialty: "Anesthésie-réanimation",
  targetCountries: "[\"France\"]", languages: "[\"Français\"]", diplomaCountry: null, availability: null, mobility: null, certifications: LONG_WORD, yearsExperience: 8, message: null,
  status: "new", adminNotes: null, language: "fr", aiScore: null, aiSummary: null, aiStrengths: null, aiWeaknesses: null, aiExtractedSkills: null, aiMatchReasoning: null, aiAnalyzedAt: null,
  analysisStatus: "queued", analysisAttempts: 0, analysisLastError: null, analysisModel: null, analysisPromptVersion: null, extractionWarnings: null, extractionMethod: null, extractionTotalPages: null,
  ocrModelVersion: null, ocrConfidence: null, cvOriginalName: "cv.pdf", cvSizeBytes: 245_760, fileValidationStatus: "accepted", fileSecurityScanVersion: null,
  createdAt: at, retentionUntil: null, certificationFacts: [{ name: LONG_WORD, origins: ["declared"] }, { name: LONG_LINK, origins: ["declared"] }], driveExport: null, emailDelivery: null,
  candidatePortalActive: false, candidatePortalInvitation: null, candidatePortalActivation: null,
};

type Procedure = (input: any) => unknown;
const procedures: Record<string, Procedure> = {
  "auth.me": () => ({ id: 1, openId: "user_owner", name: "Dr Test", email: "owner@test.local", role: "admin", mfaVerified: true }),
  "adminSecurity.status": () => ({ verified: true }),
  "system.configurationStatus": () => ({ ok: true, missing: [] }),
  "admin.contacts.list": () => ({
    items: [{ id: 1, trackingId: "CT-2026-0001", name: LONG_NAME, email: "patient@test.local", phone: null, message: `Bonjour,\nMon dossier : ${LONG_LINK}\nMerci`, read: 0, createdAt: at }],
    total: 1,
  }),
  "admin.recruitment.list": () => ({ items: [application], total: 1 }),
  "admin.recruitment.profiles.list": () => [],
  "admin.recruitment.driveExport.status": () => ({ connected: true, lastError: null, failedExports: 0 }),
  "admin.appointments.agenda": () => ({ items: [], truncated: false, limit: 200 }),
  "admin.appointments.list": () => ({
    items: [{
      id: 1, trackingId: "APTWRAP00001", customerName: LONG_NAME, customerEmail: "patient@test.local", customerPhone: "+33600000000", requestDetails: `Avis sur mon dossier, compte rendu en ligne : ${LONG_LINK} ; merci de le lire avant la consultation.`,
      appointmentDate: new Date(Date.UTC(2026, 11, 20, 9)), duration: 30, consultationType: "Conseil en santé", basePrice: "100.00", finalPrice: "100.00", isNightRate: 0, language: "fr",
      paymentStatus: "completed", appointmentStatus: "confirmed", stripePaymentIntentId: "pi_wrap", cancellationReason: null, cancelledAt: null, refundAmount: null, refundedAt: null,
      deliveries: [], invoiceNumber: null, createdAt: at,
    }],
    total: 1,
  }),
  "admin.gdprRequests.list": () => ({
    items: [{ id: 1, trackingId: "GDPR-WRAP-01", name: LONG_NAME, email: "demandeur@test.local", phone: null, requestType: "access", description: `Mes données, dont ${LONG_LINK}`, status: "completed", notes: LONG_WORD, responseDate: at, read: 1, createdAt: at, updatedAt: at }],
    total: 1,
  }),
  "admin.testimonials.list": () => [{ id: 1, authorName: LONG_NAME, rating: 5, title: "Merci", content: `Très bonne consultation. ${LONG_LINK} Je recommande vivement le docteur à toute ma famille et à mes amis.`, status: "pending", featured: 0, createdAt: at }],
  "admin.recruitment.pool.list": () => [{ ...application, specialty: LONG_WORD, aiScore: 80, availability: LONG_LINK, mobility: null }],
  "admin.clientBriefs.list": () => [{ id: 1, briefId: "BRF-2026-0001", organizationName: LONG_WORD, contactName: LONG_NAME, email: "rh@test.local", phone: null, specialtyNeeded: LONG_WORD, country: "France", targetEnvironment: "hospital", timeline: LONG_LINK, status: "new", createdAt: at }],
};

describe.skipIf(!executablePath)("Textes saisis par des tiers dans l’admin, sur un téléphone", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||= "pk_test_browser_stub";
    const stubDir = path.join(root, "node_modules/.vite/admin-wrap-browser-test-stubs");
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(path.join(stubDir, "clerk-react.js"), CLERK_STUB);
    server = await createServer({
      configFile: path.join(root, "vite.config.ts"),
      cacheDir: path.join(root, "node_modules/.vite/admin-wrap-browser-test"),
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

  async function openTab(tab: string, shown: string): Promise<Page> {
    const context = await browser.newContext({ viewport: { width: WIDTH, height: 800 }, isMobile: true, hasTouch: true });
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
          // What a tab does not need here shows its error state.
          status = 500;
          return { error: superjson.serialize({ message: "Hors du test", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: name } }) };
        }
        return { result: { data: superjson.serialize(procedures[name](inputs[index] ? superjson.deserialize(inputs[index]) : undefined)) } };
      });
      return request.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Administration" }).waitFor({ timeout: 30_000 });
    await page.locator("#admin-active-tab").selectOption(tab);
    await page.getByText(shown, { exact: false }).first().waitFor({ timeout: 30_000 });
    return page;
  }

  /** The page's width, and every element holding `text` that ends past the screen's right edge. */
  async function layoutOf(page: Page, texts: string[]) {
    return page.evaluate(({ texts, width }) => {
      const holders = Array.from(document.querySelectorAll("main *")).filter((element) => element.children.length === 0 || Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()));
      return {
        // On a phone, a page wider than the screen also widens the window (innerWidth): measured against the screen's width.
        pageWidth: document.documentElement.scrollWidth,
        found: texts.map((text) => holders.some((element) => element.textContent?.includes(text))),
        pastTheEdge: holders.filter((element) => texts.some((text) => element.textContent?.includes(text)) && element.getBoundingClientRect().right > width + 0.5).map((element) => element.tagName),
      };
    }, { texts, width: WIDTH });
  }

  it("Messages : un lien de 300 caractères et un nom sans espace passent à la ligne, les retours à la ligne du message restent", async () => {
    const page = await openTab("contacts", "CT-2026-0001");
    const layout = await layoutOf(page, [LONG_LINK, LONG_NAME]);
    expect(layout.pageWidth).toBeLessThanOrEqual(WIDTH);
    expect(layout.found).toEqual([true, true]);
    expect(layout.pastTheEdge).toEqual([]);
    const message = page.locator("p", { hasText: "Mon dossier" });
    expect(await message.evaluate((element) => (element as HTMLElement).innerText)).toBe(`Bonjour,\nMon dossier : ${LONG_LINK}\nMerci`);
    await page.context().close();
  }, 60_000);

  it("Candidatures : une certification déclarée avec un mot ou un lien de 300 caractères n’élargit pas la fiche dépliée", async () => {
    const page = await openTab("recruitment", "Hélène Bérénice");
    await page.getByRole("button", { name: /Hélène Bérénice/ }).click();
    await page.getByText("Certifications et origine", { exact: true }).waitFor();
    const layout = await layoutOf(page, [LONG_WORD, LONG_LINK]);
    expect(layout.pageWidth).toBeLessThanOrEqual(WIDTH);
    expect(layout.found).toEqual([true, true]);
    expect(layout.pastTheEdge).toEqual([]);
    // The section and the columns of the expanded application stay within the screen.
    const section = await page.locator("[aria-label='Certifications de Hélène Bérénice']").boundingBox();
    expect(section!.x + section!.width).toBeLessThanOrEqual(WIDTH);
    await page.context().close();
  }, 60_000);

  it("Réservations : le détail de la demande passe à la ligne sur deux lignes, et « Voir tout » le montre en entier", async () => {
    const page = await openTab("appointments", "APTWRAP00001");
    const layout = await layoutOf(page, [LONG_NAME]);
    expect(layout.pageWidth).toBeLessThanOrEqual(WIDTH);
    expect(layout.pastTheEdge).toEqual([]);
    const details = page.locator("p", { hasText: "Avis sur mon dossier" });
    const folded = await details.evaluate((element) => ({ cut: element.scrollHeight > element.clientHeight + 1, right: element.getBoundingClientRect().right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    // Two lines, not a line cut at the card's edge.
    expect(folded.cut).toBe(true);
    expect(folded.scrollWidth).toBeLessThanOrEqual(folded.clientWidth);
    expect(folded.right).toBeLessThanOrEqual(WIDTH);

    const more = page.getByRole("button", { name: "Voir tout" });
    expect(await more.getAttribute("aria-expanded")).toBe("false");
    await more.click();
    const less = page.getByRole("button", { name: "Réduire" });
    expect(await less.getAttribute("aria-expanded")).toBe("true");
    const unfolded = await details.evaluate((element) => ({ cut: element.scrollHeight > element.clientHeight + 1, text: element.textContent }));
    expect(unfolded).toEqual({ cut: false, text: expect.stringContaining(LONG_LINK) });
    expect((await layoutOf(page, [LONG_LINK])).pageWidth).toBeLessThanOrEqual(WIDTH);
    await less.click();
    expect(await page.getByRole("button", { name: "Voir tout" }).getAttribute("aria-expanded")).toBe("false");
    await page.context().close();
  }, 60_000);

  it.each([
    ["gdpr", "GDPR-WRAP-01", [LONG_NAME, LONG_LINK, LONG_WORD]],
    ["testimonials", "Merci", [LONG_NAME]],
    ["vivier", "Hélène Bérénice", [LONG_WORD, LONG_LINK]],
    ["employerBriefs", "· France", [LONG_WORD, LONG_LINK]],
  ])("onglet %s : les textes saisis passent à la ligne, sans défilement horizontal", async (tab, shown, texts) => {
    const page = await openTab(tab, shown);
    const layout = await layoutOf(page, texts);
    expect(layout.pageWidth).toBeLessThanOrEqual(WIDTH);
    expect(layout.found).toEqual(texts.map(() => true));
    expect(layout.pastTheEdge).toEqual([]);
    await page.context().close();
  }, 60_000);

  it("Témoignages : « Voir tout » montre en entier un témoignage plus long que ses deux lignes", async () => {
    const page = await openTab("testimonials", "Merci");
    await page.getByRole("button", { name: "Voir tout" }).click();
    const content = await page.locator("p", { hasText: "Très bonne consultation" }).evaluate((element) => ({ cut: element.scrollHeight > element.clientHeight + 1, right: element.getBoundingClientRect().right }));
    expect(content.cut).toBe(false);
    expect(content.right).toBeLessThanOrEqual(WIDTH);
    await page.context().close();
  }, 60_000);
});
