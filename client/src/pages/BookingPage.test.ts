import { describe, expect, it } from "vitest";
import { formatRateAmount } from "@shared/bookingPolicy";
import { isBookableAppointmentTime, parisWallClockTime } from "@shared/parisTime";
import { bookingContent, getBookingAvailabilityState, getBookingErrorMessage, isBookingInputError, listBookableSlots, parisBookingSlotStart, toParisBookingDateKey } from "./BookingPage";
import { getFaqContent } from "./faqContent";

describe("booking day and time choice", () => {
  it("labels the day choice and the time grid in every supported language", () => {
    expect(bookingContent.fr.form.slotsLegend).toBe("Horaire (heure de Paris)");
    expect(bookingContent.en.form.slotsLegend).toBe("Time (Paris time)");
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(bookingContent[language].form.day).toBeTruthy();
      expect(bookingContent[language].form.dayPlaceholder).toBeTruthy();
      expect(bookingContent[language].form.openingHours).toBeTruthy();
      expect(bookingContent[language].form.noBookableDay).toContain("90");
      expect(bookingContent[language].form.noAvailability).toBeTruthy();
      expect(bookingContent[language].form.outsideSchedule).toBeTruthy();
    }
  });

  it("interprète toujours le créneau choisi en heure de Paris", () => {
    const parsed = parisBookingSlotStart("2026-08-21", "10:00");
    expect(parsed?.toISOString()).toBe("2026-08-21T08:00:00.000Z");
    expect(parisBookingSlotStart("2026-09-03", "10:30")?.toISOString()).toBe("2026-09-03T08:30:00.000Z");
    expect(parisBookingSlotStart("2026-01-15", "10:00")?.toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(toParisBookingDateKey(parsed!)).toBe("2026-08-21");
    expect(parisBookingSlotStart("2026-02-31", "10:00")).toBeNull();
    expect(parisBookingSlotStart("2026-08-21", "25:00")).toBeNull();
  });

  it("refuse une liste vide et les heures hors des créneaux de 30 minutes", () => {
    const mondaySlot = [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00" }];
    expect(isBookableAppointmentTime(parisBookingSlotStart("2026-08-17", "09:30")!, mondaySlot)).toBe(true);
    expect(isBookableAppointmentTime(parisBookingSlotStart("2026-08-17", "09:15")!, mondaySlot)).toBe(false);
    expect(isBookableAppointmentTime(parisBookingSlotStart("2026-08-17", "09:30")!, [])).toBe(false);
  });

  it("lit le jour et l’heure de Paris par le module partagé avec le serveur (CODE-08)", () => {
    // Heure sautée au passage à l’heure d’été : ni la page ni le serveur ne la décalent.
    expect(parisBookingSlotStart("2026-03-29", "02:30")).toBeNull();
    expect(parisWallClockTime(2026, 3, 29, 2, 30)).toBeNull();
    expect(parisBookingSlotStart("2026-03-29", "03:30")?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // Minuit et demi à Paris appartient encore au jour de Paris, même si UTC est la veille.
    expect(toParisBookingDateKey(new Date("2026-11-04T23:30:00.000Z"))).toBe("2026-11-05");
    // La grille d’une plage de nuit (que l’API accepte : server/appointments.audit.test.ts).
    const slots = [{ dayOfWeek: 1, startTime: "22:00", endTime: "02:00" }, { dayOfWeek: 2, startTime: "09:00", endTime: "10:00" }];
    const offered = listBookableSlots(slots, [], Date.UTC(2026, 7, 14, 8));
    expect(offered.slice(0, 7).map(slot => `${slot.dayKey} ${slot.time}`)).toEqual([
      "2026-08-17 22:00", "2026-08-17 22:30", "2026-08-17 23:00", "2026-08-17 23:30", "2026-08-18 00:00", "2026-08-18 00:30", "2026-08-18 01:00",
    ]);
  });

  it("affiche les tarifs et la plage de nuit de shared/bookingPolicy.ts, sans en changer le texte (CODE-09)", () => {
    expect([bookingContent.fr.pricing.dayRate, bookingContent.fr.pricing.nightRate]).toEqual(["Tarif jour (8h-18h)", "Tarif nuit (18h-8h)"]);
    expect([bookingContent.en.pricing.dayRate, bookingContent.en.pricing.nightRate]).toEqual(["Day Rate (8am-6pm)", "Night Rate (6pm-8am)"]);
    expect([bookingContent.de.pricing.dayRate, bookingContent.de.pricing.nightRate]).toEqual(["Tagessatz (8:00-18:00)", "Nachtsatz (18:00-8:00)"]);
    expect([bookingContent.zh.pricing.dayRate, bookingContent.zh.pricing.nightRate]).toEqual(["日间费率 (8:00-18:00)", "夜间费率 (18:00-8:00)"]);
    // La FAQ annonce les mêmes montants et la même plage que la page (prix encaissé : server/appointments.audit.test.ts).
    const feeAnswer = (language: "fr" | "en" | "de" | "zh") => getFaqContent(language).entries[1].answer;
    expect(feeAnswer("fr")).toBe("La durée habituelle est de 30 minutes. Le tarif de base est de 100 € ; entre 18 h et 8 h, le tarif majoré est de 150 €.");
    expect(feeAnswer("en")).toBe("A standard consultation lasts 30 minutes. The base fee is €100; between 6 pm and 8 am, the enhanced fee is €150.");
    expect(feeAnswer("de")).toBe("Eine Standardberatung dauert 30 Minuten. Der Grundpreis beträgt 100 €; zwischen 18 und 8 Uhr beträgt der erhöhte Preis 150 €.");
    expect(feeAnswer("zh")).toBe("标准咨询时长为 30 分钟。基础费用为 100 欧元；18 时至 8 时的加价费用为 150 欧元。");
    // Un formateur gardé par locale et par nombre de décimales : un tarif avec centimes ne change pas l’écriture d’un tarif rond.
    expect([formatRateAmount(12050, "fr-FR"), formatRateAmount(10000, "fr-FR"), formatRateAmount(12050, "en-GB"), formatRateAmount(15000, "en-GB")]).toEqual(["120,50", "100", "120.50", "150"]);
  });

  it("distingue explicitement les états de disponibilité du créneau", () => {
    expect(getBookingAvailabilityState({ selected: false, pending: false, blocked: false, booked: false })).toBe("select");
    expect(getBookingAvailabilityState({ selected: true, pending: true, blocked: false, booked: false })).toBe("checking");
    expect(getBookingAvailabilityState({ selected: true, pending: false, blocked: true, booked: false })).toBe("unavailable");
    expect(getBookingAvailabilityState({ selected: true, pending: false, blocked: false, booked: true })).toBe("unavailable");
    expect(getBookingAvailabilityState({ selected: true, pending: false, blocked: false, booked: false })).toBe("available");
  });

  it("traduit chaque refus à partir de son motif et n’affiche jamais le texte du serveur (EN-06)", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = bookingContent[language];
      expect(getBookingErrorMessage({ message: "Trop de tentatives de réservation ont été effectuées.", data: { code: "TOO_MANY_REQUESTS", reason: "rate_limited" } }, copy)).toBe(copy.refusals.rate_limited);
      expect(getBookingErrorMessage({ message: "Vous avez déjà deux réservations en attente de paiement.", data: { code: "TOO_MANY_REQUESTS", reason: "too_many_holds" } }, copy)).toBe(copy.refusals.too_many_holds);
      expect(getBookingErrorMessage({ message: "Le service de paiement est momentanément indisponible.", data: { code: "SERVICE_UNAVAILABLE", reason: "payment_unavailable" } }, copy)).toBe(copy.refusals.payment_unavailable);
      expect(getBookingErrorMessage({ message: "Ce créneau n’est plus réservable", data: { code: "UNPROCESSABLE_CONTENT", reason: "too_soon" } }, copy)).toBe(copy.refusals.too_soon);
      // Saisie refusée avec un motif (nom sans lettre ni chiffre) : son message, pas la consigne générale.
      expect(getBookingErrorMessage({ message: "Saisissez votre nom complet", data: { code: "BAD_REQUEST", reason: "invalid_name" } }, copy)).toBe(copy.refusals.invalid_name);
      // Champ refusé pour ses caractères (INTL-05) : à retaper, pas la consigne générale de saisie.
      expect(getBookingErrorMessage({ message: "Un champ contient un saut de ligne", data: { code: "BAD_REQUEST", reason: "invalid_characters" } }, copy)).toBe(copy.refusals.invalid_characters);
      expect(copy.refusals.invalid_characters).not.toBe(copy.invalidInput);
      // Vérification anti-robot impossible (ABUS-02) : le service est indisponible, pas « refaites la vérification ».
      expect(getBookingErrorMessage({ message: "La vérification anti-robot est momentanément indisponible.", data: { code: "SERVICE_UNAVAILABLE", reason: "security_check_unavailable" } }, copy)).toBe(copy.refusals.security_check_unavailable);
      expect(copy.refusals.security_check_unavailable).not.toBe(copy.refusals.security_check_required);

      // Refus sans motif connu (motif absent ou inconnu) : message générique traduit, sans le texte français.
      expect(getBookingErrorMessage({ message: "Vous avez déjà deux réservations en attente de paiement.", data: { code: "TOO_MANY_REQUESTS" } }, copy)).toBe(copy.bookingError);
      expect(getBookingErrorMessage({ message: "Ce créneau chevauche une réservation existante", data: { code: "CONFLICT", reason: "something_else" } }, copy)).toBe(copy.bookingError);
      // Erreurs techniques : rien n’est exposé ; une saisie refusée reçoit une consigne localisée.
      expect(getBookingErrorMessage({ message: "Failed to create appointment: connection reset", data: { code: "INTERNAL_SERVER_ERROR" } }, copy)).toBe(copy.bookingError);
      expect(getBookingErrorMessage({ message: "[{\"code\":\"invalid_string\"}]", data: { code: "BAD_REQUEST" } }, copy)).toBe(copy.invalidInput);
      expect(getBookingErrorMessage(new Error("Network request failed"), copy)).toBe(copy.bookingError);
      expect(getBookingErrorMessage(null, copy)).toBe(copy.bookingError);
      expect(getBookingErrorMessage("CONFLICT", copy)).toBe(copy.bookingError);
    }
    expect(bookingContent.en.refusals.too_many_holds).not.toMatch(/réservation|attente/);
    expect(bookingContent.de.refusals.payment_unavailable).toContain("Zahlungsdienst");
    expect(bookingContent.en.refusals.invalid_characters).toBe("A field contains a line break or an invisible character that is not accepted there, often left by copying and pasting: type that text again on the keyboard, then send the form again.");
  });

  it("applique côté client le délai minimal, l’horizon et le contrôle du téléphone, avec un libellé dans chaque langue", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(bookingContent[language].form.tooSoon).toContain("2");
      expect(bookingContent[language].form.tooFar).toContain("90");
      expect(bookingContent[language].form.windowHint).toContain("90");
      expect(bookingContent[language].form.invalidPhone).toBeTruthy();
    }
    // The page applies them before sending: BookingPage.render.test.ts.
    expect(getBookingErrorMessage({ message: "Ce créneau n’est plus réservable", data: { code: "UNPROCESSABLE_CONTENT", reason: "too_soon" } }, bookingContent.de))
      .toBe(bookingContent.de.form.tooSoon);
  });

  it("donne la consigne « paiement indisponible » dans la langue de la page et un message localisé pour une saisie refusée", () => {
    expect(getBookingErrorMessage({ message: "Le service de paiement est momentanément indisponible.", data: { code: "SERVICE_UNAVAILABLE", reason: "payment_unavailable" } }, bookingContent.zh))
      .toBe(bookingContent.zh.refusals.payment_unavailable);
    expect(isBookingInputError({ message: "[{\"code\":\"custom\"}]", data: { code: "BAD_REQUEST" } })).toBe(true);
    expect(isBookingInputError({ data: { code: "CONFLICT" } })).toBe(false);
    for (const language of ["fr", "en", "de", "zh"] as const) expect(bookingContent[language].invalidInput).toBeTruthy();
  });

});
