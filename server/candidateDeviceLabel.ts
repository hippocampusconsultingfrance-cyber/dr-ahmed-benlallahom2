/**
 * Readable name of the device of a candidate session, read from its
 * User-Agent, e.g. "Chrome (Windows)" or "Safari (iPhone)", in place of the
 * raw header (REC-18). Written without words so that every language of the
 * portal can show it; null when neither the browser nor the system is
 * recognised, which the portal shows as its translated "Browser". Sessions
 * stored before keep their raw User-Agent, read the same way when listed.
 */

// First match wins: Edge, Opera and Samsung Internet also announce Chrome, and Chrome announces Safari.
const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|OPiOS|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\b(?:Chrome|CriOS|Chromium|HeadlessChrome)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

// iPhone and iPad before macOS (their User-Agent says "like Mac OS X"), Android before Linux.
const SYSTEMS: Array<[RegExp, string]> = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

export function candidateDeviceLabel(userAgent: unknown): string | null {
  if (typeof userAgent !== "string") return null;
  // A real User-Agent names its browser and system well before 512 characters.
  const header = userAgent.slice(0, 512);
  const browser = BROWSERS.find(([pattern]) => pattern.test(header))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(header))?.[1];
  if (browser && system) return `${browser} (${system})`;
  return browser ?? system ?? null;
}

// Every label candidateDeviceLabel can give.
const LABELS = new Set([
  ...BROWSERS.map(([, browser]) => browser),
  ...SYSTEMS.map(([, system]) => system),
  ...BROWSERS.flatMap(([, browser]) => SYSTEMS.map(([, system]) => `${browser} (${system})`)),
]);

/**
 * Label of a stored session as the portal lists it. A session stored before
 * REC-18 holds the raw User-Agent (cut at 180 characters) or the French
 * "Navigateur inconnu": it is named as a new one would be, without changing
 * what is stored.
 */
export function readableCandidateDeviceLabel(stored: string | null): string | null {
  if (stored === null || LABELS.has(stored)) return stored;
  return candidateDeviceLabel(stored);
}
