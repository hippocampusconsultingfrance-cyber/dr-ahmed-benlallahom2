import { describe, expect, it } from "vitest";
import { bookingContent } from "./BookingPage";

describe("localisation de la réservation", () => {
  it("affiche une aide de créneau dans toutes les langues prises en charge", () => {
    Object.values(bookingContent).forEach(content => {
      expect(content.form.dateHint).toBeTruthy();
      expect(content.form.slotsLegend).toBeTruthy();
    });
  });

  it("affiche une information d’urgence explicite dans toutes les langues prises en charge", () => {
    Object.values(bookingContent).forEach(content => {
      expect(content.emergencyTitle).toBeTruthy();
      expect(content.emergencyNote.length).toBeGreaterThan(20);
      expect(content.emergencyNote).not.toMatch(/\b112\b/);
    });
  });

  it("conserve les CTA et états de paiement actionnables dans les quatre langues", () => {
    Object.values(bookingContent).forEach(content => {
      expect(content.form.submit).toBeTruthy();
      expect(content.form.loading).toBeTruthy();
      expect(content.form.availabilityError).toBeTruthy();
      expect(content.restartBooking).toBeTruthy();
    });
  });
});
