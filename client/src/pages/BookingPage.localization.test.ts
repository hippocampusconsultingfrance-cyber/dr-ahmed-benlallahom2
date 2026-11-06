import { describe, expect, it } from "vitest";
import { siteConfig } from "@/data/site-config";
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

  it("donne dans les quatre langues le téléphone du cabinet après trop d’essais, l’adresse de confirmation, la correction proposée et l’étape courante (RES-08, RES-10, A11Y-10)", () => {
    Object.values(bookingContent).forEach(content => {
      expect(content.refusals.rate_limited).toContain(siteConfig.phone);
      expect(content.form.confirmationTo("jeanne@example.test")).toContain("jeanne@example.test");
      expect(content.form.emailSuggestion("jeanne@gmail.com")).toContain("jeanne@gmail.com");
      expect(content.form.nearestSlots(["18:30", "19:00"])).toMatch(/18:30.+19:00/);
      expect(content.stepOf(2, 3)).toMatch(/2.+3/);
      expect(content.form.invalidEmail && content.form.useEmailSuggestion && content.form.suggestedSlot).toBeTruthy();
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
