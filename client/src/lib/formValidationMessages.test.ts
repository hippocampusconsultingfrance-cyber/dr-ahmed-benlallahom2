import { bookingContent } from "@/pages/BookingPage";
import { describe, expect, it } from "vitest";
import { publicFormCopy } from "./publicFormCopy";

describe("messages de validation des formulaires publics", () => {
  it("fournit dans les quatre langues des retours exploitables pour Contact, RGPD et Réservation", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const contact = publicFormCopy.contact[language];
      const gdpr = publicFormCopy.gdpr[language];
      const booking = bookingContent[language];

      for (const message of [contact.sendError, contact.consentRequired, contact.sending, gdpr.error, gdpr.sending, booking.form.noSlotsThisDay, booking.form.noSlotsLeftThisDay, booking.refusals.slot_taken, booking.form.availabilityError, booking.form.loading]) {
        expect(message.trim().length, `${language}: ${message}`).toBeGreaterThan(4);
      }
    }
  });
});
