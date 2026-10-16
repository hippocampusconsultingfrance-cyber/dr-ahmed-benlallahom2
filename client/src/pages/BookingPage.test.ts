import { describe, expect, it } from "vitest";
import { bookingContent, getBookingAvailabilityState, getBookingServerErrorMessage, isWithinBookingAvailability, parseBookingDateTime, toParisBookingDateKey } from "./BookingPage";

describe("booking date placeholders", () => {
  it("uses an explicit localized placeholder for every supported language", () => {
    expect(bookingContent.fr.form.datePlaceholder).toBe("JJ/MM/AAAA · HH:MM");
    expect(bookingContent.en.form.datePlaceholder).toBe("DD/MM/YYYY · HH:MM");
    expect(bookingContent.de.form.datePlaceholder).toBe("TT.MM.JJJJ · HH:MM");
    expect(bookingContent.zh.form.datePlaceholder).toBe("年/月/日 · 时:分");
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(bookingContent[language].form.noAvailability).toBeTruthy();
      expect(bookingContent[language].form.outsideSchedule).toBeTruthy();
    }
  });

  it("keeps date and time controls visible and keyboard accessible", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain('id="booking-date"');
    expect(source).toContain('id="booking-time"');
    expect(source).toContain('type="text"');
    expect(source).not.toContain('opacity-0');
  });

  it("aide la saisie tactile avec le remplissage automatique et les touches d’action", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain('autoComplete="name"');
    expect(source).toContain('autoComplete="email"');
    expect(source).toContain('autoComplete="tel"');
    expect(source).toContain('enterKeyHint="next"');
    expect(source).toContain('enterKeyHint="done"');
  });

  it("interprète toujours la saisie en heure de Paris", () => {
    const parsed = parseBookingDateTime("21/08/2026", "10:00");
    expect(parsed?.toISOString()).toBe("2026-08-21T08:00:00.000Z");
    expect(parseBookingDateTime("03/09/2026", "10:30")?.toISOString()).toBe("2026-09-03T08:30:00.000Z");
    expect(parseBookingDateTime("15/01/2026", "10:00")?.toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(toParisBookingDateKey(parsed!)).toBe("2026-08-21");
    expect(parseBookingDateTime("31/02/2026", "10:00")).toBeNull();
    expect(parseBookingDateTime("21/08/2026", "25:00")).toBeNull();
  });

  it("refuse une liste vide et les heures hors des créneaux de 30 minutes", () => {
    const mondaySlot = [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00" }];
    expect(isWithinBookingAvailability(parseBookingDateTime("17/08/2026", "09:30")!, mondaySlot)).toBe(true);
    expect(isWithinBookingAvailability(parseBookingDateTime("17/08/2026", "09:15")!, mondaySlot)).toBe(false);
    expect(isWithinBookingAvailability(parseBookingDateTime("17/08/2026", "09:30")!, [])).toBe(false);
  });

  it("distingue explicitement les états de disponibilité du créneau", () => {
    expect(getBookingAvailabilityState({ selected: false, pending: false, blocked: false, booked: false })).toBe("select");
    expect(getBookingAvailabilityState({ selected: true, pending: true, blocked: false, booked: false })).toBe("checking");
    expect(getBookingAvailabilityState({ selected: true, pending: false, blocked: true, booked: false })).toBe("unavailable");
    expect(getBookingAvailabilityState({ selected: true, pending: false, blocked: false, booked: true })).toBe("unavailable");
    expect(getBookingAvailabilityState({ selected: true, pending: false, blocked: false, booked: false })).toBe("available");
  });

  it("verrouille immédiatement une soumission de paiement répétée avant le rendu du bouton désactivé", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain("const paymentSubmissionRef = useRef(false)");
    expect(source).toContain("if (paymentSubmissionRef.current || isLoading) return;");
    expect(source).toContain("paymentSubmissionRef.current = true;");
    expect(source).toContain("paymentSubmissionRef.current = false;");
  });

  it("n’expose pas de détail technique dans les alertes publiques de paiement", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain("alert(content.paymentError);");
    expect(source).toContain("alert(content.bookingError);");
    expect(source).not.toContain("alert(`${content.paymentError} ${error.message}`)");
    expect(source).not.toContain("alert(`${content.bookingError} ${error instanceof Error ? error.message : \"Unknown error\"}`)");
    expect(source).not.toContain("alert(error.message)");
    expect(source).toContain("const serverMessage = getBookingServerErrorMessage(error);");
  });

  it("affiche le message français du serveur pour les refus métier attendus uniquement", () => {
    const holdsMessage = "Vous avez déjà deux réservations en attente de paiement.";
    expect(getBookingServerErrorMessage({ message: holdsMessage, data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 } })).toBe(holdsMessage);
    expect(getBookingServerErrorMessage({ message: " Ce créneau chevauche une réservation existante ", data: { code: "CONFLICT" } }))
      .toBe("Ce créneau chevauche une réservation existante");

    // Erreurs techniques ou de validation : rien n’est exposé, le libellé générique localisé s’applique.
    expect(getBookingServerErrorMessage({ message: "Failed to create appointment: connection reset", data: { code: "INTERNAL_SERVER_ERROR" } })).toBeNull();
    expect(getBookingServerErrorMessage({ message: "[{\"code\":\"invalid_string\"}]", data: { code: "BAD_REQUEST" } })).toBeNull();
    expect(getBookingServerErrorMessage(new Error("Network request failed"))).toBeNull();
    expect(getBookingServerErrorMessage({ message: "", data: { code: "CONFLICT" } })).toBeNull();
    expect(getBookingServerErrorMessage(null)).toBeNull();
    expect(getBookingServerErrorMessage("CONFLICT")).toBeNull();
  });

  it("applique côté client le délai minimal, l’horizon et le contrôle du téléphone, avec un libellé dans chaque langue", async () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(bookingContent[language].form.tooSoon).toContain("2");
      expect(bookingContent[language].form.tooFar).toContain("90");
      expect(bookingContent[language].form.windowHint).toContain("90");
      expect(bookingContent[language].form.invalidPhone).toBeTruthy();
    }
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );
    expect(source).toContain("const bookingWindowIssue = selectedDate ? getBookingWindowIssue(selectedDate) : null;");
    expect(source).toContain("Boolean(bookingWindowIssue) || !selectedDate");
    expect(source).toContain("if (!isPlausiblePhoneNumber(formData.phone))");
    expect(getBookingServerErrorMessage({ message: "Ce créneau n’est plus réservable", data: { code: "UNPROCESSABLE_CONTENT" } }))
      .toBe("Ce créneau n’est plus réservable");
  });

  it("réduit le poids visuel de l’illustration purement décorative", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("opacity-70 saturate-75");
  });

  it("bloque le paiement et informe sans détail technique quand les données asynchrones échouent", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain("availabilityError");
    expect(source).toContain("blockedDates.isError || bookedSlots.isError || availabilitySlots.isError");
    expect(source).toContain("availabilityQueryError || calculatePrice.isError");
    expect(source).toContain("disabled={isLoading || availabilityPending || availabilityError");
    expect(source).toContain("PublicContentSkeleton cards={1}");
    expect(source).toContain('role="alert"');
  });
});
