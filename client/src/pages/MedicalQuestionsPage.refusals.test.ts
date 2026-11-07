import { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Question santé refusée par le serveur pour les caractères d’un champ
// (INTL-05) : la page dit de retaper ce texte, dans sa langue, au lieu de
// « vérifiez les champs et la vérification de sécurité », et n’entoure pas
// l’anti-robot, qui n’y est pour rien.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type MutationOptions = { onError: (error: { data?: { code?: string; reason?: string } | null }) => void };
const state = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh", mutate: vi.fn(), options: null as MutationOptions | null }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: state.language, content: { hero: { bookConsultation: "Réserver" } } }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/TurnstileWidget", () => ({ TurnstileWidget: function TurnstileWidget() { return null; } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    medicalQuestions: {
      published: { useQuery: () => ({ isLoading: false, data: [] }) },
      submit: { useMutation: (options: MutationOptions) => { state.options = options; return { isPending: false, mutate: state.mutate }; } },
    },
  },
}));

const { default: MedicalQuestionsPage } = await import("./MedicalQuestionsPage");
const { TurnstileWidget } = await import("@/components/TurnstileWidget");

type Element = { type: unknown; props: Record<string, any> };
const elements = () => elementsOf(renderStateful(MedicalQuestionsPage as () => ReactElement)) as Element[];
const byId = (id: string) => elements().find(element => element.props.id === id)!;
const consents = () => elements().filter(element => typeof element.type === "function" && (element.type as { name: string }).name === "Consent");
const alertText = () => elements().find(element => element.props.role === "alert")?.props.children ?? null;
const challengeFramed = () => elements().some(element => typeof element.props.className === "string" && element.props.className.includes("border-destructive/50"));

/** Fills and sends the question as a patient would, the security check solved. */
function sendQuestion() {
  byId("medical-question-firstName").props.onChange("Jeanne");
  byId("medical-question-lastName").props.onChange("Martin");
  byId("medical-question-email").props.onChange("jeanne@test.local");
  byId("medical-question-phone").props.onChange("+33 6 12 34 56 78");
  byId("medical-question-text").props.onChange({ target: { value: "Puis-je garder mes lunettes jusqu’au bloc opératoire ?" } });
  consents()[0]!.props.onChange(true);
  consents()[2]!.props.onChange(true);
  elements().find(element => element.type === TurnstileWidget)!.props.onToken("single-use-token");
  elements().find(element => element.type === "form")!.props.onSubmit({ preventDefault: vi.fn() });
}

beforeEach(() => {
  state.mutate.mockClear();
  state.options = null;
  vi.stubGlobal("window", { requestAnimationFrame: vi.fn() });
  vi.stubGlobal("document", { getElementById: () => ({ focus: vi.fn() }) });
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("question santé refusée pour les caractères d’un champ (INTL-05)", () => {
  it.each([
    ["fr", "Un champ contient un saut de ligne ou un caractère invisible qui n’y est pas accepté, souvent laissé par un copier-coller : retapez ce texte au clavier, puis renvoyez le formulaire."],
    ["en", "A field contains a line break or an invisible character that is not accepted there, often left by copying and pasting: type that text again on the keyboard, then send the form again."],
    ["de", "Ein Feld enthält einen Zeilenumbruch oder ein unsichtbares Zeichen, das dort nicht zulässig ist, oft ein Rest vom Kopieren und Einfügen: Geben Sie diesen Text erneut über die Tastatur ein und senden Sie das Formular dann erneut."],
    ["zh", "某个字段包含此处不允许的换行符或不可见字符，通常由复制粘贴带入：请用键盘重新输入该内容，然后重新提交表单。"],
  ] as const)("dit de retaper le texte, sans entourer l’anti-robot (%s)", (language, expected) => {
    state.language = language;
    sendQuestion();
    expect(state.mutate).toHaveBeenCalledTimes(1);

    state.options!.onError({ data: { code: "BAD_REQUEST", reason: "invalid_characters" } });
    expect(alertText()).toBe(expected);
    expect(challengeFramed()).toBe(false);
  });

  it("garde, pour un autre refus de saisie, l’anti-robot à renouveler", () => {
    state.language = "fr";
    sendQuestion();
    state.options!.onError({ data: { code: "BAD_REQUEST" } });
    expect(alertText()).toBe("Vérifiez les champs requis et la vérification de sécurité, puis réessayez.");
    expect(challengeFramed()).toBe(true);
  });
});
