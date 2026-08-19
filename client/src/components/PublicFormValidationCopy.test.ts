import { describe, expect, it } from "vitest";
import { contactCopy } from "./ContactSection";
import { gdprRequestCopy } from "./GDPRRequestForm";
import { bookingContent } from "../pages/BookingPage";

const languages = ["fr", "en", "de", "zh"] as const;

describe("messages de validation des formulaires publics", () => {
  it("fournit les retours Contact de succès, erreur et consentement dans les quatre langues", () => {
    for (const language of languages) {
      const copy = contactCopy[language];
      expect(copy.sent.length, language).toBeGreaterThan(0);
      expect(copy.sendError.length, language).toBeGreaterThan(0);
      expect(copy.consentRequired.length, language).toBeGreaterThan(0);
      expect(copy.successTitle.length, language).toBeGreaterThan(0);
      expect(copy.sending.length, language).toBeGreaterThan(0);
    }
  });

  it("fournit les retours RGPD de succès, erreur et attente dans les quatre langues", () => {
    for (const language of languages) {
      const copy = gdprRequestCopy[language];
      expect(copy.submitted.length, language).toBeGreaterThan(0);
      expect(copy.error.length, language).toBeGreaterThan(0);
      expect(copy.received.length, language).toBeGreaterThan(0);
      expect(copy.sending.length, language).toBeGreaterThan(0);
    }
  });

  it("fournit les erreurs publiques de réservation et paiement dans les quatre langues", () => {
    for (const language of languages) {
      const copy = bookingContent[language];
      expect(copy.paymentError.length, language).toBeGreaterThan(0);
      expect(copy.bookingError.length, language).toBeGreaterThan(0);
    }
  });
});
