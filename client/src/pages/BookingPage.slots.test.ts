import { describe, expect, it } from "vitest";
import {
  bookingContent,
  formatBookingDay,
  getBookingRefusalReason,
  getHoldRemainingMinutes,
  listBookableSlots,
  overlapsBookedSlot,
  parisBookingSlotStart,
  removeBookedSlots,
  summarizeBookingAvailability,
  toParisBookingDateKey,
} from "./BookingPage";
import { BOOKING_REFUSAL_REASONS } from "@shared/bookingPolicy";

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
    expect(getBookingRefusalReason({ data: { code: "UNPROCESSABLE_CONTENT", reason: "too_soon" } })).toBe("too_soon");
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
