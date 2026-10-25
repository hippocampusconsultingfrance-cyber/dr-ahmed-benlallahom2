import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright-core";
import superjson from "superjson";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cookieCopy } from "@/components/CookieConsent";
import { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent } from "@/components/cookieConsentState";
import { getBookingFormCopy } from "@/lib/publicFormCopy";
import { bookingContent, listBookableSlots, parisBookingSlotStart, toParisBookingDateKey } from "./BookingPage";
import { confirmationContent } from "./BookingConfirmationPage";

/**
 * Réservation et confirmation dans un vrai navigateur (RES-02, RES-04, RES-05, EN-06) : le
 * client est servi par Vite et chaque procédure tRPC répond par des données fictives, sans
 * serveur ni base. Ne tourne que si un Chromium est disponible, comme publicPages.browser.test.ts :
 *   CHROMIUM=/chemin/vers/chrome pnpm vitest run client/src/pages/BookingPage.browser.test.ts
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

type Procedure = (input: any) => unknown;
type TrpcError = { trpcError: { code: string; httpStatus: number; message: string; reason?: string } };
const refuse = (code: string, httpStatus: number, message: string, reason?: string): TrpcError => ({ trpcError: { code, httpStatus, message, reason } });

/** Tous les jours de 18:00 à 21:00, heure de Paris : des créneaux du soir, au tarif de nuit. */
const EVENING_SLOTS = Array.from({ length: 7 }, (_, dayOfWeek) => ({ id: dayOfWeek + 1, dayOfWeek, startTime: "18:00", endTime: "21:00", isActive: 1 }));

/** Tarif comme le serveur (isNightRateForParis) : 150 € de 18:00 à 08:00 à Paris. */
function priceFor(appointmentDate: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" }).format(new Date(appointmentDate)));
  const isNightRate = hour >= 18 || hour < 8;
  return { basePrice: 100, finalPrice: isNightRate ? 150 : 100, isNightRate };
}

/** Jours ouverts proposés par la page, calculés comme elle (aujourd'hui, avec le délai de 2 h). */
function openDays(blocked: string[] = []) {
  return Array.from(new Set(listBookableSlots(EVENING_SLOTS, blocked).map((slot) => slot.dayKey)));
}

describe.skipIf(!executablePath)("réservation et confirmation dans un navigateur", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createServer({
      configFile: path.join(root, "vite.config.ts"),
      cacheDir: path.join(root, "node_modules/.vite/booking-browser-test"),
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

  async function open(route: string, procedures: Record<string, Procedure>, { language = "fr", timezoneId = "Europe/Paris", session = {} as Record<string, string>, context: contextOptions = {} as BrowserContextOptions, beforeGoto = async (_page: Page) => {} } = {}) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId, acceptDownloads: true, ...contextOptions });
    // Choix cookies déjà fait : le bandeau ne recouvre pas le formulaire.
    await context.addInitScript(({ storedLanguage, storedSession, consent }) => {
      localStorage.setItem("language", storedLanguage);
      localStorage.setItem(consent.key, consent.value);
      for (const [key, value] of Object.entries(storedSession)) sessionStorage.setItem(key, value);
    }, { storedLanguage: language, storedSession: session, consent: { key: COOKIE_CONSENT_STORAGE_KEY, value: JSON.stringify(createCookieConsent(false)) } });
    const page = await context.newPage();
    const calls: Array<{ procedure: string; input: any }> = [];
    const alerts: string[] = [];
    page.on("dialog", (dialog) => {
      alerts.push(dialog.message());
      void dialog.dismiss();
    });
    await page.route((url) => !url.href.startsWith(baseUrl), (request) => request.abort());
    await page.route("**/api/trpc/**", async (request) => {
      const url = new URL(request.request().url());
      const names = url.pathname.replace(/^.*\/api\/trpc\//, "").split(",");
      const rawInput = request.request().method() === "GET" ? url.searchParams.get("input") : request.request().postData();
      const inputs = rawInput ? JSON.parse(rawInput) : {};
      let status = 200;
      // Une procédure peut répondre par une promesse, pour retenir la réponse le temps d'une vérification.
      const body = await Promise.all(names.map(async (name, index) => {
        const input = inputs[index] ? superjson.deserialize(inputs[index]) : undefined;
        calls.push({ procedure: name, input });
        const result = procedures[name] ? await procedures[name](input) : null;
        if (result && typeof result === "object" && "trpcError" in result) {
          const { code, httpStatus, message, reason } = (result as TrpcError).trpcError;
          status = httpStatus;
          return { error: superjson.serialize({ message, code: -32000, data: { code, httpStatus, path: name, ...(reason ? { reason } : {}) } }) };
        }
        return { result: { data: superjson.serialize(result) } };
      }));
      return request.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await beforeGoto(page);
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.querySelector(".app-loading-shell") && document.querySelector('main, [role="main"]') !== null, undefined, { timeout: 30_000 });
    return { page, calls, alerts };
  }

  const bookingProcedures = (overrides: Record<string, Procedure> = {}): Record<string, Procedure> => ({
    "availability.getSlots": () => EVENING_SLOTS,
    "availability.getBlockedDates": () => [],
    "availability.getBookedSlots": () => [],
    "appointments.calculatePrice": ({ appointmentDate }) => priceFor(appointmentDate),
    ...overrides,
  });

  it("affiche dès l'arrivée les plages d'ouverture, ou « aucun créneau ouvert » (RES-02)", async () => {
    const { page } = await open("/booking", bookingProcedures());
    const hours = await page.locator("#booking-opening-hours").innerText();
    expect(hours).toContain(bookingContent.fr.form.openingHours);
    expect(hours).toContain("lun. 18:00–21:00");
    expect(hours).toContain("dim. 18:00–21:00");
    await page.context().close();

    const closed = await open("/booking", bookingProcedures({ "availability.getSlots": () => [] }));
    const status = closed.page.locator("#availability-status");
    expect(await status.getAttribute("data-state")).toBe("unavailable");
    expect(await status.innerText()).toBe("Aucun horaire de consultation n’est actuellement ouvert.");
    expect(await closed.page.locator("#booking-day").isDisabled()).toBe(true);
    await closed.page.context().close();
  }, 60_000);

  it("propose les jours ouverts sans les dates bloquées, puis une grille de 30 min pilotable au clavier, en heure de Paris et heure locale (RES-02, RES-04)", async () => {
    const [firstDay, blockedDay, thirdDay] = openDays();
    // 18:30 est déjà pris le troisième jour ouvert.
    const taken = parisBookingSlotStart(thirdDay, "18:30")!;
    const { page, calls } = await open("/booking", bookingProcedures({
      "availability.getBlockedDates": () => [{ date: blockedDay }],
      "availability.getBookedSlots": ({ date }) => (date === thirdDay ? [taken] : []),
    }), { timezoneId: "Asia/Dubai" });

    const days = await page.locator("#booking-day option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    expect(days[0]).toBe("");
    expect(days).toContain(firstDay);
    expect(days).not.toContain(blockedDay);
    expect(days.length - 1).toBe(openDays([blockedDay]).length);

    await page.locator("#booking-day").selectOption(thirdDay);
    const grid = page.getByRole("group", { name: bookingContent.fr.form.slotsLegend });
    await grid.getByRole("radio").first().waitFor();
    const localTime = (time: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Dubai" }).format(parisBookingSlotStart(thirdDay, time)!);
    // Horaires de Paris, chacun avec l'heure de Dubaï ; 18:30, déjà réservé, n'est pas proposé.
    expect(await grid.getByRole("radio").evaluateAll((radios) => radios.map((radio) => radio.closest("label")!.textContent))).toEqual(
      ["18:00", "19:00", "19:30", "20:00", "20:30"].map((time) => `${time}${localTime(time)} chez vous`),
    );

    // Clavier : Tab entre dans la grille, Espace choisit, la flèche droite passe à l'horaire suivant.
    await page.locator("#booking-day").focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).value)).toBe(parisBookingSlotStart(thirdDay, "18:00")!.toISOString());
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    const nineteen = parisBookingSlotStart(thirdDay, "19:00")!.toISOString();
    expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).value)).toBe(nineteen);
    expect(await grid.getByRole("radio", { checked: true }).getAttribute("value")).toBe(nineteen);
    // Horaire au clavier entouré d'un anneau de focus, absent des autres horaires.
    expect(await page.evaluate(() => getComputedStyle((document.activeElement as HTMLElement).nextElementSibling!).boxShadow)).not.toBe("none");
    expect(await grid.getByRole("radio").first().evaluate((radio) => getComputedStyle(radio.nextElementSibling!).boxShadow)).toBe("none");

    await page.locator("#availability-status[data-state='available']").waitFor();
    const recap = await page.locator("p.text-primary[aria-live]").innerText();
    expect(recap).toContain("19:00 (heure de Paris)");
    expect(recap).toContain(`soit ${localTime("19:00")} chez vous`);
    // Créneau du soir : tarif de nuit, calculé pour l'instant exact choisi.
    await page.getByText("150 €", { exact: true }).last().waitFor();
    expect(calls.filter((call) => call.procedure === "appointments.calculatePrice").at(-1)?.input).toEqual({ appointmentDate: nineteen });
    await page.context().close();
  }, 60_000);

  it("envoie l'instant exact et la langue, puis traduit un refus « créneau déjà pris » (EN-06)", async () => {
    const [firstDay] = openDays();
    const { page, calls, alerts } = await open("/booking", bookingProcedures({
      "appointments.create": () => refuse("CONFLICT", 409, "Ce créneau vient d’être réservé par un autre patient. Veuillez en choisir un autre.", "slot_taken"),
    }), { language: "en" });
    await page.locator("#booking-name").fill("Test Patient");
    await page.locator("#booking-email").fill("patient@example.test");
    await page.locator("#booking-phone").fill("+971 50 123 4567");
    await page.locator("#booking-day").selectOption(firstDay);
    const slot = page.getByRole("group", { name: bookingContent.en.form.slotsLegend }).getByRole("radio").last();
    const chosen = await slot.getAttribute("value");
    // Clic (ou toucher) sur l'horaire affiché : le bouton radio natif est dans son libellé.
    await slot.locator("xpath=..").click();
    expect(await slot.isChecked()).toBe(true);
    await page.locator("#booking-details").fill("Practical questions");
    await page.getByRole("button", { name: bookingContent.en.form.submit }).click();
    await page.waitForFunction(() => document.querySelector("button[type=submit]") && !(document.querySelector("button[type=submit]") as HTMLButtonElement).textContent?.includes("Processing"));
    await expect.poll(() => alerts.length).toBe(1);

    expect(calls.find((call) => call.procedure === "appointments.create")?.input).toMatchObject({ appointmentDate: chosen, language: "en", customerPhone: "+971 50 123 4567" });
    expect(alerts[0]).toBe(bookingContent.en.refusals.slot_taken);
    expect(alerts[0]).not.toContain("créneau");
    // L'agenda est rechargé pour que la grille ne propose plus l'horaire pris.
    await expect.poll(() => calls.filter((call) => call.procedure === "availability.getBookedSlots").length).toBeGreaterThan(1);
    await page.context().close();
  }, 60_000);

  it("donne le temps restant du paiement en attente, et l'heure du créneau avec son fuseau (RES-04)", async () => {
    const appointmentDate = listBookableSlots(EVENING_SLOTS, [])[0].start;
    const pending = {
      trackingId: "APTPENDING0001",
      checkoutSessionId: "cs_test_pending",
      customerName: "Test Patient",
      customerEmail: "patient@example.test",
      finalPrice: 150,
      appointmentDate: appointmentDate.toISOString(),
      holdExpiresAt: new Date(Date.now() + 28.5 * 60 * 1000).toISOString(),
    };
    const { page } = await open("/booking", bookingProcedures(), { timezoneId: "America/Montreal", session: { "booking:pending:v1": JSON.stringify(pending) } });
    const card = page.getByRole("region", { name: bookingContent.fr.pending.title });
    const text = await card.innerText();
    expect(text).toMatch(/Temps restant pour payer : encore 2[78] min/);
    expect(text).toContain("(heure de Paris)");
    expect(text).toContain(`soit ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Montreal" }).format(appointmentDate)} chez vous`);
    expect(text).not.toContain("Réservé jusqu’à");
    await page.context().close();
  }, 60_000);

  it("ferme le paiement en attente à l'échéance sans demander les réservations d'un jour vide (RES-04)", async () => {
    const pending = {
      trackingId: "APTEXPIRING01",
      checkoutSessionId: "cs_test_expiring",
      customerName: "Test Patient",
      customerEmail: "patient@example.test",
      finalPrice: 150,
      appointmentDate: listBookableSlots(EVENING_SLOTS, [])[0].start.toISOString(),
      holdExpiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    };
    const { page, calls } = await open("/booking", bookingProcedures({
      // Comme le serveur (calendarDateInput) : un jour vide est refusé.
      "availability.getBookedSlots": ({ date }) => (date ? [] : refuse("BAD_REQUEST", 400, "Invalid date")),
    }), { session: { "booking:pending:v1": JSON.stringify(pending) }, beforeGoto: (page) => page.clock.install() });
    const card = page.getByRole("region", { name: bookingContent.fr.pending.title });
    await card.waitFor();

    await page.clock.fastForward("03:00");
    await page.getByText(bookingContent.fr.pending.closed).waitFor();
    expect(await card.count()).toBe(0);
    // Aucun jour choisi : rien à recharger, et pas d'erreur de disponibilité affichée.
    expect(calls.filter((call) => call.procedure === "availability.getBookedSlots")).toEqual([]);
    const status = page.locator("#availability-status");
    expect(await status.getAttribute("data-state")).toBe("select");
    expect(await status.innerText()).not.toBe(bookingContent.fr.form.availabilityError);
    await page.context().close();
  }, 60_000);

  it("ne dit « déjà réservés » que si les réservations ont pris tous les horaires du jour (RES-02)", async () => {
    const [firstDay, secondDay] = openDays();
    const secondDayStarts = listBookableSlots(EVENING_SLOTS, []).filter((slot) => slot.dayKey === secondDay).map((slot) => slot.start);
    let blocked: Array<{ date: string }> = [];
    const { page, alerts } = await open("/booking", bookingProcedures({
      "availability.getBlockedDates": () => blocked,
      "availability.getBookedSlots": ({ date }) => (date === secondDay ? secondDayStarts : []),
      // Le jour vient d'être fermé dans l'administration pendant que la page était ouverte.
      "appointments.create": () => {
        blocked = [{ date: firstDay }];
        return refuse("CONFLICT", 409, "Cette date est indisponible", "date_blocked");
      },
    }));
    const grid = page.getByRole("group", { name: bookingContent.fr.form.slotsLegend });

    await page.locator("#booking-day").selectOption(secondDay);
    await grid.getByText(bookingContent.fr.form.noSlotsThisDay).waitFor();

    await page.locator("#booking-name").fill("Test Patient");
    await page.locator("#booking-email").fill("patient@example.test");
    await page.locator("#booking-phone").fill("+33 6 12 34 56 78");
    await page.locator("#booking-day").selectOption(firstDay);
    await grid.getByRole("radio").first().locator("xpath=..").click();
    await page.locator("#booking-details").fill("Questions pratiques");
    await page.locator("#availability-status[data-state='available']").waitFor();
    await page.getByRole("button", { name: bookingContent.fr.form.submit }).click();
    await expect.poll(() => alerts).toEqual([bookingContent.fr.refusals.date_blocked]);

    // Jour fermé : la grille ne prétend pas que tout est réservé, comme la ligne d'état.
    await grid.getByText(bookingContent.fr.form.noSlotsLeftThisDay).waitFor();
    expect(await grid.innerText()).not.toContain(bookingContent.fr.form.noSlotsThisDay);
    expect(await page.locator("#availability-status").innerText()).toBe(bookingContent.fr.form.blocked);
    await page.context().close();
  }, 60_000);

  it("garde le créneau du brouillon tant que l'agenda n'est pas chargé, puis le reprend (RES-02)", async () => {
    const slot = listBookableSlots(EVENING_SLOTS, []).find((option) => option.dayKey === openDays()[1])!;
    const draft = { name: "Test Patient", email: "patient@example.test", phone: "+33 6 12 34 56 78", appointmentDate: slot.start.toISOString(), details: "" };
    const storedDraft = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("booking:draft:v1") ?? "null"));

    const offline = await open("/booking", bookingProcedures({
      "availability.getSlots": () => refuse("INTERNAL_SERVER_ERROR", 500, "Internal error"),
    }), { session: { "booking:draft:v1": JSON.stringify(draft) } });
    await expect.poll(() => offline.page.locator("#booking-name").inputValue()).toBe("Test Patient");
    expect(await storedDraft(offline.page)).toEqual(draft);
    await offline.page.locator("#booking-details").fill("Questions pratiques");
    await expect.poll(() => storedDraft(offline.page)).toEqual({ ...draft, details: "Questions pratiques" });
    await offline.page.context().close();

    const online = await open("/booking", bookingProcedures(), { session: { "booking:draft:v1": JSON.stringify(draft) } });
    await online.page.locator(`input[name="booking-slot"][value="${draft.appointmentDate}"]:checked`).waitFor({ state: "attached" });
    expect(await online.page.locator("#booking-day").inputValue()).toBe(slot.dayKey);
    await online.page.context().close();
  }, 60_000);

  it("rappelle la date, la durée et le montant d'un rendez-vous confirmé et propose le fichier agenda (RES-05)", async () => {
    const start = parisBookingSlotStart(toParisBookingDateKey(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)), "19:00")!;
    const { page, calls } = await open("/booking/confirmation?status=success&trackingId=APTCONFIRM0001&session_id=cs_test_confirmed", {
      "appointments.publicStatus": () => ({ state: "confirmed", appointment: { appointmentDate: start.toISOString(), durationMinutes: 30, amountEur: 150 } }),
    });
    const details = page.getByRole("definition");
    await details.first().waitFor();
    const text = (await details.allInnerTexts()).join(" | ");
    expect(text).toContain(`${new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(start)} (heure de Paris)`);
    expect(text).toContain("30 minutes");
    expect(text.replace(/\s/g, " ")).toContain("150,00 €");
    expect(calls[0].input).toEqual({ trackingId: "APTCONFIRM0001", sessionId: "cs_test_confirmed" });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: confirmationContent.fr.appointment.addToCalendar }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("consultation-APTCONFIRM0001.ics");
    const ics = await import("node:fs/promises").then(async (fs) => fs.readFile(await download.path(), "utf8"));
    const utc = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
    expect(ics).toContain(`DTSTART:${utc(start)}`);
    expect(ics).toContain(`DTEND:${utc(new Date(start.getTime() + 30 * 60 * 1000))}`);
    expect(ics.replace(/\r\n /g, "")).toContain("APTCONFIRM0001");
    await page.context().close();
  }, 60_000);

  it("remplace « se met à jour automatiquement » après 2 min sans confirmation (RES-05)", async () => {
    const { page } = await open("/booking/confirmation?status=success&trackingId=APTWAITING0001&session_id=cs_test_waiting", {
      "appointments.publicStatus": () => ({ state: "processing" }),
    }, { beforeGoto: (page) => page.clock.install() });
    const description = page.locator("[data-state='processing'] p").first();
    await expect.poll(() => description.innerText()).toContain(confirmationContent.fr.processing.autoUpdate);
    expect(await page.getByRole("definition").count()).toBe(0);
    expect(await page.getByRole("button", { name: confirmationContent.fr.appointment.addToCalendar }).count()).toBe(0);

    await page.clock.fastForward("02:01");
    await expect.poll(() => description.innerText()).toContain(confirmationContent.fr.processing.stalled);
    expect(await description.innerText()).not.toContain(confirmationContent.fr.processing.autoUpdate);
    await page.context().close();
  }, 60_000);

  it("traduit aussi les limites anti-abus et le paiement indisponible, et n'affiche jamais le texte français d'un refus sans motif (EN-06)", async () => {
    const [firstDay] = openDays();
    const refusals = [
      refuse("TOO_MANY_REQUESTS", 429, "Trop de tentatives de réservation ont été effectuées. Veuillez réessayer dans une heure ou nous contacter directement.", "rate_limited"),
      refuse("TOO_MANY_REQUESTS", 429, "Vous avez déjà deux réservations en attente de paiement. Finalisez ou annulez l’un de ces paiements.", "too_many_holds"),
      refuse("SERVICE_UNAVAILABLE", 503, "Le service de paiement est momentanément indisponible. Votre créneau n’a pas été réservé.", "payment_unavailable"),
      // Refus sans motif connu : message générique de la page, jamais le texte du serveur.
      refuse("TOO_MANY_REQUESTS", 429, "Veuillez patienter avant de soumettre une nouvelle demande."),
    ];
    const { page, alerts } = await open("/booking", bookingProcedures({ "appointments.create": () => refusals.shift() }), { language: "en" });
    await page.locator("#booking-name").fill("Test Patient");
    await page.locator("#booking-email").fill("patient@example.test");
    await page.locator("#booking-phone").fill("+44 20 7946 0958");
    await page.locator("#booking-day").selectOption(firstDay);
    await page.getByRole("group", { name: bookingContent.en.form.slotsLegend }).getByRole("radio").first().locator("xpath=..").click();
    await page.locator("#booking-details").fill("Practical questions");

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await page.locator("#availability-status[data-state='available']").waitFor();
      await page.getByRole("button", { name: bookingContent.en.form.submit }).click();
      await expect.poll(() => alerts.length).toBe(attempt);
    }
    const { refusals: messages, bookingError } = bookingContent.en;
    expect(alerts).toEqual([messages.rate_limited, messages.too_many_holds, messages.payment_unavailable, bookingError]);
    for (const alert of alerts) expect(alert).not.toMatch(/réservation|paiement|Veuillez|créneau/);
    await page.context().close();
  }, 60_000);

  it("affiche une erreur et un bouton « Réessayer » quand les réservations du jour ne se chargent pas, sans perdre le focus du clavier (RES-02)", async () => {
    const [firstDay, secondDay] = openDays();
    const secondDayStarts = listBookableSlots(EVENING_SLOTS, []).filter((slot) => slot.dayKey === secondDay).map((slot) => slot.start);
    let bookedSlotsDown = true;
    let release = () => {};
    const { page, calls } = await open("/booking", bookingProcedures({
      // Service rétabli : la réponse est retenue jusqu'à release(), le temps de vérifier le bouton pendant le nouvel essai.
      "availability.getBookedSlots": ({ date }) => (bookedSlotsDown
        ? refuse("INTERNAL_SERVER_ERROR", 500, "Internal error")
        : new Promise((resolve) => { release = () => resolve(date === secondDay ? secondDayStarts : []); })),
    }), { language: "en" });
    await page.locator("#booking-day").selectOption(firstDay);
    const grid = page.getByRole("group", { name: bookingContent.en.form.slotsLegend });
    // L'erreur s'affiche après les nouvelles tentatives automatiques de la requête (environ 7 s).
    const retry = grid.getByRole("button", { name: bookingContent.en.form.retry });
    await retry.waitFor({ timeout: 20_000 });
    expect(await grid.getByRole("alert").innerText()).toContain(bookingContent.en.form.slotsError);
    expect(await grid.getByRole("radio").count()).toBe(0);
    const status = page.locator("#availability-status");
    expect(await status.getAttribute("data-state")).toBe("unavailable");
    expect(await status.innerText()).toBe(getBookingFormCopy("en").availabilityError);

    // Nouvel essai au clavier : le bouton garde le focus pendant la requête, un second appui
    // ne relance rien, puis le focus passe au premier horaire de la grille qui le remplace.
    const bookedSlotsCalls = () => calls.filter((call) => call.procedure === "availability.getBookedSlots").length;
    const isFocused = (element: Element) => element === document.activeElement;
    const attempts = bookedSlotsCalls();
    bookedSlotsDown = false;
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect.poll(bookedSlotsCalls).toBe(attempts + 1);
    const pendingRetry = grid.getByRole("alert").getByRole("button");
    expect(await pendingRetry.getAttribute("aria-disabled")).toBe("true");
    expect(await pendingRetry.innerText()).toBe(getBookingFormCopy("en").checkingAvailability);
    expect(await pendingRetry.evaluate(isFocused)).toBe(true);
    await page.keyboard.press("Enter");
    release();
    const firstSlot = grid.getByRole("radio").first();
    await firstSlot.waitFor({ state: "attached" });
    await expect.poll(() => firstSlot.evaluate(isFocused)).toBe(true);
    expect(bookedSlotsCalls()).toBe(attempts + 1);
    expect(await grid.getByRole("alert").count()).toBe(0);
    expect(await status.getAttribute("data-state")).toBe("select");

    // Jour déjà entièrement réservé : le focus passe sur le message qui remplace la grille.
    bookedSlotsDown = true;
    await page.locator("#booking-day").selectOption(secondDay);
    await retry.waitFor({ timeout: 20_000 });
    const failures = bookedSlotsCalls();
    bookedSlotsDown = false;
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect.poll(bookedSlotsCalls).toBe(failures + 1);
    release();
    const fullyBooked = grid.getByText(bookingContent.en.form.noSlotsThisDay);
    await fullyBooked.waitFor();
    await expect.poll(() => fullyBooked.evaluate(isFocused)).toBe(true);
    await page.context().close();
  }, 60_000);

  it("écrit le fichier agenda et le libellé du contact avec la ponctuation de la langue de la page (RES-05)", async () => {
    const start = parisBookingSlotStart(toParisBookingDateKey(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)), "19:00")!;
    const { page } = await open("/booking/confirmation?status=success&trackingId=APTCONFIRM0002&session_id=cs_test_confirmed", {
      "appointments.publicStatus": () => ({ state: "confirmed", appointment: { appointmentDate: start.toISOString(), durationMinutes: 30, amountEur: 150 } }),
    }, { language: "en" });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: confirmationContent.en.appointment.addToCalendar }).click(),
    ]);
    const ics = await import("node:fs/promises").then(async (fs) => fs.readFile(await download.path(), "utf8"));
    const description = ics.replace(/\r\n /g, "").split("\r\n").find((line) => line.startsWith("DESCRIPTION:"))!;
    expect(description).toContain("DESCRIPTION:Reference: APTCONFIRM0002\\nDuration: 30 minutes\\nAmount paid: €150.00\\nContact us: ");
    expect(description).not.toContain(" :");
    // Même ponctuation sur la page, pour le libellé du contact.
    const pageText = await page.locator("main").innerText();
    expect(pageText).toContain(`${confirmationContent.en.contactTitle}: `);
    expect(pageText).not.toContain(" :");
    await page.context().close();
  }, 60_000);

  it("laisse remonter le texte de la confirmation au-dessus de la pastille « Préférences cookies » sur téléphone (RES-05)", async () => {
    const start = parisBookingSlotStart(toParisBookingDateKey(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)), "19:00")!;
    // Pixel 7, en anglais, choix cookies déjà fait : la pastille reste en bas à gauche de l'écran.
    const { page } = await open("/booking/confirmation?status=success&trackingId=APTCONFIRM0003&session_id=cs_test_confirmed", {
      "appointments.publicStatus": () => ({ state: "confirmed", appointment: { appointmentDate: start.toISOString(), durationMinutes: 30, amountEur: 150 } }),
    }, { language: "en", timezoneId: "Asia/Dubai", context: { viewport: { width: 412, height: 839 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true } });
    await page.getByRole("definition").first().waitFor();
    await page.getByRole("button", { name: cookieCopy.en.settings }).waitFor();
    await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === "page-transition-enter").map((animation) => animation.finished)));

    // Chaque texte et chaque commande, amené en bas de l'écran comme le fait le navigateur pour un focus.
    const covered = await page.evaluate(async () => {
      const shortcut = document.querySelector(".cookie-preferences-shortcut")!;
      const blocks = [...document.querySelectorAll<HTMLElement>("main :is(h1, h2, p, li, dt, dd, a[href], button), footer :is(p, a[href])")]
        .filter((element) => element.getBoundingClientRect().width > 0 && !shortcut.contains(element));
      const result: string[] = [];
      for (const block of blocks) {
        block.scrollIntoView({ block: "end", behavior: "instant" });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const box = block.getBoundingClientRect();
        const pill = shortcut.getBoundingClientRect();
        if (box.left < pill.right && pill.left < box.right && box.top < pill.bottom && pill.top < box.bottom) {
          result.push(`${block.tagName.toLowerCase()} « ${(block.textContent ?? "").trim().slice(0, 50)} »`);
        }
      }
      return { count: blocks.length, result };
    });
    expect(covered.count).toBeGreaterThan(10);
    expect(covered.result).toEqual([]);
    await page.context().close();
  }, 60_000);
});
