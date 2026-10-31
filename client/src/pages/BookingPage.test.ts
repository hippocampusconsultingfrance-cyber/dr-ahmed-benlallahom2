import { describe, expect, it } from "vitest";
import { bookingContent, getBookingAvailabilityState, getBookingErrorMessage, isBookingInputError, isWithinBookingAvailability, parisBookingSlotStart, toParisBookingDateKey } from "./BookingPage";

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
    expect(isWithinBookingAvailability(parisBookingSlotStart("2026-08-17", "09:30")!, mondaySlot)).toBe(true);
    expect(isWithinBookingAvailability(parisBookingSlotStart("2026-08-17", "09:15")!, mondaySlot)).toBe(false);
    expect(isWithinBookingAvailability(parisBookingSlotStart("2026-08-17", "09:30")!, [])).toBe(false);
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
