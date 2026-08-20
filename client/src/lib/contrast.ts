export type Oklch = readonly [lightness: number, chroma: number, hue: number];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Conversion OKLCH vers RGB linéaire, suffisante pour auditer les jetons CSS du projet. */
export function oklchToLinearRgb([lightness, chroma, hue]: Oklch): readonly [number, number, number] {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function relativeLuminance(color: Oklch): number {
  const [red, green, blue] = oklchToLinearRgb(color);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground: Oklch, background: Oklch): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export const contrastTokens = {
  dark: {
    background: [0.12, 0.02, 250],
    foreground: [0.95, 0.005, 250],
    mutedForeground: [0.65, 0.02, 250],
    primary: [0.75, 0.15, 220],
    primaryForeground: [0.04, 0.01, 250],
    accent: [0.72, 0.1, 75],
    accentForeground: [0.12, 0.02, 250],
  },
  light: {
    background: [0.98, 0.005, 250],
    foreground: [0.15, 0.02, 250],
    mutedForeground: [0.45, 0.02, 250],
    primary: [0.55, 0.2, 220],
    primaryForeground: [0.12, 0.02, 250],
    accent: [0.65, 0.12, 75],
    accentForeground: [0.15, 0.02, 250],
  },
} as const satisfies Record<string, Record<string, Oklch>>;
