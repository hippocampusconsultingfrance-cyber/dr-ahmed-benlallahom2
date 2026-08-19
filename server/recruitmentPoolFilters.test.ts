import { describe, expect, it } from "vitest";
import { recruitmentPoolFiltersInput } from "./routers";

describe("contrat de filtres du vivier", () => {
  it("accepte les critères professionnels supplémentaires et applique la limite par défaut", () => {
    expect(recruitmentPoolFiltersInput.parse({
      availability: "immédiate",
      mobility: "Moyen-Orient",
      certification: "ACLS",
    })).toEqual({
      availability: "immédiate",
      mobility: "Moyen-Orient",
      certification: "ACLS",
      limit: 200,
    });
  });

  it("borne les critères et le score pour éviter des requêtes invalides", () => {
    expect(() => recruitmentPoolFiltersInput.parse({ minimumScore: 101 })).toThrow();
    expect(() => recruitmentPoolFiltersInput.parse({ mobility: "x".repeat(151) })).toThrow();
    expect(() => recruitmentPoolFiltersInput.parse({ certification: "x".repeat(181) })).toThrow();
  });
});
