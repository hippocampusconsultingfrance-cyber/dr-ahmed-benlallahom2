import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, type Oklch } from "./lib/contrast";
import { getMainContentTarget } from "./components/SkipToContent";

const read = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8");
const css = read("index.css");

const oklch = (token: string): Oklch => {
  const match = css.match(new RegExp(`${token}: oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`));
  if (!match) throw new Error(`jeton introuvable : ${token}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

// /testimonials et le pied de page sont montés dans un DOM : pages/TestimonialsPage.dom.test.ts, components/Footer.dom.test.ts.
describe("repères et structure (PUB-A11Y-01 / PUB-A11Y-02)", () => {
  it("/booking expose un repère principal atteignable par le lien d'évitement", () => {
    // The booking page renders this landmark: BookingPage.render.test.ts.
    const target = { id: "", tabIndex: 0, focus: () => undefined };
    const root = { querySelector: (selector: string) => (selector.includes('[role="main"]') ? target : null) };
    expect(getMainContentTarget(root)).toBe(target);
    expect(target.id).toBe("main-content");
    expect(target.tabIndex).toBe(-1);
  });
});

describe("contraste du thème clair (PUB-A11Y-03 / PUB-UI-02 / PUB-UI-03)", () => {
  it("le texte « text-primary » atteint 4,5:1 sur les fonds clairs relevés par l'audit", () => {
    const strong = oklch("--primary-strong");
    const backgrounds: Oklch[] = [
      [0.98, 0.005, 250], // --background clair (#f6f9fc)
      [1, 0, 0], // --card clair
      [0.9284, 0.0331, 221.5], // #d3edf6 (bg-primary/10 sur fond clair)
      [0.9509, 0.0217, 227.4], // #e2f1f8
    ];
    for (const background of backgrounds) expect(contrastRatio(strong, background)).toBeGreaterThanOrEqual(4.5);
    // Les fonds bg-primary et leur texte foncé restent inchangés.
    expect(css).toContain("--primary: oklch(0.55 0.2 220)");
    expect(css).toMatch(/@layer utilities \{\s*\/\*[^*]*\*\/\s*:where\(:root:not\(\.dark\)\) \.text-primary:not\(:where\(\.theme-dark-island \*\)\) \{\s*color: var\(--primary-strong\);/);
    expect(css).toContain(":root:not(.dark) .eyebrow-label:not(:where(.theme-dark-island *)) {");
  });

  it("/why-hippocampus garde un en-tête et un pied de page sombres lisibles en thème clair", () => {
    expect(read("pages/WhyHippocampusPage.tsx")).toContain('className="theme-dark-island dark min-h-screen');
    expect(css).toContain(":root:not(.dark) .theme-dark-island {");
    expect(contrastRatio([0.65, 0.02, 250], [0.12, 0.02, 250])).toBeGreaterThanOrEqual(4.5);
  });

  it("le globe des héros recrutement est atténué en thème clair", () => {
    expect(read("pages/RecruitmentHubPage.tsx")).toContain('className="hero-globe pointer-events-none');
    expect(read("pages/RecruitmentPage.tsx")).toContain('className="hero-globe pointer-events-none');
    expect(css).toMatch(/:root:not\(\.dark\) \.hero-globe \{\s*opacity: 0\.12;/);
  });
});
