import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastOnTint, contrastRatio, contrastTokens, oklchToLinearRgb, type Oklch } from "./contrast";

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

/** Tailwind 4 shades (node_modules/tailwindcss/theme.css) of the candidate space. */
const TAILWIND: Record<string, Oklch> = {
  white: [1, 0, 0],
  "slate-100": [0.968, 0.007, 247.896], "slate-200": [0.929, 0.013, 255.508], "slate-300": [0.869, 0.022, 252.894], "slate-400": [0.704, 0.04, 256.788],
  "slate-900": [0.208, 0.042, 265.755], "slate-950": [0.129, 0.042, 264.695],
  "cyan-100": [0.956, 0.045, 203.388], "cyan-200": [0.917, 0.08, 205.041], "cyan-300": [0.865, 0.127, 207.078], "cyan-400": [0.789, 0.154, 211.53], "cyan-500": [0.715, 0.143, 215.221], "cyan-950": [0.302, 0.056, 229.695],
  "amber-50": [0.987, 0.022, 95.277], "amber-100": [0.962, 0.059, 95.617], "amber-200": [0.924, 0.12, 95.746], "amber-300": [0.879, 0.169, 91.605], "amber-400": [0.828, 0.189, 84.429], "amber-950": [0.279, 0.077, 45.635],
  "emerald-400": [0.765, 0.177, 163.223],
};

const encode = (channel: number) => (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);
const decode = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
type Srgb = readonly [number, number, number];
const srgb = (color: Oklch): Srgb => oklchToLinearRgb(color).map(encode) as unknown as Srgb;
/** `top` at opacity `alpha` over `under`, as the browser blends them (in sRGB). */
const over = (top: Srgb, alpha: number, under: Srgb): Srgb => top.map((channel, index) => channel * alpha + under[index]! * (1 - alpha)) as unknown as Srgb;
const luminance = ([red, green, blue]: Srgb) => 0.2126 * decode(red) + 0.7152 * decode(green) + 0.0722 * decode(blue);
const ratio = (a: Srgb, b: Srgb) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
};

/** The candidate space's own background, #030a12, and the panels laid over it. */
const PAGE: Srgb = [0x03 / 255, 0x0a / 255, 0x12 / 255];
const CANDIDATE_SURFACES: Record<string, Srgb> = {
  "bg-[#030a12]": PAGE,
  "bg-slate-950/60": over(srgb(TAILWIND["slate-950"]!), 0.6, PAGE),
  "bg-slate-950/80": over(srgb(TAILWIND["slate-950"]!), 0.8, PAGE),
  "bg-slate-900/75": over(srgb(TAILWIND["slate-900"]!), 0.75, PAGE),
  "bg-cyan-950/30": over(srgb(TAILWIND["cyan-950"]!), 0.3, PAGE),
  "bg-cyan-400/10": over(srgb(TAILWIND["cyan-400"]!), 0.1, PAGE),
  "bg-amber-950/20": over(srgb(TAILWIND["amber-950"]!), 0.2, PAGE),
};

describe("contraste des textes de l'espace candidat sur ses fonds codés en dur (A11Y-22)", () => {
  it("rend chaque couleur de texte des pages candidat lisible sur chacun de leurs fonds sombres", () => {
    // The text colours of CandidateAccessPage, CandidateVerifyPage, CandidatePortalPage and
    // CandidateResetPasswordPage, with their opacity when they have one.
    const texts: Array<[string, number]> = [
      ["white", 1], ["slate-100", 1], ["slate-200", 1], ["slate-300", 1], ["slate-400", 1],
      ["cyan-100", 1], ["cyan-200", 1], ["cyan-300", 1], ["emerald-400", 1],
      ["amber-50", 1], ["amber-100", 0.75], ["amber-200", 0.9], ["amber-300", 1], ["amber-400", 1],
    ];
    const below: string[] = [];
    for (const [text, alpha] of texts) {
      for (const [surfaceName, surface] of Object.entries(CANDIDATE_SURFACES)) {
        const contrast = ratio(over(srgb(TAILWIND[text]!), alpha, surface), surface);
        if (contrast < 4.5) below.push(`text-${text}${alpha < 1 ? `/${alpha * 100}` : ""} on ${surfaceName}: ${contrast.toFixed(2)}`);
      }
    }
    expect(below).toEqual([]);
  });

  it("rend lisible le texte slate-950 des boutons cyan de l'espace candidat", () => {
    for (const button of ["cyan-400", "cyan-500"]) {
      expect(ratio(srgb(TAILWIND["slate-950"]!), srgb(TAILWIND[button]!)), button).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("mesure comme insuffisant un gris trop sombre sur le fond candidat", () => {
    expect(ratio(srgb([0.554, 0.046, 257.417]), PAGE)).toBeLessThan(4.5);
  });
});
