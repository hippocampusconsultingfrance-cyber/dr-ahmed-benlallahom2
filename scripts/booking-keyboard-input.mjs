/**
 * Choisit le jour puis l'horaire de /booking dans un vrai navigateur en
 * émulation mobile : au toucher sur la grille de créneaux, et au clavier
 * (Tab puis flèches), comme le ferait un patient sur iPhone ou Android
 * (RES-01, puis RES-02 : la grille remplace la saisie de la date et de l'heure).
 *
 * Autonome : démarre Vite sur le client et répond aux requêtes tRPC de
 * disponibilité par des créneaux fictifs ; aucun serveur ni base n'est requis.
 *   CHROMIUM=/chemin/vers/chromium pnpm test:booking-keyboard
 *
 * Vérifie aussi qu'un lien ?lang=en affiche la page en anglais, avec le menu
 * de langue, puis retire le paramètre de l'adresse, même quand le chemin
 * commence par « // » (EN-03).
 */
import { createServer } from "vite";
import { chromium, devices } from "playwright-core";
import superjson from "superjson";

const responses = {
  "availability.getBlockedDates": [],
  "availability.getBookedSlots": [],
  "availability.getSlots": [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ id: dayOfWeek + 1, dayOfWeek, startTime: "00:00", endTime: "21:00", isActive: 1 })),
  "appointments.calculatePrice": { basePrice: 100, finalPrice: 150, isNightRate: true },
};

// Un jour dans dix jours, dans la fenêtre de réservation (2 h à 90 jours), en clé de Paris.
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(Date.now() + 10 * 24 * 3600 * 1000));
const scenarios = [
  { device: "Pixel 7", day, time: "19:00" },
  { device: "iPhone 14", day, time: "09:30" },
  // Nuit à Paris : 01:30, au tarif de nuit.
  { device: "Pixel 7", day, time: "01:30" },
  // Au clavier : Tab entre dans la grille sur 00:00, deux flèches mènent à 01:00.
  { device: "iPhone 14", day, time: "01:00", keyboard: ["Tab", "Space", "ArrowRight", "ArrowRight"] },
];

const server = await createServer({ configFile: "vite.config.ts", server: { host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const baseUrl = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ["--no-sandbox"] });
const failures = [];

async function openPage(device, path) {
  const context = await browser.newContext({ ...devices[device], locale: "fr-FR", timezoneId: "Europe/Paris" });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`${path} : ${error.message}`));
  // Aucun service externe (polices, Turnstile…) : seul le serveur Vite local répond.
  await page.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
  await page.route("**/api/trpc/**", (route) => {
    const procedures = new URL(route.request().url()).pathname.replace(/^.*\/api\/trpc\//, "").split(",");
    const body = procedures.map((name) => ({ result: { data: superjson.serialize(responses[name] ?? null) } }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  return { context, page };
}

try {
  for (const scenario of scenarios) {
    const { context, page } = await openPage(scenario.device, "/booking");
    await page.locator("#booking-day").tap();
    await page.locator("#booking-day").selectOption(scenario.day);
    await page.locator(`input[name="booking-slot"]`).first().waitFor({ state: "attached" });
    if (scenario.keyboard) {
      await page.locator("#booking-day").focus();
      for (const key of scenario.keyboard) await page.keyboard.press(key);
    } else {
      await page.locator("label", { hasText: new RegExp(`^${scenario.time}`) }).tap();
    }
    await page.waitForTimeout(300);
    const checked = await page.locator(`input[name="booking-slot"]:checked`).evaluate((input) => input.closest("label").textContent).catch(() => null);
    const state = await page.getAttribute("#availability-status", "data-state");
    const slot = (await page.locator("p.text-primary[aria-live]").allInnerTexts()).join(" ");
    const label = `${scenario.device} ${scenario.day} ${scenario.time}${scenario.keyboard ? " (clavier)" : ""}`;
    if (checked !== scenario.time || state !== "available" || !slot.includes(`${scenario.time} (heure de Paris)`)) {
      failures.push(`${label} : coché ${checked}, récapitulatif « ${slot} », état ${state}`);
    } else {
      console.log(`OK ${label} → ${slot}, créneau disponible`);
    }
    await context.close();
  }

  const { context, page } = await openPage("Pixel 7", "/booking?lang=en");
  await page.waitForFunction(() => !window.location.search.includes("lang="));
  const heading = await page.locator("h1").first().innerText();
  const menu = await page.locator('button[aria-label="Change language"]').count();
  const stored = await page.evaluate(() => localStorage.getItem("language"));
  if (heading !== "Book a Consultation" || !menu || stored !== "en" || page.url() !== `${baseUrl}/booking`) {
    failures.push(`?lang=en : titre « ${heading} », menu ${menu}, langue mémorisée ${stored}, adresse ${page.url()}`);
  } else {
    console.log("OK /booking?lang=en → page en anglais, menu de langue, ?lang retiré de l'adresse");
  }
  await context.close();

  // Un chemin « //hôte/x » ne doit pas faire lever history.replaceState (page blanche).
  const slashed = await openPage("Pixel 7", "//evil.example/x?lang=en");
  await slashed.page.waitForTimeout(300);
  const rendered = await slashed.page.locator("#root *").count();
  if (!rendered || slashed.page.url() !== `${baseUrl}//evil.example/x`) {
    failures.push(`//evil.example/x?lang=en : ${rendered} éléments rendus, adresse ${slashed.page.url()}`);
  } else {
    console.log("OK //evil.example/x?lang=en → page rendue, même origine, ?lang retiré");
  }
  await slashed.context.close();
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
