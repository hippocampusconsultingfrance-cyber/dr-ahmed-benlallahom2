import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  elementsOf,
  renderStateful,
  resetStatefulHooks,
} from "@/testing/statefulRender";

// REC-17 : un lien d’activation refusé ou expiré ouvre la page d’accès sur
// « E-mail d’activation non reçu », l’adresse du lien déjà saisie : il reste
// le contrôle anti-bot, puis un clic pour recevoir un nouveau lien.

vi.mock("react", async importOriginal =>
  (await import("@/testing/statefulRender")).withStatefulHooks(
    await importOriginal()
  )
);

type MutationOptions = { onSuccess?: () => unknown; onSettled?: () => unknown };
const view = vi.hoisted(() => ({
  language: "en" as "fr" | "en" | "de" | "zh",
  mutations: {} as Record<
    string,
    {
      options: MutationOptions;
      mutate: ReturnType<typeof import("vitest").vi.fn>;
    }
  >,
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: view.language }),
}));
vi.mock("@/components/TurnstileWidget", () => ({
  TurnstileWidget: function TurnstileWidget() {
    return null;
  },
}));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/LanguageMenu", () => ({ default: () => null }));
vi.mock("@/components/CandidateLegalFooter", () => ({
  default: () => null,
  candidateLegalLinks: {
    legal: "/legal",
    privacy: "/legal?tab=privacy",
    terms: "/legal?tab=terms",
  },
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/candidate/access", vi.fn()],
}));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string) => ({
    useMutation: (options: MutationOptions = {}) => {
      view.mutations[name] ??= { options, mutate: vi.fn() };
      view.mutations[name]!.options = options;
      return { mutate: view.mutations[name]!.mutate, isPending: false };
    },
  });
  return {
    trpc: {
      useUtils: () => ({ candidatePortal: { me: { invalidate: vi.fn() } } }),
      candidatePortal: {
        login: mutation("login"),
        register: mutation("register"),
        requestPasswordReset: mutation("requestPasswordReset"),
        resendVerification: mutation("resendVerification"),
        resolveInvitation: {
          useQuery: () => ({ data: undefined, isError: false }),
        },
      },
    },
  };
});

const {
  default: CandidateAccessPage,
  candidateAccessCopy,
  getCandidateActivationResendEmail,
} = await import("./CandidateAccessPage");
const { candidateActivationResendPath } = await import("./CandidateVerifyPage");
const { TurnstileWidget } = await import("@/components/TurnstileWidget");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the props of any element of the tree, read and called as each test needs
type Element = {
  type: unknown;
  props: Record<string, any>;
  key?: string | null;
};
const elements = () =>
  elementsOf(
    renderStateful(CandidateAccessPage as () => ReactElement)
  ) as Element[];
const byId = (id: string) =>
  elements().find(element => element.props.id === id);
const pressedMode = () =>
  elements().find(
    element =>
      element.props["aria-controls"] === "candidate-access-form" &&
      element.props["aria-pressed"] === true
  )!.props.children;
const turnstile = () =>
  elements().find(element => element.type === TurnstileWidget);
const submit = () =>
  elements()
    .find(element => element.type === "form")!
    .props.onSubmit({ preventDefault: vi.fn() });

function openAccessPage(search: string) {
  vi.stubGlobal("window", {
    location: {
      search,
      href: `https://drahmedbenlallahom.com/candidate/access${search}`,
    },
    requestAnimationFrame: vi.fn(),
  });
}

beforeEach(() => {
  view.language = "en";
  view.mutations = {};
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("REC-17 — nouveau lien d’activation depuis un lien refusé", () => {
  it.each(["fr", "en", "de", "zh"] as const)(
    "ouvre le renvoi, l’adresse du lien saisie, et l’envoie après le contrôle anti-bot (%s)",
    language => {
      view.language = language;
      const copy = candidateAccessCopy[language];
      const path = candidateActivationResendPath("vera.rossi+cv@example.test");
      expect(path.startsWith("/candidate/access?")).toBe(true);
      openAccessPage(path.slice(path.indexOf("?")));

      expect(pressedMode()).toBe(copy.navigationActivation);
      expect(
        elements().some(
          element => element.props.children === copy.activationTitle
        )
      ).toBe(true);
      expect(byId("candidate-email")!.props.value).toBe(
        "vera.rossi+cv@example.test"
      );
      expect(byId("candidate-email")!.props.readOnly).toBe(false);
      expect(byId("candidate-password")).toBeUndefined();

      // The anti-bot check is still required: nothing leaves without it.
      submit();
      expect(view.mutations.resendVerification!.mutate).not.toHaveBeenCalled();
      expect(
        elements().find(element => element.props.role === "status")!.props
          .children
      ).toBe(copy.turnstileActivationMissing);

      expect(turnstile()!.key).toBe("activation-0");
      turnstile()!.props.onToken("turnstile-token-from-the-widget");
      submit();
      expect(view.mutations.resendVerification!.mutate).toHaveBeenCalledWith({
        email: "vera.rossi+cv@example.test",
        turnstileToken: "turnstile-token-from-the-widget",
        language,
      });
    }
  );

  it("ouvre le renvoi vide quand le lien n’avait pas d’adresse, et ne change rien aux autres adresses de la page", () => {
    const copy = candidateAccessCopy.en;
    const path = candidateActivationResendPath("");
    openAccessPage(path.slice(path.indexOf("?")));
    expect(pressedMode()).toBe(copy.navigationActivation);
    expect(byId("candidate-email")!.props.value).toBe("");

    for (const [search, mode] of [
      ["?email=vera%40example.test", copy.navigationLogin],
      ["?mode=forgot&email=vera%40example.test", copy.navigationLogin],
      [
        "?invite=1&email=vera%40example.test&mode=activation",
        copy.navigationRegister,
      ],
    ] as const) {
      resetStatefulHooks();
      view.mutations = {};
      openAccessPage(search);
      expect(pressedMode(), search).toBe(mode);
    }
    expect(
      getCandidateActivationResendEmail("?email=vera%40example.test")
    ).toBeNull();
    expect(
      getCandidateActivationResendEmail(
        `?mode=activation&email=${"a".repeat(400)}%40example.test`
      )
    ).toHaveLength(320);
  });
});
