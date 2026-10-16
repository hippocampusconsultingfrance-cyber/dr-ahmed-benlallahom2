import { describe, expect, it, vi } from "vitest";
import { CHUNK_RELOAD_GUARD_KEY, CHUNK_RELOAD_GUARD_MS, failedChunkUrl, installChunkLoadRecovery } from "./chunkLoadRecovery";

const ORIGIN = "https://www.drahmedbenlallahom.com";

function fakeWindow(storage: "ok" | "blocked" = "ok") {
  const listeners = new Map<string, (event: Event) => void>();
  const store = new Map<string, string>();
  const target = {
    addEventListener: vi.fn((type: string, listener: (event: Event) => void) => { listeners.set(type, listener); }),
    sessionStorage: {
      getItem: (key: string) => { if (storage === "blocked") throw new Error("SecurityError"); return store.get(key) ?? null; },
      setItem: (key: string, value: string) => { if (storage === "blocked") throw new Error("SecurityError"); store.set(key, value); },
    },
    location: { origin: ORIGIN, reload: vi.fn() },
    fetch: vi.fn(async () => new Response("")),
  };
  const fire = async (payload: unknown) => {
    const event = Object.assign(new Event("vite:preloadError", { cancelable: true }), { payload });
    listeners.get("vite:preloadError")!(event);
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  return { target, fire, store };
}

describe("reprise après un fragment JavaScript introuvable (redéploiement, retour arrière)", () => {
  it("retrouve l’URL du fragment dans les messages de Chrome et Firefox, jamais une autre origine", () => {
    expect(failedChunkUrl(new TypeError(`Failed to fetch dynamically imported module: ${ORIGIN}/static/BookingPage-OLDHASH0.js`), ORIGIN)).toBe(`${ORIGIN}/static/BookingPage-OLDHASH0.js`);
    expect(failedChunkUrl(new TypeError(`error loading dynamically imported module: ${ORIGIN}/static/Home-abc.js`), ORIGIN)).toBe(`${ORIGIN}/static/Home-abc.js`);
    expect(failedChunkUrl(new TypeError("Importing a module script failed."), ORIGIN)).toBeNull();
    expect(failedChunkUrl(new TypeError("Failed to fetch dynamically imported module: https://evil.example/static/x.js"), ORIGIN)).toBeNull();
  });

  it("recharge le fragment en contournant le cache puis recharge la page, une fois par minute au plus", async () => {
    let now = 1_000_000;
    const { target, fire, store } = fakeWindow();
    installChunkLoadRecovery(target as never, () => now);
    await fire(new TypeError(`Failed to fetch dynamically imported module: ${ORIGIN}/static/BookingPage-OLDHASH0.js`));
    expect(target.fetch).toHaveBeenCalledWith(`${ORIGIN}/static/BookingPage-OLDHASH0.js`, { cache: "reload", credentials: "same-origin" });
    expect(target.location.reload).toHaveBeenCalledTimes(1);
    expect(store.get(CHUNK_RELOAD_GUARD_KEY)).toBe(String(now));

    // Still failing right after the reload: no loop, the error page takes over.
    await fire(new TypeError("Importing a module script failed."));
    expect(target.location.reload).toHaveBeenCalledTimes(1);

    now += CHUNK_RELOAD_GUARD_MS;
    await fire(new TypeError("Importing a module script failed."));
    expect(target.location.reload).toHaveBeenCalledTimes(2);
  });

  it("ne recharge jamais automatiquement sans stockage de session (pas de boucle possible)", async () => {
    const { target, fire } = fakeWindow("blocked");
    installChunkLoadRecovery(target as never);
    await fire(new TypeError(`Failed to fetch dynamically imported module: ${ORIGIN}/static/Home-abc.js`));
    expect(target.fetch).toHaveBeenCalledTimes(1);
    expect(target.location.reload).not.toHaveBeenCalled();
  });
});
