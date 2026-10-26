// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Formulaire de contact monté par React dans un DOM, avec le vrai widget
// Turnstile et un faux Cloudflare : le défi n’est chargé qu’à l’approche du
// formulaire, aucun envoi ne part sans jeton (bouton désactivé, et soumission
// bloquée par le widget), puis le message part avec le jeton reçu.

type Challenge = { callback: (token: string) => void; "expired-callback": () => void };
const view = vi.hoisted(() => ({ submit: vi.fn(), toasts: [] as string[] }));

vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  return { trpc: { contact: { submit: { useMutation: (options: object) => useMutation({ mutationFn: (input: unknown) => view.submit(input), ...options }) } } } };
});
vi.mock("sonner", () => ({ toast: { success: (message: string) => view.toasts.push(message), error: (message: string) => view.toasts.push(message) } }));

const { default: ContactSection } = await import("./ContactSection");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { getContactFormCopy, getTurnstileWidgetCopy } = await import("@/lib/publicFormCopy");
const { contentFr } = await import("@/data/content-fr");

const copy = getContactFormCopy("fr");
const form = contentFr.contact.form;
let challenges: Challenge[];

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(LanguageProvider, null, createElement(ContactSection))));
}
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const sendButton = () => screen.getByRole("button", { name: form.send });

beforeEach(() => {
  challenges = [];
  view.submit = vi.fn(async () => ({ success: true, trackingId: "C1234567890AB" }));
  view.toasts = [];
  localStorage.setItem("language", "fr");
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
  // Cloudflare's script is already on the page: the widget renders its challenge through this API.
  const script = document.createElement("script");
  script.id = "cloudflare-turnstile-script";
  document.head.appendChild(script);
  window.turnstile = {
    render: (_element, options) => { challenges.push(options); return `widget-${challenges.length}`; },
    remove: vi.fn(),
    reset: vi.fn(),
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  localStorage.clear();
  delete window.turnstile;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("formulaire de contact et vérification anti-robot (navigateur simulé)", () => {
  it("ne charge le défi qu’au premier passage dans le formulaire et n’envoie rien sans jeton", async () => {
    mount();
    expect(challenges).toHaveLength(0);

    fireEvent.focusIn(field("contact-name"));
    await waitFor(() => expect(challenges).toHaveLength(1));
    fireEvent.change(field("contact-name"), { target: { value: "Jeanne Martin" } });
    fireEvent.change(field("contact-email"), { target: { value: "jeanne@example.test" } });
    fireEvent.change(field("contact-message"), { target: { value: "Je souhaite organiser une consultation pré-anesthésique." } });
    fireEvent.click(field("gdprConsent"));

    expect(sendButton()).toHaveProperty("disabled", true);
    // Submitting anyway (Enter in a field): the widget stops it and says that sending stays blocked.
    fireEvent.submit(field("contact-name").form!);
    expect(await screen.findByText(getTurnstileWidgetCopy("fr").loadError)).toBeTruthy();
    expect(view.submit).not.toHaveBeenCalled();
  });

  it("envoie le message avec le jeton du défi réussi, et se bloque de nouveau quand le jeton expire", async () => {
    mount();
    fireEvent.focusIn(field("contact-name"));
    await waitFor(() => expect(challenges).toHaveLength(1));
    fireEvent.change(field("contact-name"), { target: { value: "Jeanne Martin" } });
    fireEvent.change(field("contact-email"), { target: { value: "jeanne@example.test" } });
    fireEvent.change(field("contact-message"), { target: { value: "Je souhaite organiser une consultation pré-anesthésique." } });
    fireEvent.click(field("gdprConsent"));

    challenges[0]!.callback("single-use-token");
    await waitFor(() => expect(sendButton()).toHaveProperty("disabled", false));
    challenges[0]!["expired-callback"]();
    await waitFor(() => expect(sendButton()).toHaveProperty("disabled", true));

    challenges[0]!.callback("fresh-token");
    await waitFor(() => expect(sendButton()).toHaveProperty("disabled", false));
    fireEvent.click(sendButton());

    expect(await screen.findByText(copy.successTitle)).toBeTruthy();
    expect(view.submit).toHaveBeenCalledTimes(1);
    expect(view.submit).toHaveBeenCalledWith({
      name: "Jeanne Martin",
      email: "jeanne@example.test",
      phone: undefined,
      message: "Je souhaite organiser une consultation pré-anesthésique.",
      gdprConsent: 1,
      turnstileToken: "fresh-token",
    });
    expect(view.toasts).toEqual([copy.sent]);
  });

  it("refuse l’envoi sans consentement, même avec un jeton", async () => {
    mount();
    fireEvent.focusIn(field("contact-name"));
    await waitFor(() => expect(challenges).toHaveLength(1));
    fireEvent.change(field("contact-name"), { target: { value: "Jeanne Martin" } });
    fireEvent.change(field("contact-email"), { target: { value: "jeanne@example.test" } });
    fireEvent.change(field("contact-message"), { target: { value: "Je souhaite organiser une consultation pré-anesthésique." } });
    challenges[0]!.callback("single-use-token");
    await waitFor(() => expect(sendButton()).toHaveProperty("disabled", false));

    // The browser stops at the required box first.
    fireEvent.click(sendButton());
    expect(field("gdprConsent").form!.checkValidity()).toBe(false);
    expect(view.submit).not.toHaveBeenCalled();
    // Past that check (a form submitted from a script), the page refuses as well and points at the box.
    fireEvent.submit(field("gdprConsent").form!);
    await waitFor(() => expect(field("gdprConsent").getAttribute("aria-invalid")).toBe("true"));
    expect(view.toasts).toEqual([copy.consentRequired]);
    expect(view.submit).not.toHaveBeenCalled();
  });
});
