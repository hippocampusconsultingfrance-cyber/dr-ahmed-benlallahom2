import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Question santé posée comme par un patient : consentement explicite au
// traitement de données de santé et prise en compte de l’avertissement
// d’urgence exigés avant tout envoi, publication anonymisée facultative et
// transmise telle que choisie, anti-robot obligatoire ; encadrés urgence et
// confidentialité rendus comme des notes (PUB-A11Y-02).

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

const state = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr", content: { hero: { bookConsultation: "Réserver" } } }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/TurnstileWidget", () => ({ TurnstileWidget: function TurnstileWidget() { return null; } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    medicalQuestions: {
      published: { useQuery: () => ({ isLoading: false, data: [] }) },
      submit: { useMutation: () => ({ isPending: false, mutate: state.mutate }) },
    },
  },
}));

const { default: MedicalQuestionsPage } = await import("./MedicalQuestionsPage");
const { TurnstileWidget } = await import("@/components/TurnstileWidget");

type Element = { type: unknown; props: Record<string, any> };
const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as Element).props.children);
  return "";
};
const elements = () => elementsOf(renderStateful(MedicalQuestionsPage as () => ReactElement)) as Element[];
const byId = (id: string) => elements().find(element => element.props.id === id)!;
/** The three consent boxes, in the order of the form: health data, publication, emergency. */
const consents = () => elements().filter(element => typeof element.type === "function" && (element.type as { name: string }).name === "Consent");
const submit = () => elements().find(element => element.type === "form")!.props.onSubmit({ preventDefault: vi.fn() });

function fillQuestion() {
  byId("medical-question-firstName").props.onChange("Jeanne");
  byId("medical-question-lastName").props.onChange("Martin");
  byId("medical-question-email").props.onChange("jeanne@test.local");
  byId("medical-question-phone").props.onChange("+33 6 12 34 56 78");
  byId("medical-question-text").props.onChange({ target: { value: "Puis-je garder mes lunettes jusqu’au bloc opératoire ?" } });
}
const tick = (index: number, checked = true) => consents()[index]!.props.onChange(checked);
const solveChallenge = (token = "single-use-token") => elements().find(element => element.type === TurnstileWidget)!.props.onToken(token);

beforeEach(() => {
  state.mutate.mockClear();
  vi.stubGlobal("window", { requestAnimationFrame: vi.fn() });
  vi.stubGlobal("document", { getElementById: () => ({ focus: vi.fn() }) });
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("question santé : consentements avant l’envoi", () => {
  it("demande un consentement explicite pour les données de santé et l’avertissement d’urgence, la publication restant facultative", () => {
    const [health, publication, urgency] = consents();
    expect(consents()).toHaveLength(3);
    expect(textOf(health!.props.children)).toContain("qui peut contenir des informations sur ma santé");
    // The boxes as rendered: only the two required ones are announced as required.
    const markup = (consent: Element) => renderToStaticMarkup(createElement(consent.type as never, consent.props));
    expect(markup(health!)).toContain('aria-required="true"');
    expect(markup(urgency!)).toContain('aria-required="true"');
    expect(markup(publication!)).not.toContain("aria-required");
  });

  it("n’envoie rien sans consentement aux données de santé, sans l’avertissement d’urgence ou sans anti-robot", () => {
    fillQuestion();
    tick(2);
    solveChallenge();
    submit();
    expect(state.mutate).not.toHaveBeenCalled();
    expect(consents()[0]!.props.invalid).toBe(true);

    tick(0);
    tick(2, false);
    submit();
    expect(state.mutate).not.toHaveBeenCalled();
    expect(consents()[2]!.props.invalid).toBe(true);

    resetStatefulHooks();
    fillQuestion();
    tick(0);
    tick(2);
    submit();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("envoie la question sans publication quand elle n’est pas acceptée, et avec quand elle l’est", () => {
    fillQuestion();
    tick(0);
    tick(2);
    solveChallenge();
    submit();
    expect(state.mutate).toHaveBeenCalledTimes(1);
    expect(state.mutate.mock.calls[0]![0]).toMatchObject({ privacyConsent: true, urgencyAcknowledged: true, publicationConsent: false, turnstileToken: "single-use-token", language: "fr" });

    tick(1);
    submit();
    expect(state.mutate.mock.calls[1]![0]).toMatchObject({ publicationConsent: true });
  });
});

describe("question santé : encadrés", () => {
  it("présente l’avertissement d’urgence et la confidentialité comme deux notes, pas comme des repères complémentaires (PUB-A11Y-02)", () => {
    const html = renderToStaticMarkup(createElement(MedicalQuestionsPage));
    expect(html).not.toContain("<aside");
    expect(html.match(/<section role="note"/g)).toHaveLength(2);
    expect(html).toContain("Ce service ne traite pas les urgences");
  });
});
