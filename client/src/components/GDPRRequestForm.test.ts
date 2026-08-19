import { describe, expect, it } from "vitest";
import { gdprFieldIds, gdprRequestCopy } from "./GDPRRequestForm";

describe("GDPR request translations", () => {
  it("provides safe submission states in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = gdprRequestCopy[language];
      expect(copy.submitted.length, language).toBeGreaterThan(0);
      expect(copy.error.length, language).toBeGreaterThan(0);
      expect(copy.received.length, language).toBeGreaterThan(0);
      expect(copy.sending.length, language).toBeGreaterThan(0);
    }
  });

  it("uses stable unique identifiers for every labeled field", () => {
    const ids = Object.values(gdprFieldIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("gdpr-request-"))).toBe(true);
  });
});
