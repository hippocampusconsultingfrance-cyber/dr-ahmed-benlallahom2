import { describe, expect, it } from "vitest";
import { contrastRatio, type Oklch } from "./contrast";

const darkTheme = {
  background: { lightness: 0.12, chroma: 0.02, hue: 250 },
  foreground: { lightness: 0.95, chroma: 0.005, hue: 250 },
  mutedForeground: { lightness: 0.65, chroma: 0.02, hue: 250 },
  primary: { lightness: 0.75, chroma: 0.15, hue: 220 },
  primaryForeground: { lightness: 0.12, chroma: 0.02, hue: 250 },
  accent: { lightness: 0.72, chroma: 0.1, hue: 75 },
  accentForeground: { lightness: 0.12, chroma: 0.02, hue: 250 },
} satisfies Record<string, Oklch>;

const lightTheme = {
  background: { lightness: 0.98, chroma: 0.005, hue: 250 },
  foreground: { lightness: 0.15, chroma: 0.02, hue: 250 },
  mutedForeground: { lightness: 0.45, chroma: 0.02, hue: 250 },
  primary: { lightness: 0.53, chroma: 0.2, hue: 220 },
  primaryForeground: { lightness: 0.98, chroma: 0.005, hue: 250 },
  accent: { lightness: 0.65, chroma: 0.12, hue: 75 },
  accentForeground: { lightness: 0.15, chroma: 0.02, hue: 250 },
} satisfies Record<string, Oklch>;

function expectTextContrast(theme: typeof darkTheme) {
  expect(contrastRatio(theme.foreground, theme.background)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(theme.mutedForeground, theme.background)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(theme.primaryForeground, theme.primary)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(theme.accentForeground, theme.accent)).toBeGreaterThanOrEqual(4.5);
}

describe("contraste des thèmes", () => {
  it("maintient les paires textuelles principales au seuil AA dans le thème sombre", () => {
    expectTextContrast(darkTheme);
  });

  it("maintient les paires textuelles principales au seuil AA dans le thème clair", () => {
    expectTextContrast(lightTheme);
  });
});
