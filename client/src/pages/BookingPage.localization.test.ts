import { describe, expect, it } from "vitest";
import { bookingContent } from "./BookingPage";

describe("localisation de la réservation", () => {
  it("affiche une aide de créneau dans toutes les langues prises en charge", () => {
    Object.values(bookingContent).forEach(content => {
      expect(content.form.dateHint).toBeTruthy();
    });
  });

  it("affiche une information d’urgence explicite dans toutes les langues prises en charge", () => {
    Object.values(bookingContent).forEach(content => {
      expect(content.emergencyTitle).toBeTruthy();
      expect(content.emergencyNote).toContain("112");
    });
  });
});
