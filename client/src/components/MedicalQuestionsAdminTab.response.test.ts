import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Réponse à une question santé dans l’administration, comme la rédige le
// médecin : validation impossible sous 20 caractères (et expliquée),
// publication seulement avec l’accord du patient et un contenu anonymisé,
// retrait de la bibliothèque publique après confirmation, fiche privée en
// erreur avec une reprise, et colonnes qui laissent la place au panneau de
// réponse quand une question contient une longue chaîne.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type MutationOptions = { onSuccess?: (result: any) => unknown };
const state = vi.hoisted(() => {
  const mutations: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    mutations,
    page: { items: [] as Array<Record<string, unknown>>, total: 0 },
    selected: { data: null as null | Record<string, unknown>, error: null as null | { message: string }, refetch: vi.fn() },
    toast: { success: vi.fn(), error: vi.fn() },
    mutation: (path: string) => (_options?: MutationOptions) => ({ mutate: (mutations[path] ??= vi.fn()), isPending: false }),
  };
});

vi.mock("sonner", () => ({ toast: state.toast }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ medicalQuestions: { admin: { get: { invalidate: vi.fn() }, list: { invalidate: vi.fn() } } } }),
    useQueries: (build: (t: unknown) => unknown[]) => {
      const t = { medicalQuestions: { admin: { list: (input: unknown) => input } } };
      return build(t).map(() => ({ data: state.page, isLoading: false, error: null }));
    },
    medicalQuestions: {
      admin: {
        get: { useQuery: () => ({ data: state.selected.data, isLoading: false, error: state.selected.error, refetch: state.selected.refetch }) },
        saveDraft: { useMutation: state.mutation("saveDraft") },
        improveDraft: { useMutation: state.mutation("improveDraft") },
        sendValidatedResponse: { useMutation: state.mutation("sendValidatedResponse") },
        updatePublication: { useMutation: state.mutation("updatePublication") },
        unpublish: { useMutation: state.mutation("unpublish") },
        reject: { useMutation: state.mutation("reject") },
        delete: { useMutation: state.mutation("delete") },
      },
    },
  },
}));

const { default: MedicalQuestionsAdminTab } = await import("./MedicalQuestionsAdminTab");

type Element = { type: unknown; props: Record<string, any> };
const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as Element).props.children);
  return "";
};
const elements = () => elementsOf(renderStateful(MedicalQuestionsAdminTab as () => ReactElement)) as Element[];
const button = (name: string) => elements().find(element => element.type === "button" && textOf(element.props.children).trim() === name);
const write = (id: string, value: string) => elements().find(element => element.props.id === id)!.props.onChange({ target: { value } });
const hint = () => textOf(elements().find(element => element.props.id === "medical-question-response-requirement"));
const sent = () => state.mutations.sendValidatedResponse!;

const question = (extra: Record<string, unknown> = {}) => ({
  id: 7, trackingId: "QMED-ADMIN007-00000", firstName: "Jeanne", lastName: "Martin", email: "jeanne@test.local", phone: "+33600000000",
  question: "Peut-on boire de l’eau avant une anesthésie ? https://exemple.test/un-lien-tres-long-sans-espace-aucun-qui-deborderait-de-la-colonne",
  status: "drafting", createdAt: new Date(Date.UTC(2026, 7, 7)), publicationConsent: 0, adminResponse: null, publicQuestion: null, publicResponse: null, responseSentAt: null, ...extra,
});

let confirmAnswer: boolean;
const confirm = vi.fn(() => confirmAnswer);

beforeEach(() => {
  for (const key of Object.keys(state.mutations)) delete state.mutations[key];
  state.toast.success.mockClear();
  state.toast.error.mockClear();
  state.selected = { data: question(), error: null, refetch: vi.fn() };
  state.page = { items: [question()], total: 1 };
  confirmAnswer = false;
  confirm.mockClear();
  vi.stubGlobal("window", { confirm, matchMedia: () => ({ matches: true }) });
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("réponse privée à une question santé", () => {
  it("n’active la validation qu’à partir de 20 caractères, en disant combien il en manque", () => {
    const send = () => button("Valider et envoyer")!;
    expect(send().props.disabled).toBe(true);
    expect(send().props.className).toContain("disabled:pointer-events-none");
    expect(hint()).toContain("Ajoutez encore 20 caractères");

    write("medical-question-private-response", "Oui, jusqu’à 2 h av");
    expect(send().props.disabled).toBe(true);
    expect(hint()).toContain("Ajoutez encore 1 caractère à");
    send().props.onClick();
    expect(sent()).not.toHaveBeenCalled();
    expect(state.toast.error).toHaveBeenCalledWith("La réponse privée doit comporter au moins 20 caractères.");

    write("medical-question-private-response", "Oui, jusqu’à 2 h avant.");
    expect(send().props.disabled).toBe(false);
    send().props.onClick();
    expect(sent().mock.calls).toEqual([[{ id: 7, adminResponse: "Oui, jusqu’à 2 h avant.", publicQuestion: "", publicResponse: "", publish: false }]]);
  });

  it("ne publie qu’avec l’accord du patient et une version anonymisée complète", () => {
    const publication = () => elements().find(element => element.type === "input" && element.props.type === "checkbox")!;
    expect(publication().props.disabled).toBe(true);

    resetStatefulHooks();
    state.selected.data = question({ publicationConsent: 1, adminResponse: "Oui, jusqu’à 2 h avant l’anesthésie." });
    expect(publication().props.disabled).toBe(false);
    publication().props.onChange({ target: { checked: true } });
    expect(button("Valider, envoyer et publier")!.props.disabled).toBe(true);
    expect(hint()).toContain("Complétez la question et la réponse anonymisées");

    write("medical-question-public-question", "Peut-on boire de l’eau avant une anesthésie ?");
    write("medical-question-public-response", "Oui, de l’eau claire jusqu’à 2 h avant.");
    button("Valider, envoyer et publier")!.props.onClick();
    expect(sent().mock.calls[0]![0]).toMatchObject({ id: 7, publish: true, publicQuestion: "Peut-on boire de l’eau avant une anesthésie ?" });
  });

  it("retire une question publiée de la bibliothèque publique seulement après confirmation", () => {
    state.selected.data = question({ status: "published", publicationConsent: 1, responseSentAt: new Date(), adminResponse: "Oui, jusqu’à 2 h avant l’anesthésie." });
    button("Retirer de la bibliothèque publique")!.props.onClick();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(state.mutations.unpublish).not.toHaveBeenCalled();

    confirmAnswer = true;
    button("Retirer de la bibliothèque publique")!.props.onClick();
    expect(state.mutations.unpublish!.mock.calls).toEqual([[{ id: 7 }]]);
  });
});

describe("sélection d’une question santé", () => {
  it("affiche une erreur exploitable avec une reprise si la fiche privée ne peut pas être chargée", () => {
    state.selected = { data: null, error: { message: "Délai dépassé" }, refetch: vi.fn() };
    const alert = elements().find(element => element.props.role === "alert")!;
    expect(textOf(alert)).toContain("Impossible de charger cette demande privée.");
    expect(textOf(alert)).toContain("Délai dépassé");
    button("Réessayer le chargement")!.props.onClick();
    expect(state.selected.refetch).toHaveBeenCalledTimes(1);
  });

  it("garde la place du panneau de réponse quand une question contient une URL ou une longue chaîne", () => {
    const tree = elements();
    expect(tree.find(element => element.type === "section")!.props.className).toContain("lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]");
    const item = tree.find(element => element.type === "button" && textOf(element).includes("QMED-ADMIN007-00000"))!;
    expect(item.props.className).toContain("min-w-0 w-full");
    const excerpt = elementsOf(item.props.children).find(element => textOf(element).startsWith("Peut-on boire"))!;
    expect(excerpt.props.className).toContain("[overflow-wrap:anywhere]");
    expect(tree.find(element => element.props.role === "region")!.props.className).toContain("min-w-0");
  });
});
