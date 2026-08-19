import { describe, expect, it } from "vitest";
import { readHighReadabilityPreference } from "./readabilityPreference";

describe("préférence de lisibilité renforcée", () => {
  it("n’active le mode que pour la valeur explicite true", () => {
    expect(readHighReadabilityPreference("true")).toBe(true);
    expect(readHighReadabilityPreference("false")).toBe(false);
    expect(readHighReadabilityPreference(null)).toBe(false);
  });
});
