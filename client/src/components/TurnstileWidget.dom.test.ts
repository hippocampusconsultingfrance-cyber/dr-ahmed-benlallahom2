// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A11Y-09 — quand le défi anti-robot ne passe pas, le visiteur garde une autre
// voie (l’email et le téléphone du site, en liens), dans la langue de la page ;
// la zone du défi est un groupe nommé, et non une div portant un aria-label.

const { TurnstileLoadError, TurnstileWidget } = await import("./TurnstileWidget");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { getTurnstileWidgetCopy } = await import("@/lib/publicFormCopy");
const { siteConfig } = await import("@/data/site-config");

const languages = ["fr", "en", "de", "zh"] as const;
const PHONE_HREF = `tel:${siteConfig.phone.replace(/\s/g, "")}`;

function mountWidget(language: (typeof languages)[number]) {
  localStorage.setItem("language", language);
  return render(createElement(LanguageProvider, null, createElement(TurnstileWidget, { onToken: () => undefined })));
}

/** The two links of the fallback inside `container`, with what they open. */
function fallbackLinks(container: HTMLElement) {
  const scope = within(container);
  return {
    email: scope.getByRole("link", { name: siteConfig.email }).getAttribute("href"),
    phone: scope.getByRole("link", { name: siteConfig.phone }).getAttribute("href"),
  };
}

beforeEach(() => {
  // Cloudflare's script is already on the page: no network, the challenge renders through this stand-in.
  const script = document.createElement("script");
  script.id = "cloudflare-turnstile-script";
  document.head.appendChild(script);
  window.turnstile = { render: () => "widget-1", remove: vi.fn(), reset: vi.fn() };
});
afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  localStorage.clear();
  delete window.turnstile;
  vi.unstubAllEnvs();
});

describe("anti-robot bloqué : une autre voie que le formulaire (A11Y-09)", () => {
  it.each(languages)("le défi ne se charge pas : propose d’écrire ou d’appeler, en liens, dans la langue de la page (%s)", language => {
    const copy = getTurnstileWidgetCopy(language);
    render(createElement(TurnstileLoadError, { copy, onRetry: () => undefined }));

    const alert = screen.getByRole("alert");
    expect(fallbackLinks(alert)).toEqual({ email: `mailto:${siteConfig.email}`, phone: PHONE_HREF });
    expect(alert.textContent).toContain(copy.loadError);
    expect(alert.textContent).toContain(copy.fallback.replace("{email}", siteConfig.email).replace("{phone}", siteConfig.phone));
    expect(within(alert).getByRole("button", { name: copy.retry })).toBeTruthy();
  });

  it.each(languages)("le défi n’est pas configuré : même voie de secours que le message d’indisponibilité (%s)", language => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    mountWidget(language);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(getTurnstileWidgetCopy(language).unavailable);
    expect(fallbackLinks(alert)).toEqual({ email: `mailto:${siteConfig.email}`, phone: PHONE_HREF });
  });

  it.each(languages)("nomme la zone du défi comme un groupe, sans message avant tout échec (%s)", language => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
    mountWidget(language);

    const group = screen.getByRole("group", { name: getTurnstileWidgetCopy(language).label });
    expect(group.tagName).toBe("DIV");
    expect(screen.queryByRole("alert")).toBeNull();
    // No other element carries the name without a role.
    expect(Array.from(document.querySelectorAll("[aria-label]")).every(element => element.getAttribute("role") === "group")).toBe(true);
  });
});
