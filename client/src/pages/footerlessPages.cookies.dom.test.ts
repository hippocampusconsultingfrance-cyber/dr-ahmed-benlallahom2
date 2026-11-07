// @vitest-environment happy-dom
import { createElement, type ComponentType } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// PUB-12 — les pages publiques sans pied de page (404, désinscription du recrutement, maintenance et
// erreur) gardent « Gérer les cookies » en bas de leur contenu : la fenêtre des préférences, dont le
// texte et la politique de confidentialité renvoient à ce bouton, s'y rouvre une fois le choix fait.

vi.mock("@/lib/trpc", () => ({ trpc: { recruitmentPreferences: { unsubscribe: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }) } } } }));

const { default: CookieConsent, cookieCopy } = await import("@/components/CookieConsent");
const { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent } = await import("@/components/cookieConsentState");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { default: NotFound } = await import("./NotFound");
const { default: RecruitmentUnsubscribePage } = await import("./RecruitmentUnsubscribePage");
const { default: ServiceStatusPage } = await import("./ServiceStatusPage");

const pages: Array<[string, ComponentType]> = [
  ["la page 404", NotFound],
  ["/recruitment/unsubscribe", RecruitmentUnsubscribePage],
  ["/maintenance", () => createElement(ServiceStatusPage, { kind: "maintenance" })],
  ["/error", () => createElement(ServiceStatusPage, { kind: "error" })],
];

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("« Gérer les cookies » sur les pages publiques sans pied de page (PUB-12)", () => {
  it.each(pages.flatMap(([name, Page]) => (["fr", "en"] as const).map((language) => [name, language, Page] as const)))("%s (%s) : rouvre le choix enregistré, puis rend le focus au bouton", async (_name, language, Page) => {
    localStorage.setItem("language", language);
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(createCookieConsent(true)));
    const { container } = render(createElement(LanguageProvider, null, createElement(Page), createElement(CookieConsent)));
    const copy = cookieCopy[language];

    // Choix déjà fait : pas de bandeau, et le bouton est la dernière commande de la page, hors de toute annonce.
    expect(document.querySelector(".cookie-consent-banner")).toBeNull();
    const manage = screen.getByRole("button", { name: copy.manage });
    expect(Array.from(container.querySelectorAll("button, a[href]")).at(-1)).toBe(manage);
    expect(manage.closest('[role="alert"], [role="status"], [aria-live]')).toBeNull();

    manage.focus();
    fireEvent.click(manage);
    const dialog = await screen.findByRole("dialog", { name: copy.settings });
    expect(within(dialog).getByText(copy.settingsDescription)).toBeTruthy();
    expect((within(dialog).getAllByRole("checkbox")[1] as HTMLInputElement).checked).toBe(true);

    fireEvent.click(within(dialog).getAllByRole("button", { name: copy.close })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: copy.settings })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(manage));
  });
});

describe("« Gérer les cookies » absent des 404 des espaces privés (PUB-12, ADM-16)", () => {
  // CookieConsent n'est pas monté sous /admin et /candidate (App, FloatingWidgets) : le bouton n'y ouvrirait rien.
  it.each(["/admin/x", "/candidate/xyz", "/ADMIN/x", "/Candidate/xyz"].flatMap((path) => (["fr", "en"] as const).map((language) => [path, language] as const)))("%s (%s) : la 404 n'affiche pas le bouton", (path, language) => {
    localStorage.setItem("language", language);
    window.history.replaceState(null, "", path);
    render(createElement(LanguageProvider, null, createElement(NotFound)));
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: cookieCopy[language].manage })).toBeNull();
  });

  it("le garde sur la 404 d'une adresse publique", () => {
    window.history.replaceState(null, "", "/does-not-exist");
    render(createElement(LanguageProvider, null, createElement(NotFound)));
    expect(screen.getByRole("button", { name: cookieCopy.fr.manage })).toBeTruthy();
  });
});
