import { describe, expect, it } from "vitest";
import { deliveryRateLabel } from "./campaignDeliveryMetrics";

describe("métriques de délivrabilité des campagnes", () => {
  it("calcule le taux d’ouverture par rapport aux emails distribués", () => {
    expect(deliveryRateLabel(4, 10)).toBe("40 %");
  });

  it("ne présente pas de pourcentage lorsque Resend n’a confirmé aucune distribution", () => {
    expect(deliveryRateLabel(0, 0)).toBe("—");
  });
});
