import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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

const scenarios = routes.flatMap(([id, route]) => [
  { id: `${id}-desktop`, path: route, viewport: desktop },
  { id: `${id}-mobile`, path: route, viewport: mobile },
]).concat([
  { id: "booking-de-desktop", path: "/booking", viewport: desktop, language: "de" },
  { id: "recruitment-standard-de-mobile", path: "/recruitment/standard", viewport: mobile, language: "de" },
  { id: "booking-zh-desktop", path: "/booking", viewport: desktop, language: "zh" },
  { id: "employers-zh-mobile", path: "/employers", viewport: mobile, language: "zh" },
]);

// Les étalons approuvés sont publiés hors du dépôt dans le stockage statique du projet.
const baselineUrls = {
  "home-desktop": `${baseUrl}/manus-storage/home-desktop_1d3eca43.png`,
  "home-mobile": `${baseUrl}/manus-storage/home-mobile_75af71d6.png`,
  "booking-desktop": `${baseUrl}/manus-storage/booking-desktop_39b8bbc5.png`,
  "booking-mobile": `${baseUrl}/manus-storage/booking-mobile_0e23e519.png`,
  "booking-confirmation-desktop": `${baseUrl}/manus-storage/booking-confirmation-desktop_f9529114.png`,
  "booking-confirmation-mobile": `${baseUrl}/manus-storage/booking-confirmation-mobile_bb71a443.png`,
  "recruitment-desktop": `${baseUrl}/manus-storage/recruitment-desktop_a13e18a4.png`,
  "recruitment-mobile": `${baseUrl}/manus-storage/recruitment-mobile_92028db8.png`,
  "recruitment-standard-desktop": `${baseUrl}/manus-storage/recruitment-standard-desktop_d163efaa.png`,
  "recruitment-standard-mobile": `${baseUrl}/manus-storage/recruitment-standard-mobile_43b8fc16.png`,
  "vvip-offshore-desktop": `${baseUrl}/manus-storage/vvip-offshore-desktop_9fb228e1.png`,
  "vvip-offshore-mobile": `${baseUrl}/manus-storage/vvip-offshore-mobile_3751ba52.png`,
  "employers-desktop": `${baseUrl}/manus-storage/employers-desktop_232959d2.png`,
  "employers-mobile": `${baseUrl}/manus-storage/employers-mobile_dbb45919.png`,
  "why-hippocampus-desktop": `${baseUrl}/manus-storage/why-hippocampus-desktop_119d10ce.png`,
  "why-hippocampus-mobile": `${baseUrl}/manus-storage/why-hippocampus-mobile_76fd06aa.png`,
  "venture-hippocampus-desktop": `${baseUrl}/manus-storage/venture-hippocampus-desktop_f86e55c8.png`,
  "venture-hippocampus-mobile": `${baseUrl}/manus-storage/venture-hippocampus-mobile_3e5d2815.png`,
  "recruitment-unsubscribe-desktop": `${baseUrl}/manus-storage/recruitment-unsubscribe-desktop_5aba6787.png`,
  "recruitment-unsubscribe-mobile": `${baseUrl}/manus-storage/recruitment-unsubscribe-mobile_21b7a2dc.png`,
  "faq-desktop": `${baseUrl}/manus-storage/faq-desktop_8346b3f3.png`,
  "faq-mobile": `${baseUrl}/manus-storage/faq-mobile_50323a0f.png`,
  "search-desktop": `${baseUrl}/manus-storage/search-desktop_d734fae1.png`,
  "search-mobile": `${baseUrl}/manus-storage/search-mobile_18e919ab.png`,
  "resources-desktop": `${baseUrl}/manus-storage/resources-desktop_777bed83.png`,
  "resources-mobile": `${baseUrl}/manus-storage/resources-mobile_825a6029.png`,
  "press-desktop": `${baseUrl}/manus-storage/press-desktop_6804b0b9.png`,
  "press-mobile": `${baseUrl}/manus-storage/press-mobile_12fa768e.png`,
  "testimonials-desktop": `${baseUrl}/manus-storage/testimonials-desktop_806e6ef5.png`,
  "testimonials-mobile": `${baseUrl}/manus-storage/testimonials-mobile_656c8f93.png`,
  "gdpr-desktop": `${baseUrl}/manus-storage/gdpr-desktop_45dd8527.png`,
  "gdpr-mobile": `${baseUrl}/manus-storage/gdpr-mobile_384b46f0.png`,
  "legal-desktop": `${baseUrl}/manus-storage/legal-desktop_b6a84175.png`,
  "legal-mobile": `${baseUrl}/manus-storage/legal-mobile_fc27ee3e.png`,
  "not-found-desktop": `${baseUrl}/manus-storage/not-found-desktop_a4ccb85d.png`,
  "not-found-mobile": `${baseUrl}/manus-storage/not-found-mobile_34e7a6a9.png`,
  "service-error-desktop": `${baseUrl}/manus-storage/service-error-desktop_892004ab.png`,
  "service-error-mobile": `${baseUrl}/manus-storage/service-error-mobile_569851c0.png`,
  "booking-de-desktop": `${baseUrl}/manus-storage/booking-de-desktop_418b9fd4.png`,
  "recruitment-standard-de-mobile": `${baseUrl}/manus-storage/recruitment-standard-de-mobile_672c51ba.png`,
  "booking-zh-desktop": `${baseUrl}/manus-storage/booking-zh-desktop_b3cfce00.png`,
  "employers-zh-mobile": `${baseUrl}/manus-storage/employers-zh-mobile_7b35cfe2.png`,
};

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
    const baselineUrl = baselineUrls[scenario.id];
    if (!baselineUrl) throw new Error(`Étalon non configuré pour ${scenario.id}.`);

    const [currentBuffer, baselineResponse] = await Promise.all([
      captureScenario(browser, scenario),
      fetch(baselineUrl),
    ]);
    if (!baselineResponse.ok) throw new Error(`${scenario.id}: étalon inaccessible (${baselineResponse.status}).`);

    const current = PNG.sync.read(currentBuffer);
    const baseline = PNG.sync.read(Buffer.from(await baselineResponse.arrayBuffer()));
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

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--font-render-hinting=none"] });
try {
  if (recordMode) await recordBaselines(browser);
  else await compareBaselines(browser);
} finally {
  await browser.close();
}
