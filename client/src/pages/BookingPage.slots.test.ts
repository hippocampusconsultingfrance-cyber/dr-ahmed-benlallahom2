import { describe, expect, it, vi } from "vitest";
import {
  bookableSlotRange,
  bookingContent,
  formatBookingDay,
  getBookingClockSignature,
  getBookingRefusalReason,
  getHoldRemainingMinutes,
  listBookableSlots,
  overlapsBookedSlot,
  parisBookingSlotStart,
  removeBookedSlots,
  summarizeBookingAvailability,
  toParisBookingDateKey,
} from "./BookingPage";
import { BOOKING_REFUSAL_REASONS, getBookingWindowIssue } from "@shared/bookingPolicy";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const timesOn = (slots: ReturnType<typeof listBookableSlots>, dayKey: string) => slots.filter((slot) => slot.dayKey === dayKey).map((slot) => slot.time);
const allWeek = (startTime: string, endTime: string) => Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime, endTime }));

// Lundi 2 novembre 2026, 08:00 à Paris (UTC+1).
const MONDAY_8AM = Date.UTC(2026, 10, 2, 7, 0);

describe("créneaux proposés par la grille de réservation (RES-02)", () => {
  it("lit chaque horaire en heure de Paris, quel que soit le fuseau du visiteur", () => {
    expect(parisBookingSlotStart("2026-08-21", "10:00")?.toISOString()).toBe("2026-08-21T08:00:00.000Z");
    expect(parisBookingSlotStart("2026-01-15", "10:00")?.toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(toParisBookingDateKey(parisBookingSlotStart("2026-11-05", "00:30")!)).toBe("2026-11-05");
    expect(parisBookingSlotStart("2026-02-31", "10:00")).toBeNull();
    expect(parisBookingSlotStart("2026-08-21", "25:00")).toBeNull();
  });

  it("découpe les plages en créneaux de 30 min et respecte le délai de 2 h", () => {
    const slots = listBookableSlots([{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00" }], [], MONDAY_8AM);
    // 09:00 et 09:30 commencent dans moins de 2 h ; 10:00 commence pile dans 2 h.
    expect(timesOn(slots, "2026-11-02")).toEqual(["10:00", "10:30"]);
    expect(timesOn(slots, "2026-11-09")).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    expect(slots[0].start.toISOString()).toBe("2026-11-02T09:00:00.000Z");
    // Seuls les lundis sont proposés, triés dans l'ordre.
    expect(new Set(slots.map((slot) => new Date(`${slot.dayKey}T12:00:00Z`).getUTCDay()))).toEqual(new Set([1]));
    expect(slots.map((slot) => slot.start.getTime())).toEqual([...slots.map((slot) => slot.start.getTime())].sort((a, b) => a - b));
  });

  it("ne propose rien au-delà de 90 jours", () => {
    const slots = listBookableSlots(allWeek("00:00", "00:00"), [], MONDAY_8AM);
    expect(slots[0].start.toISOString()).toBe(new Date(MONDAY_8AM + 2 * HOUR).toISOString());
    expect(slots.at(-1)!.start.toISOString()).toBe(new Date(MONDAY_8AM + 90 * DAY).toISOString());
    expect(slots.every((slot) => slot.start.getTime() <= MONDAY_8AM + 90 * DAY)).toBe(true);
  });

  it("retire les dates bloquées, y compris le début de nuit d'une plage commencée la veille", () => {
    const slots = listBookableSlots([{ dayOfWeek: 0, startTime: "23:00", endTime: "01:00" }, { dayOfWeek: 1, startTime: "09:00", endTime: "10:00" }], ["2026-11-09"], MONDAY_8AM);
    expect(timesOn(slots, "2026-11-08")).toEqual(["23:00", "23:30"]);
    expect(timesOn(slots, "2026-11-09")).toEqual([]);
    expect(timesOn(slots, "2026-11-16")).toEqual(["00:00", "00:30", "09:00", "09:30"]);
  });

  it("prolonge une plage de nuit sur le lendemain, en heure de nuit", () => {
    const slots = listBookableSlots([{ dayOfWeek: 5, startTime: "22:00", endTime: "01:00" }], [], MONDAY_8AM);
    expect(timesOn(slots, "2026-11-06")).toEqual(["22:00", "22:30", "23:00", "23:30"]);
    expect(timesOn(slots, "2026-11-07")).toEqual(["00:00", "00:30"]);
    expect(slots.find((slot) => slot.dayKey === "2026-11-07" && slot.time === "00:30")?.start.toISOString()).toBe("2026-11-06T23:30:00.000Z");
  });

  it("saute l'heure qui n'existe pas au passage à l'heure d'été et ne double pas celle du retour à l'heure d'hiver", () => {
    const spring = listBookableSlots([{ dayOfWeek: 0, startTime: "00:00", endTime: "05:00" }], [], Date.UTC(2027, 2, 27, 9, 0));
    expect(timesOn(spring, "2027-03-28")).toEqual(["00:00", "00:30", "01:00", "01:30", "03:00", "03:30", "04:00", "04:30"]);
    expect(spring.find((slot) => slot.dayKey === "2027-03-28" && slot.time === "03:00")?.start.toISOString()).toBe("2027-03-28T01:00:00.000Z");

    const autumn = listBookableSlots([{ dayOfWeek: 0, startTime: "00:00", endTime: "05:00" }], [], Date.UTC(2026, 9, 24, 8, 0));
    const autumnTimes = timesOn(autumn, "2026-10-25");
    expect(autumnTimes).toEqual(["00:00", "00:30", "01:00", "01:30", "02:00", "02:30", "03:00", "03:30", "04:00", "04:30"]);
    for (const slot of autumn.filter((option) => option.dayKey === "2026-10-25")) {
      expect(parisBookingSlotStart(slot.dayKey, slot.time)?.getTime(), slot.time).toBe(slot.start.getTime());
    }
  });

  it("retire les horaires qui chevauchent un rendez-vous retenu ou confirmé", () => {
    const monday = listBookableSlots([{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00" }], [], MONDAY_8AM).filter((slot) => slot.dayKey === "2026-11-09");
    expect(removeBookedSlots(monday, [new Date("2026-11-09T08:30:00.000Z")]).map((slot) => slot.time)).toEqual(["09:00", "10:00", "10:30"]);
    // Un ancien rendez-vous décalé d'un quart d'heure bloque les deux créneaux qu'il recouvre.
    expect(removeBookedSlots(monday, ["2026-11-09T08:45:00.000Z"]).map((slot) => slot.time)).toEqual(["09:00", "10:30"]);
    expect(overlapsBookedSlot(new Date("2026-11-09T09:00:00.000Z"), [new Date("2026-11-09T08:30:00.000Z")])).toBe(false);
  });
});

describe("grille recalculée sans à-coups quand l'horloge avance (RES-02)", () => {
  it("garde les horaires du filtre de la fenêtre de réservation, sous forme d'intervalle qui ne bouge qu'au franchissement d'un horaire", () => {
    const options = listBookableSlots(allWeek("08:00", "23:30"), [], MONDAY_8AM);
    for (const offset of [-DAY, 0, 29 * 60 * 1000, 30 * 60 * 1000, 5 * HOUR, 26 * HOUR, 3 * DAY]) {
      const now = MONDAY_8AM + offset;
      const [first, end] = bookableSlotRange(options, now);
      expect(options.slice(first, end), `+${offset} ms`).toEqual(options.filter((slot) => !getBookingWindowIssue(slot.start, now)));
    }
    // Deux tics de 30 s sans horaire qui passe sous le délai de 2 h : même intervalle, grille inchangée.
    expect(bookableSlotRange(options, MONDAY_8AM + 30_000)).toEqual(bookableSlotRange(options, MONDAY_8AM + 60_000));
    expect(bookableSlotRange(options, MONDAY_8AM + 30_000)).not.toEqual(bookableSlotRange(options, MONDAY_8AM + 30 * 60 * 1000 + 30_000));
    expect(bookableSlotRange([], MONDAY_8AM)).toEqual([0, 0]);
  });

  it("ne refait le rendu à un tic d'horloge que si un horaire, le délai du créneau choisi ou les minutes restantes changent", () => {
    // Page ouverte à 08:01 (liste calculée à 08:00) : premier horaire 10:30.
    const base = MONDAY_8AM + 60_000;
    const openSlots = listBookableSlots(allWeek("08:00", "23:30"), [], MONDAY_8AM);
    const idle = { openSlots, selectedDate: null, holdExpiresAt: null };
    const tick = (offset: number, state: Parameters<typeof getBookingClockSignature>[1] = idle) => getBookingClockSignature(base + offset, state);
    // Rien ne change à 08:01:30, ni à 08:29.
    expect(tick(30_000)).toBe(tick(0));
    expect(tick(28 * 60 * 1000)).toBe(tick(0));
    // 08:30:30 : 10:30 passe sous le délai de 2 h et la liste des 90 jours est recalculée.
    expect(tick(29 * 60 * 1000 + 30_000)).not.toBe(tick(30_000));

    // Créneau choisi (11:30) qui passe sous le délai de 2 h à 09:30.
    const chosen = { ...idle, selectedDate: openSlots[3].start };
    const chosenDeadline = openSlots[3].start.getTime() - 2 * HOUR - base;
    expect(tick(30_000, chosen)).toBe(tick(0, chosen));
    expect(tick(chosenDeadline + 1, chosen)).not.toBe(tick(chosenDeadline - 1, chosen));

    // Paiement en attente : la minute affichée, puis l'échéance.
    const held = { ...idle, holdExpiresAt: new Date(base + 10 * 60 * 1000 + 15_000).toISOString() };
    expect(tick(10_000, held)).toBe(tick(0, held));
    expect(tick(30_000, held)).not.toBe(tick(0, held));
    expect(tick(10 * 60 * 1000 + 14_000, held)).not.toBe(tick(10 * 60 * 1000 + 16_000, held));
  });

  it("ne lit l'heure de Paris qu'une fois par heure UTC, puis presque plus une demi-heure plus tard", () => {
    const formatToParts = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts");
    // Mai 2031 : instants jamais lus par ce fichier, la mémoire part de zéro.
    const now = Date.UTC(2031, 4, 5, 6, 0);
    const slots = allWeek("08:00", "23:30");
    const options = listBookableSlots(slots, [], now);
    const firstReads = formatToParts.mock.calls.length;
    formatToParts.mockClear();
    const later = listBookableSlots(slots, [], now + 30 * 60 * 1000);
    const laterReads = formatToParts.mock.calls.length;
    formatToParts.mockRestore();

    expect(options.length).toBeGreaterThan(2500);
    // Recherche du décalage, vérification et contrôle des plages : quatre lectures par horaire auparavant,
    // désormais une par heure UTC parcourue.
    expect(firstReads).toBeLessThan(options.length);
    expect(laterReads).toBeLessThan(options.length / 20);
    // Même liste, moins le premier horaire passé sous le délai de 2 h.
    expect(later.slice(0, 5).map((slot) => slot.start.toISOString())).toEqual(options.slice(1, 6).map((slot) => slot.start.toISOString()));
  });
});

describe("plages d'ouverture affichées dès l'arrivée (RES-02)", () => {
  it("regroupe les plages par jour, du lundi au dimanche, en heure de Paris", () => {
    const slots = [
      { dayOfWeek: 1, startTime: "18:00", endTime: "22:00" },
      { dayOfWeek: 6, startTime: "09:00", endTime: "12:00" },
      { dayOfWeek: 1, startTime: "08:00", endTime: "10:00" },
      { dayOfWeek: 0, startTime: "22:00", endTime: "02:00" },
    ];
    expect(summarizeBookingAvailability(slots, "fr-FR")).toEqual([
      { day: "lun.", ranges: ["08:00–10:00", "18:00–22:00"] },
      { day: "sam.", ranges: ["09:00–12:00"] },
      { day: "dim.", ranges: ["22:00–02:00"] },
    ]);
    expect(summarizeBookingAvailability(allWeek("00:00", "00:00"), "en-GB")[0]).toEqual({ day: "Mon", ranges: ["00:00–24:00"] });
    expect(summarizeBookingAvailability([], "fr-FR")).toEqual([]);
    expect(formatBookingDay("2026-11-05", "fr-FR")).toBe("jeudi 5 novembre 2026");
  });
});

describe("heure locale du visiteur et temps restant (RES-04)", () => {
  it("présente l'heure locale à côté de l'heure de Paris dans chaque langue", () => {
    expect(bookingContent.fr.form.localTime("22:00")).toBe("soit 22:00 chez vous");
    expect(bookingContent.en.form.localTimeShort("22:00")).toBe("22:00 your time");
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(bookingContent[language].form.localTime("22:00")).toContain("22:00");
      expect(bookingContent[language].form.parisTime).toBeTruthy();
    }
  });

  it("donne le temps restant du créneau retenu plutôt qu'une heure de Paris", () => {
    const now = Date.UTC(2026, 9, 29, 12, 0);
    expect(getHoldRemainingMinutes(new Date(now + 28.5 * 60 * 1000).toISOString(), now)).toBe(28);
    expect(getHoldRemainingMinutes(new Date(now + 20 * 1000).toISOString(), now)).toBe(0);
    expect(getHoldRemainingMinutes(new Date(now - 60 * 1000).toISOString(), now)).toBe(0);
    expect(bookingContent.fr.pending.remainingValue(28)).toBe("encore 28 min");
    expect(bookingContent.fr.pending.remainingValue(0)).toBe("moins d’une minute");
    expect(bookingContent.en.pending.remainingValue(28)).toBe("28 min left");
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(bookingContent[language].pending.remaining).toBeTruthy();
      expect(bookingContent[language].pending.remainingValue(5)).toContain("5");
    }
  });
});

describe("refus de réservation traduits (EN-06)", () => {
  it("lit le motif stable renvoyé par le serveur et rien d'autre", () => {
    expect(getBookingRefusalReason({ message: "Ce créneau chevauche une réservation existante", data: { code: "CONFLICT", reason: "slot_taken" } })).toBe("slot_taken");
    expect(getBookingRefusalReason({ data: { code: "TOO_MANY_REQUESTS", reason: "rate_limited" } })).toBe("rate_limited");
    expect(getBookingRefusalReason({ data: { code: "TOO_MANY_REQUESTS", reason: "too_many_holds" } })).toBe("too_many_holds");
    expect(getBookingRefusalReason({ data: { code: "SERVICE_UNAVAILABLE", reason: "payment_unavailable" } })).toBe("payment_unavailable");
    expect(getBookingRefusalReason({ data: { code: "UNPROCESSABLE_CONTENT", reason: "too_soon" } })).toBe("too_soon");
    expect(getBookingRefusalReason({ data: { code: "SERVICE_UNAVAILABLE", reason: "security_check_unavailable" } })).toBe("security_check_unavailable");
    expect(getBookingRefusalReason({ data: { code: "CONFLICT", reason: "something_else" } })).toBeNull();
    expect(getBookingRefusalReason({ data: { code: "CONFLICT" } })).toBeNull();
    expect(getBookingRefusalReason(new Error("Network request failed"))).toBeNull();
    expect(getBookingRefusalReason(null)).toBeNull();
  });

  it("a un message pour chaque motif dans les quatre langues, sans texte français hors français", () => {
    for (const reason of BOOKING_REFUSAL_REASONS) {
      for (const language of ["fr", "en", "de", "zh"] as const) {
        expect(bookingContent[language].refusals[reason], `${language} ${reason}`).toBeTruthy();
        if (language !== "fr") expect(bookingContent[language].refusals[reason]).not.toBe(bookingContent.fr.refusals[reason]);
      }
    }
    expect(bookingContent.en.refusals.too_soon).toContain("2");
    expect(bookingContent.de.refusals.too_far).toContain("90");
  });
});
