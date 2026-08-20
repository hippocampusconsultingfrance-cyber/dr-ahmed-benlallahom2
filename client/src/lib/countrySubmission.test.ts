import { describe, expect, it } from "vitest";
import { resolveCountryForSubmission } from "./countrySubmission";

describe("resolveCountryForSubmission", () => {
  it("conserve le pays contrôlé par React lorsqu’il est présent", () => {
    expect(resolveCountryForSubmission("Tunisie", "France")).toBe("Tunisie");
  });

  it("récupère le pays visible prérempli par un navigateur mobile quand l’état est vide", () => {
    expect(resolveCountryForSubmission("", "Tunisie", ["France", "Tunisie"])).toBe("Tunisie");
  });

  it("ne valide pas une valeur de pays absente ou non textuelle", () => {
    expect(resolveCountryForSubmission("", null)).toBe("");
    expect(resolveCountryForSubmission("", new File(["x"], "cv.pdf"))).toBe("");
    expect(resolveCountryForSubmission("", "Tunis", ["Tunisie"])).toBe("");
  });
});
