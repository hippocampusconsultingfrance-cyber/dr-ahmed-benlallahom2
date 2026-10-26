import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ListInput = { statuses?: string[]; order: string; limit: number; offset: number };

const state = vi.hoisted(() => ({
  requests: [] as ListInput[],
  page: { items: [] as Array<Record<string, unknown>>, total: 0 },
  selected: null as null | Record<string, unknown>,
}));

const question = (id: number, status: string, extra: Record<string, unknown> = {}) => ({
  id, trackingId: `QMED-ADMIN00${id}-00000`, firstName: "Jeanne", lastName: `Patiente${id}`, email: `p${id}@test.local`, phone: "+33600000000",
  question: "Peut-on boire de l’eau avant une anesthésie ?", status, createdAt: new Date(Date.UTC(2026, 7, id)), publicationConsent: 0,
  adminResponse: null, publicQuestion: null, publicResponse: null, responseSentAt: null, ...extra,
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    trpc: {
      useUtils: () => ({ medicalQuestions: { admin: { get: { invalidate: vi.fn() }, list: { invalidate: vi.fn() } } } }),
      useQueries: (build: (t: unknown) => unknown[]) => {
        const t = { medicalQuestions: { admin: { list: (input: ListInput) => { state.requests.push(input); return input; } } } };
        return build(t).map(() => ({ data: state.page, isLoading: false, error: null }));
      },
      medicalQuestions: {
        admin: {
          get: { useQuery: () => ({ data: state.selected, isLoading: false, error: null, refetch: vi.fn() }) },
          saveDraft: { useMutation: mutation },
          improveDraft: { useMutation: mutation },
          sendValidatedResponse: { useMutation: mutation },
          updatePublication: { useMutation: mutation },
          unpublish: { useMutation: mutation },
          reject: { useMutation: mutation },
        },
      },
    },
  };
});

const { default: MedicalQuestionsAdminTab, revealQuestionDetail } = await import("./MedicalQuestionsAdminTab");

const render = () => renderToStaticMarkup(createElement(MedicalQuestionsAdminTab));

beforeEach(() => {
  state.requests = [];
  state.page = { items: [question(1, "submitted"), question(2, "drafting")], total: 30 };
  state.selected = null;
});

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
