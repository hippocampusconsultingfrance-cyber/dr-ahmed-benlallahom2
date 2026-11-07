// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const { TURNSTILE_DEFER_ROOT_MARGIN } = await import("./TurnstileWidget");

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
  vi.unstubAllGlobals();
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
    expect((await screen.findByRole("alert")).textContent).toContain(getTurnstileWidgetCopy("fr").loadError);
    expect(view.submit).not.toHaveBeenCalled();
  });

  it("charge le défi à l’approche du formulaire, 400 px avant qu’il n’entre dans l’écran, sans attendre le focus (PERF-04)", async () => {
    const observers: Array<{ callback: IntersectionObserverCallback; options?: IntersectionObserverInit }> = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { observers.push({ callback, options }); }
      observe() {}
      disconnect() {}
    });
    mount();
    expect(observers.map(observer => observer.options?.rootMargin)).toEqual([TURNSTILE_DEFER_ROOT_MARGIN]);
    expect(TURNSTILE_DEFER_ROOT_MARGIN).toBe("400px 0px");
    const scroll = (isIntersecting: boolean) => act(() => observers[0]!.callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));

    scroll(false);
    expect(challenges).toHaveLength(0);
    scroll(true);
    await waitFor(() => expect(challenges).toHaveLength(1));
  });

  it("envoie le message avec le jeton du défi réussi, et se bloque de nouveau quand le jeton expire", async () => {
    mount();
    fireEvent.focusIn(field("contact-name"));
    await waitFor(() => expect(challenges).toHaveLength(1));
    fireEvent.change(field("contact-name"), { target: { value: "Jeanne Martin" } });
    fireEvent.change(field("contact-email"), { target: { value: "jeanne@example.test" } });
    fireEvent.change(field("contact-message"), { target: { value: "Je souhaite organiser une consultation pré-anesthésique." } });
    fireEvent.click(screen.getByRole("radio", { name: copy.categories.press_partner }));
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
      category: "press_partner",
      language: "fr",
    });
    expect(view.toasts).toEqual([copy.sent]);
    // PUB-09: the confirmation gives the reference the server returned.
    expect(screen.getByText("C1234567890AB").closest("p")!.textContent).toBe(`${copy.reference} C1234567890AB`);
  });

  it("après un refus de l’anti-robot, rend un nouveau défi et renvoie le message saisi avec son nouveau jeton, sans recharger la page (PUB-09)", async () => {
    // The server checks the token first, whatever it answers next: that token is used up.
    view.submit = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("Texte français écrit par le serveur."), { data: { code: "BAD_REQUEST", reason: "security_check_failed" } }))
      .mockResolvedValueOnce({ success: true, trackingId: "C1234567890AB" });
    mount();
    fireEvent.focusIn(field("contact-name"));
    await waitFor(() => expect(challenges).toHaveLength(1));
    fireEvent.change(field("contact-name"), { target: { value: "Jeanne Martin" } });
    fireEvent.change(field("contact-email"), { target: { value: "jeanne@example.test" } });
    fireEvent.change(field("contact-message"), { target: { value: "Je souhaite organiser une consultation pré-anesthésique." } });
    fireEvent.click(field("gdprConsent"));
    challenges[0]!.callback("first-token");
    await waitFor(() => expect(sendButton()).toHaveProperty("disabled", false));
    fireEvent.click(sendButton());

    expect((await screen.findByRole("alert")).textContent).toBe(copy.refusals.security_check_failed);
    expect(view.toasts).toEqual([copy.refusals.security_check_failed]);
    await waitFor(() => expect(challenges).toHaveLength(2));
    expect(window.turnstile!.remove).toHaveBeenCalledWith("widget-1");
    // Nothing leaves with the used token: sending waits for the new challenge.
    expect(sendButton()).toHaveProperty("disabled", true);
    fireEvent.submit(field("contact-name").form!);
    expect(view.submit).toHaveBeenCalledTimes(1);

    challenges[1]!.callback("second-token");
    await waitFor(() => expect(sendButton()).toHaveProperty("disabled", false));
    fireEvent.click(sendButton());

    expect(await screen.findByText(copy.successTitle)).toBeTruthy();
    expect(view.submit).toHaveBeenCalledTimes(2);
    expect(view.submit.mock.calls.map(([input]) => input)).toEqual([
      expect.objectContaining({ turnstileToken: "first-token" }),
      expect.objectContaining({ name: "Jeanne Martin", email: "jeanne@example.test", message: "Je souhaite organiser une consultation pré-anesthésique.", gdprConsent: 1, turnstileToken: "second-token" }),
    ]);
  });

  it("garde une adresse collée sans les marques de direction ni l’espace laissés aux extrémités, et l’envoie ainsi (INTL-05)", async () => {
    mount();
    fireEvent.focusIn(field("contact-name"));
    await waitFor(() => expect(challenges).toHaveLength(1));
    fireEvent.change(field("contact-name"), { target: { value: "Jeanne Martin" } });
    // LRM before, RLM and a no-break space after, as a paste from a right-to-left text leaves them.
    fireEvent.change(field("contact-email"), { target: { value: "‎jeanne@example.test‏ " } });
    expect(field("contact-email").value).toBe("jeanne@example.test");
    expect(field("contact-email").checkValidity()).toBe(true);
    fireEvent.change(field("contact-message"), { target: { value: "Je souhaite organiser une consultation pré-anesthésique." } });
    fireEvent.click(field("gdprConsent"));
    challenges[0]!.callback("single-use-token");
    await waitFor(() => expect(sendButton()).toHaveProperty("disabled", false));
    fireEvent.click(sendButton());

    expect(await screen.findByText(copy.successTitle)).toBeTruthy();
    expect(view.submit).toHaveBeenCalledWith(expect.objectContaining({ email: "jeanne@example.test" }));
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

describe("formulaire de contact : qui écrit, données de santé et remplissage automatique", () => {
  const linksOf = () => Array.from(document.querySelectorAll("fieldset a")).map(link => [link.textContent, link.getAttribute("href")]);

  it("mène chaque visiteur vers la page faite pour sa demande, sans rien imposer à la presse (PUB-22)", () => {
    mount();
    expect(screen.getByRole("group", { name: copy.categoryLegend })).toBeTruthy();
    expect(linksOf()).toEqual([]);

    fireEvent.click(screen.getByRole("radio", { name: copy.categories.patient }));
    expect(linksOf()).toEqual([[copy.categoryLinks.booking, "/booking"], [copy.categoryLinks.medicalQuestions, "/questions-anesthesie"]]);
    fireEvent.click(screen.getByRole("radio", { name: copy.categories.health_professional }));
    expect(linksOf()).toEqual([[copy.categoryLinks.recruitment, "/recruitment"]]);
    fireEvent.click(screen.getByRole("radio", { name: copy.categories.institution }));
    expect(linksOf()).toEqual([[copy.categoryLinks.employers, "/employers"]]);
    fireEvent.click(screen.getByRole("radio", { name: copy.categories.press_partner }));
    expect(linksOf()).toEqual([]);
  });

  it("demande, sous le message, de ne pas y écrire d’information médicale, et le lie au champ (PUB-22)", () => {
    mount();
    const notice = document.getElementById(field("contact-message").getAttribute("aria-describedby")!);
    expect(notice?.textContent).toBe(copy.medicalNotice);
  });

  it("dans la page anglaise, propose les mêmes choix et la même mise en garde en anglais", () => {
    localStorage.setItem("language", "en");
    mount();
    const english = getContactFormCopy("en");
    fireEvent.click(screen.getByRole("radio", { name: english.categories.patient }));
    expect(linksOf().map(([label]) => label)).toEqual([english.categoryLinks.booking, english.categoryLinks.medicalQuestions]);
    expect(screen.getByText(english.medicalNotice)).toBeTruthy();
  });

  it("laisse le navigateur remplir le nom, le téléphone et l’email (A11Y-16)", () => {
    mount();
    expect(["contact-name", "contact-phone", "contact-email"].map(id => field(id).getAttribute("autocomplete"))).toEqual(["name", "tel", "email"]);
  });
});
