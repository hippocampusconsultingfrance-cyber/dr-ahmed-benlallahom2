import { describe, expect, it } from "vitest";
import { whatsappCopy } from "./WhatsAppButton";

describe("WhatsAppButton translations", () => {
  it("provides a prefilled message and accessible label in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(whatsappCopy[language].message.length, language).toBeGreaterThan(0);
      expect(whatsappCopy[language].label.length, language).toBeGreaterThan(0);
      expect(whatsappCopy[language].title.length, language).toBeGreaterThan(0);
    }
  });
});
