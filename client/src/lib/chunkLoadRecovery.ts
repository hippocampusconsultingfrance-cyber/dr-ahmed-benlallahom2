/**
 * Recovery when a lazily loaded page cannot be loaded ("vite:preloadError").
 *
 * Hashed files under /static/ are cached for a year as immutable. When the
 * site is redeployed while a tab is open, that tab asks for chunk names that
 * no longer exist; whatever comes back (a 404, or the HTML fallback) is then
 * cached under the chunk's URL for a year. Even if that deployment comes back
 * (Instant Rollback), the browser would keep the cached failure.
 *
 * So, once per minute at most: the failed chunk is fetched again bypassing
 * the HTTP cache (`cache: "reload"` replaces the cached entry), then the page
 * is reloaded, which loads the current index.html and its current chunks.
 * Without session storage (private mode, blocked storage) the page is not
 * reloaded automatically, so a broken deployment can never cause a reload
 * loop: the error page with its "Réessayer" button is shown instead.
 */
export const CHUNK_RELOAD_GUARD_KEY = "abl:chunk-reload-at";
export const CHUNK_RELOAD_GUARD_MS = 60_000;

/** Same-origin /static/ URL named in a module loading error (Chrome, Edge, Firefox name it; Safari does not). */
export function failedChunkUrl(error: unknown, origin: string): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  for (const candidate of message.match(/https?:\/\/[^\s"'<>]+/g) ?? []) {
    try {
      const url = new URL(candidate);
      if (url.origin === origin && url.pathname.startsWith("/static/")) return url.href;
    } catch {
      // Not a URL: keep looking.
    }
  }
  return null;
}

type RecoveryWindow = Pick<Window, "addEventListener" | "sessionStorage"> & {
  location: Pick<Location, "origin" | "reload">;
  fetch: typeof fetch;
};

export function installChunkLoadRecovery(target: RecoveryWindow = window, now: () => number = Date.now) {
  target.addEventListener("vite:preloadError", event => {
    let canReload = false;
    try {
      const last = Number(target.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) ?? 0);
      if (now() - last >= CHUNK_RELOAD_GUARD_MS) {
        target.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(now()));
        canReload = true;
      }
    } catch {
      canReload = false;
    }
    const url = failedChunkUrl((event as Event & { payload?: unknown }).payload, target.location.origin);
    const refreshed = url
      ? target.fetch(url, { cache: "reload", credentials: "same-origin" }).then(() => undefined, () => undefined)
      : Promise.resolve();
    if (canReload) void refreshed.then(() => target.location.reload());
  });
}
