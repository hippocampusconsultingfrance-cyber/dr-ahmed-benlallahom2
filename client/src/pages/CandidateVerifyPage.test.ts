import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Page d’activation ouverte depuis le lien envoyé par email : contrôle du lien
// en cours, formulaire occupé pendant l’activation, lien absent ou refusé avec
// retour vers la connexion, et refus du serveur annoncé sans quitter la page.

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
  vi.stubGlobal("window", { location: { search }, setTimeout: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
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

    view.options.onError!({ message: "TRPCError", data: { reason: "candidate_activation_link_invalid" } });
    const tree = render();
    expect(elementsOf(tree).find(element => element.props.role === "status")!.props.children).toBe(copy.invalidDescription);
    expect(elementsOf(tree).some(element => element.type === "form")).toBe(true);
    expect(view.navigations).toEqual([]);
  });
});
