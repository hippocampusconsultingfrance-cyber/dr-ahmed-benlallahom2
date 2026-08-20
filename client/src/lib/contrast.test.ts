import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, contrastTokens } from "./contrast";

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
});
