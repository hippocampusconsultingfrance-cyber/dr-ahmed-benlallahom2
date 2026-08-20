import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const baseUrl = (process.env.VISUAL_TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const recordMode = process.env.VISUAL_BASELINE_MODE === "record";
const outputDirectory = process.env.VISUAL_BASELINE_DIR ?? "/home/ubuntu/webdev-static-assets/visual-regression";
const mismatchLimit = 0.008;

const scenarios = [
  { id: "home-desktop", path: "/", viewport: { width: 1280, height: 720 } },
  { id: "booking-desktop", path: "/booking", viewport: { width: 1280, height: 720 } },
  { id: "recruitment-desktop", path: "/recruitment", viewport: { width: 1280, height: 720 } },
  { id: "employers-desktop", path: "/employers", viewport: { width: 1280, height: 720 } },
  { id: "resources-desktop", path: "/resources", viewport: { width: 1280, height: 720 } },
  { id: "gdpr-desktop", path: "/gdpr", viewport: { width: 1280, height: 720 } },
  { id: "home-mobile", path: "/", viewport: { width: 375, height: 812 } },
  { id: "booking-mobile", path: "/booking", viewport: { width: 375, height: 812 } },
  { id: "recruitment-mobile", path: "/recruitment", viewport: { width: 375, height: 812 } },
  { id: "employers-mobile", path: "/employers", viewport: { width: 375, height: 812 } },
  { id: "resources-mobile", path: "/resources", viewport: { width: 375, height: 812 } },
  { id: "gdpr-mobile", path: "/gdpr", viewport: { width: 375, height: 812 } },
];

// Les images étalons sont publiées hors du dépôt dans le stockage statique du projet.
// Elles sont renseignées après un enregistrement explicitement validé.
const baselineUrls = {
  "home-desktop": `${baseUrl}/manus-storage/home-desktop_6a246ac1.png`,
  "booking-desktop": `${baseUrl}/manus-storage/booking-desktop_f5cc9984.png`,
  "recruitment-desktop": `${baseUrl}/manus-storage/recruitment-desktop_10457d7f.png`,
  "employers-desktop": `${baseUrl}/manus-storage/employers-desktop_37c61b28.png`,
  "resources-desktop": `${baseUrl}/manus-storage/resources-desktop_f92552e1.png`,
  "gdpr-desktop": `${baseUrl}/manus-storage/gdpr-desktop_f40305d1.png`,
  "home-mobile": `${baseUrl}/manus-storage/home-mobile_90be5c67.png`,
  "booking-mobile": `${baseUrl}/manus-storage/booking-mobile_e6a11652.png`,
  "recruitment-mobile": `${baseUrl}/manus-storage/recruitment-mobile_60746526.png`,
  "employers-mobile": `${baseUrl}/manus-storage/employers-mobile_df40a85a.png`,
  "resources-mobile": `${baseUrl}/manus-storage/resources-mobile_a60f5a6e.png`,
  "gdpr-mobile": `${baseUrl}/manus-storage/gdpr-mobile_f47a18c5.png`,
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
  await context.addInitScript(() => {
    localStorage.setItem("cookieConsent", JSON.stringify({ essential: true, performance: false, preferences: false }));
    localStorage.setItem("language", "fr");
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(250);
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
