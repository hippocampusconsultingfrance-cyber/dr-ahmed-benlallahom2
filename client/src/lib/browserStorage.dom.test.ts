// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Navigateur qui refuse tout stockage au site (données de site bloquées) : lire window.localStorage
// lève une SecurityError. La langue, le thème, la lisibilité et le choix cookies restent alors ceux
// par défaut, et la page s'affiche au lieu de rester blanche ; un stockage plein ne la casse pas non plus.

const { ThemeProvider, useTheme } = await import("@/contexts/ThemeContext");
const { LanguageProvider, useLanguage } = await import("@/contexts/LanguageContext");
const { default: CookieConsent, cookieCopy } = await import("@/components/CookieConsent");
const { default: AnalyticsConsent, ANALYTICS_SCRIPT_ID } = await import("@/components/AnalyticsConsent");
const { readStoredPreference, removeStoredPreference, writeStoredPreference } = await import("./browserStorage");

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage")!;

/** localStorage refused as Chromium refuses it when the site's data is blocked. */
function blockStorage() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("Failed to read the 'localStorage' property from 'Window': Access is denied for this document.", "SecurityError");
    },
  });
}

/** A storage that reads what it holds, but is full. */
function fillStorage(held: Record<string, string>) {
  const storage = {
    getItem: (key: string) => held[key] ?? null,
    setItem: () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    },
    removeItem: () => undefined,
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => storage });
}

function Preferences() {
  const { theme, toggleTheme, highReadability, toggleHighReadability } = useTheme();
  const { language, setLanguage, content } = useLanguage();
  return createElement("main", null,
    createElement("h1", null, content.nav.healthQuestions),
    createElement("p", { "data-testid": "state" }, `${language} ${theme} ${highReadability}`),
    createElement("button", { type: "button", onClick: toggleTheme }, "theme"),
    createElement("button", { type: "button", onClick: toggleHighReadability }, "readability"),
    createElement("button", { type: "button", onClick: () => setLanguage("en") }, "english"),
  );
}

const mount = () => render(createElement(ThemeProvider, { defaultTheme: "dark", switchable: true }, createElement(LanguageProvider, null, createElement(Preferences), createElement(CookieConsent), createElement(AnalyticsConsent))));

afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, "localStorage", original);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  localStorage.clear();
  document.getElementById(ANALYTICS_SCRIPT_ID)?.remove();
  document.documentElement.className = "";
  document.documentElement.lang = "";
});

describe("stockage refusé par le navigateur", () => {
  it("garde les valeurs par défaut et les choix de la visite, sans erreur", () => {
    blockStorage();
    expect(() => window.localStorage).toThrow();
    vi.stubEnv("VITE_ANALYTICS_ENDPOINT", "https://stats.example.test");
    vi.stubEnv("VITE_ANALYTICS_WEBSITE_ID", "site-test");

    mount();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Questions santé");
    expect(screen.getByTestId("state").textContent).toBe("fr dark false");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    // No choice can be read: the banner asks, and no measurement loads.
    expect(screen.getByRole("button", { name: cookieCopy.fr.acceptAll })).toBeTruthy();
    expect(document.getElementById(ANALYTICS_SCRIPT_ID)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "theme" }));
    fireEvent.click(screen.getByRole("button", { name: "readability" }));
    fireEvent.click(screen.getByRole("button", { name: "english" }));
    expect(screen.getByTestId("state").textContent).toBe("en light true");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.classList.contains("high-readability")).toBe(true);

    // The choice made closes the banner for the visit.
    fireEvent.click(screen.getByRole("button", { name: cookieCopy.en.essential }));
    expect(screen.queryByRole("button", { name: cookieCopy.en.acceptAll })).toBeNull();
  });

  it("supporte un stockage plein", () => {
    fillStorage({ language: "en" });
    expect(() => localStorage.setItem("theme", "light")).toThrow();
    mount();
    expect(screen.getByTestId("state").textContent).toBe("en dark false");
    fireEvent.click(screen.getByRole("button", { name: "theme" }));
    fireEvent.click(screen.getByRole("button", { name: cookieCopy.en.acceptAll }));
    expect(screen.getByTestId("state").textContent).toBe("en light false");
    expect(screen.queryByRole("button", { name: cookieCopy.en.acceptAll })).toBeNull();
  });

  it("lit, écrit et retire sans jamais lever d'erreur", () => {
    writeStoredPreference("theme", "light");
    expect(readStoredPreference("theme")).toBe("light");
    removeStoredPreference("theme");
    expect(readStoredPreference("theme")).toBeNull();

    blockStorage();
    expect(readStoredPreference("theme")).toBeNull();
    expect(() => writeStoredPreference("theme", "dark")).not.toThrow();
    expect(() => removeStoredPreference("theme")).not.toThrow();
  });
});
