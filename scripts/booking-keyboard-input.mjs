/**
 * Tape la date et l'heure de /booking touche par touche, comme sur le pavé
 * numérique d'un mobile (chiffres seuls, sans « / » ni « : »), dans un vrai
 * navigateur en émulation mobile (RES-01). Le remplissage par script (fill)
 * ne révèle pas ce défaut : seule une frappe au clavier le fait.
 *
 * Autonome : démarre Vite sur le client et répond aux requêtes tRPC de
 * disponibilité par des créneaux fictifs ; aucun serveur ni base n'est requis.
 *   CHROMIUM=/chemin/vers/chromium pnpm test:booking-keyboard
 *
 * Vérifie aussi qu'un lien ?lang=en affiche la page en anglais, avec le menu
 * de langue, puis retire le paramètre de l'adresse (EN-03).
 */
import { createServer } from "vite";
import { chromium, devices } from "playwright-core";
import superjson from "superjson";

const responses = {
  "availability.getBlockedDates": [],
  "availability.getBookedSlots": [],
  "availability.getSlots": [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ id: dayOfWeek + 1, dayOfWeek, startTime: "08:00", endTime: "21:00", isActive: 1 })),
  "appointments.calculatePrice": { basePrice: 100, finalPrice: 150, isNightRate: true },
};

// Un jour dans dix jours, dans la fenêtre de réservation (2 h à 90 jours).
const shownDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" })
  .format(new Date(Date.now() + 10 * 24 * 3600 * 1000));
const date = shownDate.replace(/\D/g, "");
const scenarios = [
  { device: "Pixel 7", date, time: "1900", shownDate, shownTime: "19:00" },
  { device: "iPhone 14", date, time: "930", shownDate, shownTime: "9:30" },
  { device: "iPhone 14", date, time: "10h00", shownDate, shownTime: "10:00" },
];

const server = await createServer({ configFile: "vite.config.ts", server: { host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const baseUrl = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ["--no-sandbox"] });
const failures = [];

async function openPage(device, path) {
  const context = await browser.newContext({ ...devices[device], locale: "fr-FR", timezoneId: "Europe/Paris" });
  const page = await context.newPage();
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
    await page.locator("#booking-date").tap();
    await page.keyboard.type(scenario.date, { delay: 30 });
    await page.locator("#booking-time").tap();
    await page.keyboard.type(scenario.time, { delay: 30 });
    await page.waitForTimeout(300);
    const shown = { date: await page.inputValue("#booking-date"), time: await page.inputValue("#booking-time") };
    const state = await page.getAttribute("#availability-status", "data-state");
    const dateError = await page.locator("#booking-date-error").count();
    const label = `${scenario.device} « ${scenario.date} » + « ${scenario.time} »`;
    if (shown.date !== scenario.shownDate || shown.time !== scenario.shownTime || state !== "available" || dateError) {
      failures.push(`${label} : affiché ${shown.date} ${shown.time}, état ${state}, erreur ${dateError ? "oui" : "non"}`);
    } else {
      console.log(`OK ${label} → ${shown.date} ${shown.time}, créneau disponible`);
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
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
