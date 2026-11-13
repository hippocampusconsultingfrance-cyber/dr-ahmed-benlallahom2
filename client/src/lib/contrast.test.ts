import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastOnTint, contrastRatio, contrastTokens, type Oklch } from "./contrast";

describe("contraste des jetons publics", () => {
  it("maintient cyan, gris et doré lisibles dans les thèmes clair et sombre", async () => {
    for (const theme of Object.values(contrastTokens)) {
      expect(contrastRatio(theme.foreground, theme.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.mutedForeground, theme.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.primary, theme.background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme.primaryForeground, theme.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.accentForeground, theme.accent)).toBeGreaterThanOrEqual(4.5);
    }
    const css = await readFile(path.join(process.cwd(), "client/src/index.css"), "utf8");
    for (const token of ["--primary: oklch(0.75 0.15 220)", "--muted-foreground: oklch(0.65 0.02 250)", "--accent: oklch(0.72 0.1 75)", "--primary-foreground: oklch(0.04 0.01 250)", "--primary-foreground: oklch(0.12 0.02 250)", "--primary: oklch(0.55 0.2 220)"]) expect(css).toContain(token);
  });

  it("garde le rouge d'erreur (--destructive) lisible en texte sur le fond, les cartes et sa propre teinte, et sous le texte blanc d'un bouton (A11Y-22)", async () => {
    const white: Oklch = [1, 0, 0];
    for (const [name, theme] of Object.entries(contrastTokens)) {
      // Error messages (text-destructive), on the page, a card, or their 5 to 10 % tinted box.
      for (const surface of [theme.background, theme.card]) {
        expect(contrastRatio(theme.destructive, surface), name).toBeGreaterThanOrEqual(4.5);
        expect(contrastOnTint(theme.destructive, theme.destructive, 0.1, surface), name).toBeGreaterThanOrEqual(4.5);
      }
    }
    // The destructive button: white text on bg-destructive, at 60 % over the dark background.
    expect(contrastRatio(white, contrastTokens.light.destructive)).toBeGreaterThanOrEqual(4.5);
    expect(contrastOnTint(white, contrastTokens.dark.destructive, 0.6, contrastTokens.dark.background)).toBeGreaterThanOrEqual(4.5);
    // The red measured above is the one the site paints, in each theme.
    const css = await readFile(path.join(process.cwd(), "client/src/index.css"), "utf8");
    for (const token of ["--destructive: oklch(0.66 0.2 25)", "--destructive: oklch(0.52 0.22 27)"]) expect(css).toContain(token);
  });
});
