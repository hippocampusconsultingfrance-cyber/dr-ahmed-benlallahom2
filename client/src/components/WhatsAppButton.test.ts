import { describe, expect, it } from "vitest";
import { showsWhatsAppButton, whatsappCopy } from "./WhatsAppButton";

describe("WhatsAppButton translations", () => {
  it("provides a prefilled message and accessible label in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(whatsappCopy[language].message.length, language).toBeGreaterThan(0);
      expect(whatsappCopy[language].label.length, language).toBeGreaterThan(0);
      expect(whatsappCopy[language].title.length, language).toBeGreaterThan(0);
    }
  });
});

// The floating widgets App mounts for each route: pages/CandidatePortalPage.test.ts.
describe("pages sans bouton WhatsApp flottant (PUB-12)", () => {
  it("le retire des formulaires et du recrutement, quelle que soit la forme de l'adresse", () => {
    for (const path of ["/booking", "/booking/", "/booking?lang=en", "/recruitment", "/recruitment/standard", "/recruitment/vvip-offshore#form", "/vvip-offshore", "/employers", "/questions-anesthesie", "/gdpr", "/Booking", "/BOOKING/", "/Recruitment/Standard", "/GDPR"]) {
      expect(showsWhatsAppButton(path), path).toBe(false);
    }
  });

  it("le garde sur les autres pages publiques, la confirmation de réservation comprise", () => {
    for (const path of ["/", "/faq", "/legal", "/booking/confirmation", "/recruitments", "/employers-guide", "/why-hippocampus"]) {
      expect(showsWhatsAppButton(path), path).toBe(true);
    }
  });
});
