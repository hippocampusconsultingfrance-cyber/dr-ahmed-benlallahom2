import { describe, expect, it } from "vitest";
import { getLocalizedCopy } from "./getLocalizedCopy";

describe("getLocalizedCopy", () => {
  const catalog = { fr: "Bonjour", en: "Hello" };

  it("retourne la langue demandée lorsqu’elle existe", () => {
    expect(getLocalizedCopy(catalog, "fr", "en")).toBe("Bonjour");
  });

  it("utilise le repli explicitement choisi lorsque la langue est inconnue", () => {
    expect(getLocalizedCopy(catalog, "zh", "en")).toBe("Hello");
  });

  it("signale un catalogue incomplet sans repli", () => {
    expect(() => getLocalizedCopy(catalog, "fr", "de")).toThrow("Missing localized fallback: de");
  });
});
