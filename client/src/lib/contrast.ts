export type Oklch = {
  lightness: number;
  chroma: number;
  hue: number;
};

function cube(value: number) {
  return value * value * value;
}

export function oklchToRelativeLuminance({ lightness, chroma, hue }: Oklch) {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = cube(lightness + 0.3963377774 * a + 0.2158037573 * b);
  const m = cube(lightness - 0.1055613458 * a - 0.0638541728 * b);
  const s = cube(lightness - 0.0894841775 * a - 1.291485548 * b);
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return Math.max(0, Math.min(1, 0.2126 * red + 0.7152 * green + 0.0722 * blue));
}

export function contrastRatio(foreground: Oklch, background: Oklch) {
  const foregroundLuminance = oklchToRelativeLuminance(foreground);
  const backgroundLuminance = oklchToRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}
