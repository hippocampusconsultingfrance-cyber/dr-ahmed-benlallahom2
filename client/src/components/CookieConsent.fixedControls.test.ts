import { describe, expect, it, vi } from "vitest";
import { COOKIE_BANNER_OPEN_ATTRIBUTE, syncCookieBannerOpenAttribute } from "./CookieConsent";

describe("coordination des contrôles fixes", () => {
  it("marque le document lorsque le bandeau cookies est ouvert", () => {
    const root = { setAttribute: vi.fn(), removeAttribute: vi.fn() };

    syncCookieBannerOpenAttribute(root, true);

    expect(root.setAttribute).toHaveBeenCalledWith(COOKIE_BANNER_OPEN_ATTRIBUTE, "true");
    expect(root.removeAttribute).not.toHaveBeenCalled();
  });

  it("retire le marqueur lorsque le bandeau cookies se ferme", () => {
    const root = { setAttribute: vi.fn(), removeAttribute: vi.fn() };

    syncCookieBannerOpenAttribute(root, false);

    expect(root.removeAttribute).toHaveBeenCalledWith(COOKIE_BANNER_OPEN_ATTRIBUTE);
    expect(root.setAttribute).not.toHaveBeenCalled();
  });

  it("prévoit la fermeture par Échap et la restitution du focus des préférences", async () => {
    const source = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("./CookieConsent.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain('if (event.key !== "Escape") return;');
    expect(source).toContain("preferencesTriggerRef.current?.focus()");
    expect(source).toContain("const closePreferences = () => {");
    expect(source).toContain("onClick={closePreferences}");
  });
});
