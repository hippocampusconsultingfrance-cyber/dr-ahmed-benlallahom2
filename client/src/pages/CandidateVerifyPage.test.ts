import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Page d’activation ouverte depuis le lien envoyé par email : contrôle du lien
// en cours, formulaire occupé pendant l’activation, lien absent ou refusé avec
// retour vers la connexion, refus du serveur annoncé sans quitter la page, et
// lien expiré pendant la saisie qui mène au renvoi d’un nouveau lien.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type Details = { data?: { email: string; firstName: string; lastName: string }; isLoading: boolean; isError: boolean };
type MutationOptions = { onSuccess?: () => Promise<void>; onError?: (error: { message: string; data?: { reason?: string } }) => void };
const view = vi.hoisted(() => ({
  language: "fr" as "fr" | "en" | "de" | "zh",
  details: { isLoading: false, isError: false } as Details,
  detailsInputs: [] as Array<{ input: unknown; options: { enabled: boolean } }>,
  verification: { isPending: false, isSuccess: false },
  options: {} as MutationOptions,
  mutate: vi.fn(),
  navigations: [] as string[],
  frames: [] as Array<() => void>,
  focused: [] as string[],
}));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/candidate/verify", (path: string) => view.navigations.push(path)] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ candidatePortal: { me: { invalidate: async () => undefined } } }),
    candidatePortal: {
      // A disabled query has no data, as in React Query.
      activationDetails: { useQuery: (input: unknown, options: { enabled: boolean }) => { view.detailsInputs.push({ input, options }); return options.enabled ? view.details : { isLoading: false, isError: false }; } },
      verifyEmail: { useMutation: (options: MutationOptions) => { view.options = options; return { ...view.verification, mutate: view.mutate }; } },
    },
  },
}));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/LanguageMenu", () => ({ default: () => null }));
vi.mock("@/components/CandidateLegalFooter", () => ({ default: () => null }));

const { default: CandidateVerifyPage } = await import("./CandidateVerifyPage");
const { candidateAccountCopy } = await import("./candidateAccountCopy");
const { Button } = await import("@/components/ui/button");

const LINK = "?email=vera%40example.test&token=activation-token-0123456789";
const READY: Details = { data: { email: "vera@example.test", firstName: "Vera", lastName: "Rossi" }, isLoading: false, isError: false };

function openLink(search: string) {
  vi.stubGlobal("window", { location: { search }, setTimeout: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), requestAnimationFrame: (frame: () => void) => view.frames.push(frame) });
  vi.stubGlobal("document", { getElementById: (id: string) => ({ focus: () => view.focused.push(id) }) });
}
const html = () => renderToStaticMarkup(createElement(CandidateVerifyPage));
const render = () => renderStateful(CandidateVerifyPage) as ReactElement;
const byId = (tree: ReactElement, id: string) => elementsOf(tree).find(element => element.props.id === id)!;
const submitButton = (tree: ReactElement) => elementsOf(tree).find(element => element.type === Button && element.props.type === "submit");
const type = (id: string, value: string) => (byId(render(), id).props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });

beforeEach(() => {
  view.language = "fr";
  view.details = READY;
  view.detailsInputs = [];
  view.verification = { isPending: false, isSuccess: false };
  view.options = {};
  view.mutate = vi.fn();
  view.navigations = [];
  view.frames = [];
  view.focused = [];
  openLink(LINK);
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("activation de l’espace candidat", () => {
  it("annonce le contrôle du lien tant qu’il est en cours, sans formulaire", () => {
    view.details = { isLoading: true, isError: false };
    const page = html();
    const copy = candidateAccountCopy.fr;

    expect(view.detailsInputs.at(-1)).toEqual({ input: { email: "vera@example.test", token: "activation-token-0123456789" }, options: expect.objectContaining({ enabled: true }) });
    expect(page).toContain(`role="status" aria-live="polite" aria-label="${copy.verifyingTitle}"`);
    expect(page).toContain(copy.verifyingDescription);
    expect(page).not.toContain("<form");
    expect(page).not.toContain(copy.invalidTitle);
  });

  it("marque le formulaire occupé et désactive le bouton pendant l’activation", () => {
    expect(html()).toContain('aria-busy="false"');
    expect(submitButton(render())!.props.disabled).toBe(false);

    view.verification = { isPending: true, isSuccess: false };
    expect(html()).toContain('aria-busy="true"');
    expect(submitButton(render())!.props.disabled).toBe(true);
  });

  it.each(["fr", "en", "de", "zh"] as const)("refuse un lien incomplet ou refusé et ramène vers la connexion (%s)", language => {
    view.language = language;
    const copy = candidateAccountCopy[language];
    for (const [search, details] of [["?email=vera%40example.test", READY], [LINK, { isLoading: false, isError: true }]] as const) {
      resetStatefulHooks();
      openLink(search);
      view.details = details;
      const page = html();
      expect(page, search).toContain(copy.invalidTitle);
      expect(page, search).toContain(copy.invalidDescription);
      expect(page, search).not.toContain("<form");

      view.navigations = [];
      const back = elementsOf(render()).find(element => element.type === "button" && element.props.children === copy.backToAccess)!;
      (back.props.onClick as () => void)();
      expect(view.navigations, search).toEqual(["/candidate/access"]);
    }
    // Without the token, the link is not even checked.
    expect(view.detailsInputs.some(call => call.options.enabled && !(call.input as { token: string }).token)).toBe(false);
  });

  it.each(["fr", "en", "de", "zh"] as const)("propose un nouveau lien d’activation, l’adresse du lien refusé déjà saisie (%s, REC-17)", language => {
    view.language = language;
    const copy = candidateAccountCopy[language];
    const requestNewLink = () => elementsOf(render()).find(element => element.type === Button && element.props.children === copy.requestNewLink);
    for (const [search, details, destination] of [
      [LINK, { isLoading: false, isError: true }, "/candidate/access?mode=activation&email=vera%40example.test"],
      ["?email=vera%40example.test", READY, "/candidate/access?mode=activation&email=vera%40example.test"],
      ["?token=activation-token-0123456789", READY, "/candidate/access?mode=activation"],
    ] as const) {
      resetStatefulHooks();
      openLink(search);
      view.details = details;
      view.navigations = [];
      expect(html(), search).toContain(copy.requestNewLink);
      (requestNewLink()!.props.onClick as () => void)();
      expect(view.navigations, search).toEqual([destination]);
    }

    // A valid link shows the activation form, not the button.
    resetStatefulHooks();
    openLink(LINK);
    view.details = READY;
    expect(requestNewLink()).toBeUndefined();
  });

  it("n’envoie rien si les deux mots de passe diffèrent, puis annonce le refus du serveur sur la page", () => {
    const copy = candidateAccountCopy.fr;
    render();
    type("candidate-activation-password", "correct horse battery staple");
    type("candidate-activation-password-confirmation", "correct horse battery stapel");
    (elementsOf(render()).find(element => element.type === "form")!.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
    expect(view.mutate).not.toHaveBeenCalled();
    expect(elementsOf(render()).find(element => element.props.role === "status")!.props.children).toBe(copy.passwordMismatch);

    type("candidate-activation-password-confirmation", "correct horse battery staple");
    (elementsOf(render()).find(element => element.type === "form")!.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
    expect(view.mutate).toHaveBeenCalledWith({ email: "vera@example.test", token: "activation-token-0123456789", password: "correct horse battery staple", firstName: "Vera", lastName: "Rossi" });

    view.options.onError!({ message: "TRPCError", data: { reason: "candidate_password_compromised" } });
    const tree = render();
    expect(elementsOf(tree).find(element => element.props.role === "status")!.props.children).toBe(copy.passwordCompromised);
    expect(elementsOf(tree).some(element => element.type === "form")).toBe(true);
    expect(view.navigations).toEqual([]);
  });

  it.each([
    ["fr", "Un champ contient un saut de ligne ou un caractère invisible qui n’y est pas accepté, souvent laissé par un copier-coller : retapez ce texte au clavier, puis renvoyez le formulaire."],
    ["en", "A field contains a line break or an invisible character that is not accepted there, often left by copying and pasting: type that text again on the keyboard, then send the form again."],
    ["zh", "某个字段包含此处不允许的换行符或不可见字符，通常由复制粘贴带入：请用键盘重新输入该内容，然后重新提交表单。"],
  ] as const)("dit de retaper un nom refusé pour ses caractères, sans quitter le formulaire (%s, INTL-05)", (language, expected) => {
    view.language = language;
    render();
    type("candidate-activation-password", "correct horse battery staple");
    type("candidate-activation-password-confirmation", "correct horse battery staple");
    (elementsOf(render()).find(element => element.type === "form")!.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });

    view.options.onError!({ message: "Texte français écrit par le serveur.", data: { reason: "invalid_characters" } });
    const tree = render();
    expect(elementsOf(tree).find(element => element.props.role === "status")!.props.children).toBe(expected);
    expect(elementsOf(tree).some(element => element.type === "form")).toBe(true);
  });

  it.each(["fr", "en", "de", "zh"] as const)("propose un nouveau lien quand le lien expire pendant la saisie du formulaire (%s, REC-17)", language => {
    view.language = language;
    const copy = candidateAccountCopy[language];
    render();
    type("candidate-activation-password", "correct horse battery staple");
    type("candidate-activation-password-confirmation", "correct horse battery staple");
    (elementsOf(render()).find(element => element.type === "form")!.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
    expect(view.mutate).toHaveBeenCalledTimes(1);

    // The link was valid on opening, then the server refuses it on sending.
    view.options.onError!({ message: "Ce lien est invalide ou a expiré.", data: { reason: "candidate_activation_link_invalid" } });
    const tree = render();
    expect(elementsOf(tree).some(element => element.type === "form")).toBe(false);
    expect(elementsOf(tree).find(element => element.type === "h1")!.props.children).toBe(copy.invalidTitle);
    expect(elementsOf(tree).some(element => element.type === "p" && element.props.children === copy.invalidDescription)).toBe(true);
    expect(elementsOf(tree).some(element => element.props.role === "status")).toBe(false);

    // Focus moves from the vanished submit button to the page's new heading.
    view.frames.forEach(frame => frame());
    expect(view.focused).toEqual(["candidate-activation-unavailable-title"]);
    expect(byId(tree, "candidate-activation-unavailable-title").props.tabIndex).toBe(-1);

    const requestNewLink = elementsOf(tree).find(element => element.type === Button && element.props.children === copy.requestNewLink)!;
    (requestNewLink.props.onClick as () => void)();
    expect(view.navigations).toEqual(["/candidate/access?mode=activation&email=vera%40example.test"]);
  });
});
