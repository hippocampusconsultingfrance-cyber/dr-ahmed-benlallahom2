import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ListInput = { statuses?: string[]; order: string; limit: number; offset: number };
type MutationOptions = { onSuccess?: (result: never) => unknown; onError?: (error: Error) => unknown };

const state = vi.hoisted(() => ({
  requests: [] as ListInput[],
  page: { items: [] as Array<Record<string, unknown>>, total: 0 },
  selected: null as null | Record<string, unknown>,
  deleteMutate: null as null | ReturnType<typeof vi.fn>,
  deleteOptions: {} as MutationOptions,
  sendOptions: {} as MutationOptions,
  invalidated: [] as string[],
  toasts: [] as Array<[string, string]>,
}));

const question = (id: number, status: string, extra: Record<string, unknown> = {}) => ({
  id, trackingId: `QMED-ADMIN00${id}-00000`, firstName: "Jeanne", lastName: `Patiente${id}`, email: `p${id}@test.local`, phone: "+33600000000",
  question: "Peut-on boire de l’eau avant une anesthésie ?", status, createdAt: new Date(Date.UTC(2026, 7, id)), publicationConsent: 0,
  adminResponse: null, publicQuestion: null, publicResponse: null, responseSentAt: null, ...extra,
});

vi.mock("sonner", () => ({
  toast: {
    success: (message: string) => state.toasts.push(["success", message]),
    warning: (message: string) => state.toasts.push(["warning", message]),
    error: (message: string) => state.toasts.push(["error", message]),
  },
}));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    trpc: {
      useUtils: () => ({ medicalQuestions: { admin: { get: { invalidate: () => state.invalidated.push("get") }, list: { invalidate: () => state.invalidated.push("list") } } } }),
      useQueries: (build: (t: unknown) => unknown[]) => {
        const t = { medicalQuestions: { admin: { list: (input: ListInput) => { state.requests.push(input); return input; } } } };
        return build(t).map(() => ({ data: state.page, isLoading: false, error: null }));
      },
      medicalQuestions: {
        admin: {
          get: { useQuery: () => ({ data: state.selected, isLoading: false, error: null, refetch: vi.fn() }) },
          saveDraft: { useMutation: mutation },
          improveDraft: { useMutation: mutation },
          sendValidatedResponse: {
            useMutation: (options: MutationOptions = {}) => {
              state.sendOptions = options;
              return { mutate: vi.fn(), isPending: false };
            },
          },
          updatePublication: { useMutation: mutation },
          unpublish: { useMutation: mutation },
          reject: { useMutation: mutation },
          delete: {
            useMutation: (options: MutationOptions = {}) => {
              state.deleteOptions = options;
              return { mutate: state.deleteMutate, isPending: false };
            },
          },
        },
      },
    },
  };
});

const { default: MedicalQuestionsAdminTab, revealQuestionDetail } = await import("./MedicalQuestionsAdminTab");

const render = () => renderToStaticMarkup(createElement(MedicalQuestionsAdminTab));

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

/** Renders the tab and returns the click handler of its button whose text contains `label`. */
function clickHandler(label: string) {
  let tree: ReactNode = null;
  // The tab's hooks run in this wrapper's render, which keeps the element tree the tab returns.
  const Probe = () => (tree = MedicalQuestionsAdminTab());
  renderToStaticMarkup(createElement(Probe));
  const found = elements(tree).find(element => element.type === "button" && typeof element.props.onClick === "function" && renderToStaticMarkup(element).includes(label));
  if (!found) throw new Error(`no « ${label} » button`);
  return found.props.onClick as () => void;
}

beforeEach(() => {
  state.requests = [];
  state.page = { items: [question(1, "submitted"), question(2, "drafting")], total: 30 };
  state.selected = null;
  state.deleteMutate = vi.fn();
  state.deleteOptions = {};
  state.sendOptions = {};
  state.invalidated = [];
  state.toasts = [];
  vi.stubGlobal("window", { confirm: vi.fn(() => true) });
});
afterEach(() => vi.unstubAllGlobals());

describe("ADM-01 — file des questions santé", () => {
  it("s’ouvre sur « À traiter » : nouvelles et brouillons, de la plus ancienne à la plus récente, 50 par page", () => {
    const html = render();
    expect(state.requests).toEqual([{ statuses: ["submitted", "drafting"], order: "oldest", limit: 50, offset: 0 }]);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>À traiter<\/button>/);
    expect(html).toContain("2 sur 30 question(s) · de la plus ancienne à la plus récente");
    expect(html).toContain("Charger plus (28)");
    expect(html.indexOf("Patiente1")).toBeLessThan(html.indexOf("Patiente2"));
  });

  it("montre la référence citée par l’email de notification et un statut lisible", () => {
    const html = render();
    expect(html).toContain("QMED-ADMIN001-00000");
    expect(html).toContain("Nouvelle");
    expect(html).toContain("Brouillon");
  });

  it("propose « Classer sans suite » pour une question sans réponse, pas après l’envoi", () => {
    state.selected = question(1, "submitted");
    const pending = render();
    expect(pending).toContain("Classer sans suite");
    expect(pending).toContain("Référence <span class=\"font-mono text-foreground\">QMED-ADMIN001-00000</span>");

    state.selected = question(3, "answered", { adminResponse: "Information générale relue par le médecin.", responseSentAt: new Date(Date.UTC(2026, 7, 4)) });
    expect(render()).not.toContain("Classer sans suite");
    state.selected = question(4, "rejected");
    expect(render()).not.toContain("Classer sans suite");
  });

  it("propose « Supprimer » pour toute question ouverte, répondue ou classée (RGPD-12)", () => {
    for (const selected of [question(1, "submitted"), question(3, "answered", { responseSentAt: new Date(Date.UTC(2026, 7, 4)) }), question(4, "rejected")]) {
      state.selected = selected;
      expect(render()).toMatch(/<button[^>]*>.*Supprimer<\/button>/);
    }
    state.selected = null;
    expect(render()).not.toContain("Supprimer");
  });

  it("supprime la question après confirmation, puis recharge la file", () => {
    state.selected = question(3, "answered", { responseSentAt: new Date(Date.UTC(2026, 7, 4)) });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    clickHandler("Supprimer")();
    expect(state.deleteMutate).not.toHaveBeenCalled();

    clickHandler("Supprimer")();
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining("QMED-ADMIN003-00000"));
    expect(state.deleteMutate).toHaveBeenCalledWith({ id: 3 });
    state.deleteOptions.onSuccess!(undefined as never);
    expect(state.invalidated).toContain("list");
    expect(state.toasts.at(-1)).toEqual(["success", "Question supprimée définitivement, avec sa version publique et son journal."]);
    state.deleteOptions.onError!(new Error("Question introuvable"));
    expect(state.toasts.at(-1)).toEqual(["error", "Question introuvable"]);
  });

  it("dit qu’un envoi interrompu trop ancien est enregistré sans nouvel email, et à quelle date (DATA-02)", () => {
    render();
    state.sendOptions.onSuccess!({ success: true, published: false, resent: false, unconfirmedSentAt: new Date(Date.UTC(2026, 9, 20, 8, 30)) } as never);
    expect(state.invalidated).toEqual(["get", "list"]);
    expect(state.toasts.at(-1)).toEqual(["warning", "Un envoi du 20/10/2026 10:30:00 s’est interrompu avant d’être enregistré : la personne a peut-être déjà reçu la réponse. Il est enregistré à cette date, sans nouvel email ; « Renvoyer la réponse » permet un nouvel envoi volontaire."]);
    state.sendOptions.onSuccess!({ success: true, published: false, resent: false, unconfirmedSentAt: null } as never);
    expect(state.toasts.at(-1)).toEqual(["success", "Réponse envoyée par email."]);
  });

  it("annonce une file vide sans bouton « Charger plus »", () => {
    state.page = { items: [], total: 0 };
    const html = render();
    expect(html).toContain("Aucune question à traiter.");
    expect(html).not.toContain("Charger plus");
  });
});

describe("ADM-01 — détail d’une question sur mobile", () => {
  const detail = () => ({ focus: vi.fn(), scrollIntoView: vi.fn() });
  const view = (desktop: boolean) => ({ matchMedia: vi.fn((query: string) => ({ matches: desktop && query === "(min-width: 64rem)" }) as MediaQueryList) });

  it("sous la mise en page en deux colonnes, place le focus sur le détail et le fait défiler jusqu’en haut de l’écran", () => {
    const narrow = detail();
    revealQuestionDetail(narrow, view(false));
    expect(narrow.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(narrow.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("ne bouge ni la page ni le focus sur un bureau, où le détail est à côté de la liste", () => {
    const wide = detail();
    revealQuestionDetail(wide, view(true));
    expect(wide.focus).not.toHaveBeenCalled();
    expect(wide.scrollIntoView).not.toHaveBeenCalled();
    expect(() => revealQuestionDetail(null, view(false))).not.toThrow();
  });

  it("rend le détail focalisable par programme, sans l’ajouter à l’ordre de tabulation", () => {
    expect(render()).toMatch(/<div tabindex="-1" role="region" aria-label="Question sélectionnée"/);
  });
});
