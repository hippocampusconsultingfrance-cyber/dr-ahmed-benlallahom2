// @vitest-environment happy-dom
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mesure d'audience montée par React, l'adresse suivie par wouter comme dans le navigateur :
// chargée après accord sur le site public, jamais sur /admin ni /candidate (ADM-16).
const { default: AnalyticsConsent, ANALYTICS_SCRIPT_ID } = await import(
  "./AnalyticsConsent"
);
const { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent } = await import(
  "./cookieConsentState"
);
const { COOKIE_CONSENT_CHANGE_EVENT } = await import("./analyticsConsentLogic");

const script = () =>
  document.getElementById(ANALYTICS_SCRIPT_ID) as HTMLScriptElement | null;
const open = (path: string) => {
  window.history.replaceState(null, "", path);
  return render(createElement(AnalyticsConsent));
};

let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // The DOM loads no script (vitest.config.ts): the measurement script is only inserted, then taken as loaded.
  (
    window as unknown as {
      happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: boolean } };
    }
  ).happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  vi.stubEnv("VITE_ANALYTICS_ENDPOINT", "https://stats.example.test/");
  vi.stubEnv("VITE_ANALYTICS_WEBSITE_ID", "site-test");
  reload = vi.fn();
  vi.spyOn(window.location, "reload").mockImplementation(reload);
  localStorage.setItem(
    COOKIE_CONSENT_STORAGE_KEY,
    JSON.stringify(createCookieConsent(true))
  );
});
afterEach(() => {
  cleanup();
  script()?.remove();
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("mesure d'audience selon la route (ADM-16)", () => {
  it("se charge après accord sur une page publique", () => {
    open("/faq");
    expect(script()?.getAttribute("src")).toBe(
      "https://stats.example.test/umami"
    );
    expect(script()?.dataset.websiteId).toBe("site-test");
  });

  // wouter affiche aussi l'admin et l'espace candidat sous /ADMIN ou /Candidate/access.
  it.each([
    "/admin",
    "/admin/",
    "/candidate/access",
    "/candidate/portal",
    "/ADMIN",
    "/Admin",
    "/Candidate/access",
  ])("ne se charge jamais sur %s, même après accord", path => {
    open(path);
    expect(script()).toBeNull();
    // Un accord donné ou relu pendant la visite n'y change rien.
    act(() => {
      window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGE_EVENT));
      window.dispatchEvent(new Event("storage"));
    });
    expect(script()).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("repart sans le script quand la navigation entre dans l'espace candidat, puis le recharge au retour", () => {
    open("/recruitment");
    expect(script()).not.toBeNull();

    act(() => window.history.pushState(null, "", "/candidate/access"));
    expect(script()).toBeNull();
    // Le script déjà exécuté suivrait la navigation : la page est rechargée sans lui.
    expect(reload).toHaveBeenCalledTimes(1);

    act(() => window.history.pushState(null, "", "/"));
    expect(script()).not.toBeNull();
  });
});
