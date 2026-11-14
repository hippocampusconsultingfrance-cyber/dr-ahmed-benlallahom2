/**
 * The site's own memory on the device (language, theme, readability, OLED dark, cookie choice), read and
 * written without ever throwing. A browser that blocks the site's data throws a SecurityError at the
 * mere reading of window.localStorage, which LanguageProvider and ThemeProvider did before any error
 * boundary, so that every page stayed blank (the recruitment form among them, REC-22); a full storage
 * throws on setItem. The page then keeps its defaults, and a choice made lasts for the visit only.
 */
function siteStorage(): Storage | null {
  try {
    // The page's localStorage (globalThis is the window in a browser), absent outside one.
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The stored value, or null when there is none or the storage cannot be read. */
export function readStoredPreference(key: string): string | null {
  try {
    return siteStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Stores the value where the browser allows it; otherwise it is kept only by the page's state. */
export function writeStoredPreference(key: string, value: string): void {
  try {
    siteStorage()?.setItem(key, value);
  } catch {
    // Blocked or full storage: the choice lasts for this visit only.
  }
}

export function removeStoredPreference(key: string): void {
  try {
    siteStorage()?.removeItem(key);
  } catch {
    // Blocked storage: nothing was stored to remove.
  }
}
