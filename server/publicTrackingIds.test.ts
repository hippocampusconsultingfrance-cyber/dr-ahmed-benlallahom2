import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { CONSULTATION_CHECKOUT_PRODUCT_NAME, consultationCheckoutProductData, createPublicTrackingId } from "./routers";
import { medicalQuestionTrackingId } from "./medicalQuestionsRouter";

const SAMPLE_SIZE = 2000;

describe("numéros de suivi publics imprévisibles", () => {
  it("génère des numéros contact et RGPD au format historique, dans la colonne varchar(20)", () => {
    for (const prefix of ["C", "G"] as const) {
      const ids = Array.from({ length: SAMPLE_SIZE }, () => createPublicTrackingId(prefix));
      for (const id of ids) {
        expect(id).toMatch(new RegExp(`^${prefix}[0-9A-Z]{12}$`));
        expect(id.length).toBeLessThanOrEqual(20);
      }
      expect(new Set(ids).size).toBe(SAMPLE_SIZE);
    }
  });

  it("génère des numéros de question santé QMED dans la colonne varchar(32)", () => {
    const ids = Array.from({ length: SAMPLE_SIZE }, () => medicalQuestionTrackingId());
    for (const id of ids) {
      expect(id).toMatch(/^QMED-[0-9A-Z]{8}-[0-9A-Z]{5}$/);
      expect(id.length).toBeLessThanOrEqual(32);
    }
    expect(new Set(ids).size).toBe(SAMPLE_SIZE);
  });

  it("n’utilise plus Math.random() ni l’horodatage pour ces identifiants", async () => {
    const [routers, medical] = await Promise.all([
      readFile(new URL("./routers.ts", import.meta.url), "utf8"),
      readFile(new URL("./medicalQuestionsRouter.ts", import.meta.url), "utf8"),
    ]);
    for (const source of [routers, medical]) {
      expect(source).not.toContain("Math.random()");
      expect(source).toContain('from "node:crypto"');
      expect(source).toContain("randomInt(");
    }
    expect(routers).toContain('const trackingId = createPublicTrackingId("C");');
    expect(routers).toContain('const trackingId = createPublicTrackingId("G");');
    expect(medical).not.toContain("Date.now().toString(36)");
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

  it("utilise le même libellé à la création du rendez-vous et à la reprise du paiement", async () => {
    const source = await readFile(new URL("./routers.ts", import.meta.url), "utf8");
    expect(source).not.toContain("Health Consultation");
    expect(source).not.toContain("Appointment: ${");
    const createBlock = source.slice(source.indexOf("    create: publicProcedure"), source.indexOf("createCheckoutSession: publicProcedure"));
    const checkoutBlock = source.slice(source.indexOf("createCheckoutSession: publicProcedure"), source.indexOf("cancelPending: publicProcedure"));
    expect(createBlock).toContain("product_data: consultationCheckoutProductData(trackingId)");
    expect(checkoutBlock).toContain("product_data: consultationCheckoutProductData(input.trackingId)");
  });
});
