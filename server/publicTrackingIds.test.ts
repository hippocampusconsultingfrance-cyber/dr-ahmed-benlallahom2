import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONSULTATION_CHECKOUT_PRODUCT_NAME,
  consultationCheckoutProductData,
  createPublicTrackingId,
} from "./routers";
import { medicalQuestionTrackingId } from "./medicalQuestionsRouter";

const SAMPLE_SIZE = 2000;

// A failed assertion must not leave Math.random spied on for the next cases.
afterEach(() => vi.restoreAllMocks());

describe("numéros de suivi publics imprévisibles", () => {
  it("génère des numéros contact et RGPD au format historique, dans la colonne varchar(20)", () => {
    const random = vi.spyOn(Math, "random");
    for (const prefix of ["C", "G"] as const) {
      const ids = Array.from({ length: SAMPLE_SIZE }, () =>
        createPublicTrackingId(prefix)
      );
      for (const id of ids) {
        expect(id).toMatch(new RegExp(`^${prefix}[0-9A-Z]{12}$`));
        expect(id.length).toBeLessThanOrEqual(20);
      }
      expect(new Set(ids).size).toBe(SAMPLE_SIZE);
    }
    expect(random).not.toHaveBeenCalled();
  });

  it("génère des numéros de question santé QMED dans la colonne varchar(32)", () => {
    const random = vi.spyOn(Math, "random");
    const ids = Array.from({ length: SAMPLE_SIZE }, () =>
      medicalQuestionTrackingId()
    );
    expect(random).not.toHaveBeenCalled();
    for (const id of ids) {
      expect(id).toMatch(/^QMED-[0-9A-Z]{8}-[0-9A-Z]{5}$/);
      expect(id.length).toBeLessThanOrEqual(32);
    }
    expect(new Set(ids).size).toBe(SAMPLE_SIZE);
  });
});

describe("libellé Stripe Checkout en français", () => {
  // Jeudi 29 octobre 2026 à 19:00 à Paris (heure d’hiver, UTC+1).
  const thursdayEvening = new Date("2026-10-29T18:00:00.000Z");

  it("décrit la consultation, le numéro de rendez-vous et son heure de Paris en français", () => {
    expect(CONSULTATION_CHECKOUT_PRODUCT_NAME).toBe(
      "Consultation de conseil santé – 30 minutes"
    );
    expect(
      consultationCheckoutProductData("APT0123456789AB", thursdayEvening, "fr")
    ).toEqual({
      name: "Consultation de conseil santé – 30 minutes",
      description:
        "Rendez-vous : APT0123456789AB – jeu. 29 oct. 2026, 19:00, heure de Paris",
    });
  });

  it("rappelle la date et l’heure du rendez-vous dans la langue du patient (RES-14)", () => {
    const description = (language: string) =>
      consultationCheckoutProductData(
        "APT0123456789AB",
        thursdayEvening,
        language
      ).description;
    expect(description("en")).toBe(
      "Appointment: APT0123456789AB – Thu, 29 Oct 2026, 19:00, Paris time"
    );
    expect(description("de")).toBe(
      "Termin: APT0123456789AB – Do., 29. Okt. 2026, 19:00, Pariser Zeit"
    );
    expect(description("zh")).toBe(
      "预约：APT0123456789AB – 2026年10月29日周四 19:00，巴黎时间"
    );
    // Une langue inconnue reste en français ; le nom de la ligne ne change jamais.
    expect(description("xx")).toBe(description("fr"));
    expect(
      consultationCheckoutProductData("APT0123456789AB", thursdayEvening, "zh")
        .name
    ).toBe(CONSULTATION_CHECKOUT_PRODUCT_NAME);
  });

  it("lit l’heure à Paris, quel que soit le fuseau du serveur, en été comme en hiver", () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(
        consultationCheckoutProductData(
          "APT0123456789AB",
          new Date("2026-08-17T06:30:00.000Z"),
          "fr"
        ).description
      ).toBe(
        "Rendez-vous : APT0123456789AB – lun. 17 août 2026, 08:30, heure de Paris"
      );
      expect(
        consultationCheckoutProductData(
          "APT0123456789AB",
          thursdayEvening,
          "fr"
        ).description
      ).toContain("19:00, heure de Paris");
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });
});
