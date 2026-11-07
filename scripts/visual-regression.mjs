import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const baseUrl = (process.env.VISUAL_TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const recordMode = process.env.VISUAL_BASELINE_MODE === "record";
const outputDirectory = process.env.VISUAL_BASELINE_DIR ?? "/home/ubuntu/webdev-static-assets/visual-regression";
const mismatchLimit = 0.008;

const desktop = { width: 1280, height: 720 };
const mobile = { width: 375, height: 812 };
const routes = [
  ["home", "/"],
  ["booking", "/booking"],
  ["booking-confirmation", "/booking/confirmation?status=success&trackingId=VISUAL-TEST-2026"],
  ["recruitment", "/recruitment"],
  ["recruitment-standard", "/recruitment/standard"],
  ["vvip-offshore", "/recruitment/vvip-offshore"],
  ["employers", "/employers"],
  ["why-hippocampus", "/why-hippocampus"],
  ["venture-hippocampus", "/venture/hippocampus-consulting"],
  ["recruitment-unsubscribe", "/recruitment/unsubscribe"],
  ["faq", "/faq"],
  ["search", "/search"],
  ["resources", "/resources"],
  ["press", "/press"],
  ["testimonials", "/testimonials"],
  ["gdpr", "/gdpr"],
  ["legal", "/legal"],
  ["not-found", "/visual-not-found"],
  ["service-error", "/error"],
];

export const scenarios = routes.flatMap(([id, route]) => [
  { id: `${id}-desktop`, path: route, viewport: desktop },
  { id: `${id}-mobile`, path: route, viewport: mobile },
]).concat([
  { id: "booking-de-desktop", path: "/booking", viewport: desktop, language: "de" },
  { id: "recruitment-standard-de-mobile", path: "/recruitment/standard", viewport: mobile, language: "de" },
  { id: "booking-zh-desktop", path: "/booking", viewport: desktop, language: "zh" },
  { id: "employers-zh-mobile", path: "/employers", viewport: mobile, language: "zh" },
]);

// Les étalons approuvés sont publiés hors du dépôt, dans le stockage de l'ancien
// hébergeur Manus, sous ces clés. Le serveur n'expose plus de route /manus-storage
// (SECU-08) : le script demande lui-même à Forge une URL signée pour chacun.
export const baselineKeys = {
  "home-desktop": "home-desktop_1d3eca43.png",
  "home-mobile": "home-mobile_75af71d6.png",
  "booking-desktop": "booking-desktop_39b8bbc5.png",
  "booking-mobile": "booking-mobile_0e23e519.png",
  "booking-confirmation-desktop": "booking-confirmation-desktop_f9529114.png",
  "booking-confirmation-mobile": "booking-confirmation-mobile_bb71a443.png",
  "recruitment-desktop": "recruitment-desktop_10427e0e.png",
  "recruitment-mobile": "recruitment-mobile_bc0f22fa.png",
  "recruitment-standard-desktop": "recruitment-standard-desktop_54bd6392.png",
  "recruitment-standard-mobile": "recruitment-standard-mobile_96b5f63c.png",
  "vvip-offshore-desktop": "vvip-offshore-desktop-2026-08-22_d6854b4a.png",
  "vvip-offshore-mobile": "vvip-offshore-mobile_36550b97.png",
  "employers-desktop": "employers-desktop_232959d2.png",
  "employers-mobile": "employers-mobile_dbb45919.png",
  "why-hippocampus-desktop": "why-hippocampus-desktop_119d10ce.png",
  "why-hippocampus-mobile": "why-hippocampus-mobile_76fd06aa.png",
  "venture-hippocampus-desktop": "venture-hippocampus-desktop_f86e55c8.png",
  "venture-hippocampus-mobile": "venture-hippocampus-mobile_3e5d2815.png",
  "recruitment-unsubscribe-desktop": "recruitment-unsubscribe-desktop_5aba6787.png",
  "recruitment-unsubscribe-mobile": "recruitment-unsubscribe-mobile_21b7a2dc.png",
  "faq-desktop": "faq-desktop_8346b3f3.png",
  "faq-mobile": "faq-mobile_50323a0f.png",
  "search-desktop": "search-desktop_89bb7f65.png",
  "search-mobile": "search-mobile_3f7c73ca.png",
  "resources-desktop": "resources-desktop_9867fd0f.png",
  "resources-mobile": "resources-mobile_59fdab36.png",
  "press-desktop": "press-desktop_6804b0b9.png",
  "press-mobile": "press-mobile_12fa768e.png",
  "testimonials-desktop": "testimonials-desktop_806e6ef5.png",
  "testimonials-mobile": "testimonials-mobile_656c8f93.png",
  "gdpr-desktop": "gdpr-desktop_45dd8527.png",
  "gdpr-mobile": "gdpr-mobile_384b46f0.png",
  "legal-desktop": "legal-desktop_3f55f2d2.png",
  "legal-mobile": "legal-mobile_1ea3f92e.png",
  "not-found-desktop": "not-found-desktop_a4ccb85d.png",
  "not-found-mobile": "not-found-mobile_34e7a6a9.png",
  "service-error-desktop": "service-error-desktop_892004ab.png",
  "service-error-mobile": "service-error-mobile_569851c0.png",
  "booking-de-desktop": "booking-de-desktop_418b9fd4.png",
  "recruitment-standard-de-mobile": "recruitment-standard-de-mobile_5893b47a.png",
  "booking-zh-desktop": "booking-zh-desktop_b3cfce00.png",
  "employers-zh-mobile": "employers-zh-mobile_7b35cfe2.png",
};

/**
 * Lit un étalon publié : une URL signée demandée à Forge avec les BUILT_IN_FORGE_*
 * de l'environnement local (jamais envoyés au serveur testé), puis l'image.
 */
export async function fetchBaseline(key, { environment = process.env, fetchImpl = fetch } = {}) {
  const apiUrl = environment.BUILT_IN_FORGE_API_URL?.trim();
  const apiKey = environment.BUILT_IN_FORGE_API_KEY?.trim();
  if (!apiUrl || !apiKey) {
    throw new Error("Étalons inaccessibles : BUILT_IN_FORGE_API_URL et BUILT_IN_FORGE_API_KEY sont requis pour lire le stockage Manus.");
  }
  const presignUrl = new URL("v1/storage/presign/get", apiUrl.replace(/\/+$/, "") + "/");
  presignUrl.searchParams.set("path", key);
  const presign = await fetchImpl(presignUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!presign.ok) throw new Error(`${key} : URL signée refusée par Forge (${presign.status}).`);
  const { url } = await presign.json();
  if (!url) throw new Error(`${key} : URL signée vide.`);
  const image = await fetchImpl(url);
  if (!image.ok) throw new Error(`${key} : étalon inaccessible (${image.status}).`);
  return Buffer.from(await image.arrayBuffer());
}

function assertSameDimensions(current, baseline, id) {
  if (current.width !== baseline.width || current.height !== baseline.height) {
    throw new Error(`${id}: dimensions inattendues (${current.width}×${current.height} au lieu de ${baseline.width}×${baseline.height}).`);
  }
}

async function captureScenario(browser, scenario) {
  const context = await browser.newContext({
    viewport: scenario.viewport,
    deviceScaleFactor: 1,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  await context.addInitScript((language) => {
    localStorage.setItem("cookieConsent", JSON.stringify({ essential: true, performance: false, preferences: false }));
    localStorage.setItem("language", language);
  }, scenario.language ?? "fr");
  const page = await context.newPage();
  await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(400);
  const screenshot = await page.screenshot({ fullPage: false, animations: "disabled" });
  await context.close();
  return screenshot;
}

async function recordBaselines(browser) {
  await mkdir(outputDirectory, { recursive: true });
  for (const scenario of scenarios) {
    const screenshot = await captureScenario(browser, scenario);
    await writeFile(path.join(outputDirectory, `${scenario.id}.png`), screenshot);
    console.log(`Étalon enregistré : ${scenario.id}`);
  }
}

async function compareBaselines(browser) {
  for (const scenario of scenarios) {
    const baselineKey = baselineKeys[scenario.id];
    if (!baselineKey) throw new Error(`Étalon non configuré pour ${scenario.id}.`);

    const [currentBuffer, baselineBuffer] = await Promise.all([
      captureScenario(browser, scenario),
      fetchBaseline(baselineKey),
    ]);

    const current = PNG.sync.read(currentBuffer);
    const baseline = PNG.sync.read(baselineBuffer);
    assertSameDimensions(current, baseline, scenario.id);
    const differentPixels = pixelmatch(current.data, baseline.data, null, current.width, current.height, {
      threshold: 0.1,
      includeAA: false,
    });
    const ratio = differentPixels / (current.width * current.height);
    if (ratio > mismatchLimit) {
      throw new Error(`${scenario.id}: régression visuelle ${(ratio * 100).toFixed(2)} % (limite ${(mismatchLimit * 100).toFixed(2)} %).`);
    }
    console.log(`Validé : ${scenario.id} (${(ratio * 100).toFixed(3)} % de différence).`);
  }
}

async function main() {
  // Les BUILT_IN_FORGE_* du .env local, comme le serveur (pnpm dev) les lit.
  await import("dotenv/config");
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--font-render-hinting=none"] });
  try {
    if (recordMode) await recordBaselines(browser);
    else await compareBaselines(browser);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
