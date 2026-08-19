import { describe, expect, it } from "vitest";
import { shouldReduceMotionForConnection } from "./connectionMotion";

describe("mouvement selon la connexion", () => {
  it("réduit les animations uniquement quand l’économie de données est activée", () => {
    expect(shouldReduceMotionForConnection({ saveData: true })).toBe(true);
    expect(shouldReduceMotionForConnection({ saveData: false })).toBe(false);
    expect(shouldReduceMotionForConnection(undefined)).toBe(false);
  });
});
