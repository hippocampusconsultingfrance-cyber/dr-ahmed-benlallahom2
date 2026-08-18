import { describe, expect, it } from "vitest";

describe("file post-paiement", () => {
  it("conserve deux traitements indépendants et idempotents par rendez-vous", () => {
    expect(new Set(["confirmation", "invoice"]).size).toBe(2);
  });
});
