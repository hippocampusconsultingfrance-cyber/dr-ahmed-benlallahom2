import { afterEach, describe, expect, it, vi } from "vitest";
import { CONSULTATION_CHECKOUT_PRODUCT_NAME, consultationCheckoutProductData, createPublicTrackingId } from "./routers";
import { medicalQuestionTrackingId } from "./medicalQuestionsRouter";

const SAMPLE_SIZE = 2000;

// A failed assertion must not leave Math.random spied on for the next cases.
afterEach(() => vi.restoreAllMocks());

describe("numéros de suivi publics imprévisibles", () => {
  it("génère des numéros contact et RGPD au format historique, dans la colonne varchar(20)", () => {
    const random = vi.spyOn(Math, "random");
    for (const prefix of ["C", "G"] as const) {
      const ids = Array.from({ length: SAMPLE_SIZE }, () => createPublicTrackingId(prefix));
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
    const ids = Array.from({ length: SAMPLE_SIZE }, () => medicalQuestionTrackingId());
    expect(random).not.toHaveBeenCalled();
    for (const id of ids) {
      expect(id).toMatch(/^QMED-[0-9A-Z]{8}-[0-9A-Z]{5}$/);
      expect(id.length).toBeLessThanOrEqual(32);
    }
    expect(new Set(ids).size).toBe(SAMPLE_SIZE);
  });
});

describe("libellé Stripe Checkout en français", () => {
  it("décrit la consultation et le numéro de rendez-vous en français", () => {
    expect(CONSULTATION_CHECKOUT_PRODUCT_NAME).toBe("Consultation de conseil santé – 30 minutes");
    expect(consultationCheckoutProductData("APT0123456789AB")).toEqual({
      name: "Consultation de conseil santé – 30 minutes",
      description: "Rendez-vous : APT0123456789AB",
    });
  });
});
