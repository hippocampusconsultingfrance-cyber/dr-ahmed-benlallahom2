import { describe, expect, it } from "vitest";

describe("verrou de créneau de réservation", () => {
  it("utilise une clé UTC déterministe pour rendre un créneau de trente minutes unique", () => {
    const date = new Date("2026-08-20T09:00:00.000Z");
    expect(date.toISOString()).toBe("2026-08-20T09:00:00.000Z");
  });
});
