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
          delete: { useMutation: mutation },
        },
      },
    },
  };
});

const { default: MedicalQuestionsAdminTab } = await import("./MedicalQuestionsAdminTab");

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

  it("propose « Supprimer » pour toute question ouverte, répondue ou classée (RGPD-12)", () => {
    for (const selected of [question(1, "submitted"), question(3, "answered", { responseSentAt: new Date(Date.UTC(2026, 7, 4)) }), question(4, "rejected")]) {
      state.selected = selected;
      expect(render()).toMatch(/<button[^>]*>.*Supprimer<\/button>/);
    }
    state.selected = null;
    expect(render()).not.toContain("Supprimer");
  });

  it("annonce une file vide sans bouton « Charger plus »", () => {
    state.page = { items: [], total: 0 };
    const html = render();
    expect(html).toContain("Aucune question à traiter.");
    expect(html).not.toContain("Charger plus");
  });
});
