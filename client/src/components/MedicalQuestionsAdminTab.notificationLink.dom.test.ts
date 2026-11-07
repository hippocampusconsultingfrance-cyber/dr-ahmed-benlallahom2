// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-09 — Questions santé montées par React dans un DOM, avec un faux tRPC :
// le lien « Consulter et répondre » de l’email d’une nouvelle question
// (/admin?tab=medicalQuestions&ref=QMED-…) ouvre cette question, cherchée dans
// toutes les files, son détail affiché et focalisé, sans clic de plus.

type Question = { id: number; trackingId: string; firstName: string; lastName: string; email: string; phone: string; question: string; status: string; createdAt: string; publicationConsent: number; adminResponse: string | null; publicQuestion: string | null; publicResponse: string | null; responseSentAt: string | null; rejectionReason: string | null };
const view = vi.hoisted(() => ({ requests: [] as Array<Record<string, unknown>>, questions: [] as Question[], reads: [] as number[] }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    trpc: {
      useUtils: () => ({ medicalQuestions: { admin: { get: { invalidate: vi.fn() }, list: { invalidate: vi.fn() } } } }),
      useQueries: (build: (t: unknown) => unknown[]) => {
        const t = { medicalQuestions: { admin: { list: (input: Record<string, unknown>) => { view.requests.push(input); return input; } } } };
        return build(t).map(() => ({ data: { items: view.questions, total: view.questions.length }, isLoading: false, error: null, refetch: vi.fn() }));
      },
      medicalQuestions: {
        admin: {
          get: {
            useQuery: ({ id }: { id: number }, options: { enabled: boolean }) => {
              if (!options.enabled) return { data: undefined, isLoading: false, error: null, refetch: vi.fn() };
              view.reads.push(id);
              return { data: view.questions.find(question => question.id === id), isLoading: false, error: null, refetch: vi.fn() };
            },
          },
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

const question = (id: number, trackingId: string, lastName: string, status = "submitted"): Question => ({
  id, trackingId, firstName: "Jeanne", lastName, email: `p${id}@example.test`, phone: "+33600000000", question: "Peut-on boire de l’eau avant une anesthésie ?",
  status, createdAt: "2026-11-02T09:00:00.000Z", publicationConsent: 0, adminResponse: null, publicQuestion: null, publicResponse: null, responseSentAt: null, rejectionReason: null,
});
const detail = () => screen.getByRole("region", { name: "Question sélectionnée" });
let desktop = true;

beforeEach(() => {
  view.requests = [];
  view.reads = [];
  desktop = true;
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: desktop && query === "(min-width: 64rem)", media: query }) as MediaQueryList);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ADM-09 — question ouverte depuis le lien d’une notification", () => {
  it("cherche la référence dans toutes les files, ouvre la question et place le focus sur son détail", async () => {
    view.questions = [question(7, "QMED-ABCD2345-EFGH6", "Patiente7", "answered")];
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);
    render(createElement(MedicalQuestionsAdminTab, { initialSearch: "QMED-ABCD2345-EFGH6" }));

    // « Toutes »: a question answered since its notification is still found.
    expect(view.requests[0]).toEqual({ order: "newest", search: "QMED-ABCD2345-EFGH6", limit: 50, offset: 0 });
    expect(screen.getByRole("button", { name: "Toutes" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(detail().textContent).toContain("Jeanne Patiente7"));
    expect(view.reads).toContain(7);
    expect(screen.queryByText("Sélectionnez une question pour consulter ses informations privées.")).toBeNull();
    expect(document.activeElement).toBe(detail());
    expect(screen.getByRole("button", { name: /Patiente7/ }).getAttribute("aria-current")).toBe("true");
    // Side by side on a desktop, the page does not move.
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("amène le détail à l’écran sous la liste sur un téléphone, et laisse choisir une autre question ensuite", async () => {
    desktop = false;
    view.questions = [question(7, "QMED-ABCD2345-EFGH6", "Patiente7"), question(8, "QMED-ABCD2345-EFGH7", "Patiente8")];
    const scrolled: Element[] = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) { scrolled.push(this); });
    render(createElement(MedicalQuestionsAdminTab, { initialSearch: "QMED-ABCD2345-EFGH6" }));

    await waitFor(() => expect(detail().textContent).toContain("Jeanne Patiente7"));
    expect(scrolled).toEqual([detail()]);
    expect(document.activeElement).toBe(detail());

    fireEvent.click(screen.getByRole("button", { name: /Patiente8/ }));
    await waitFor(() => expect(detail().textContent).toContain("Jeanne Patiente8"));
    expect(screen.getByRole("button", { name: /Patiente7/ }).getAttribute("aria-current")).toBeNull();
  });

  it("n’ouvre rien pour une référence qu’aucune question affichée n’a, et garde la file « À traiter » sans lien", async () => {
    view.questions = [question(7, "QMED-ABCD2345-EFGH6", "Patiente7")];
    render(createElement(MedicalQuestionsAdminTab, { initialSearch: "QMED-ZZZZ9999-ZZZZ9" }));
    expect(screen.getByText("Sélectionnez une question pour consulter ses informations privées.")).toBeTruthy();
    expect(view.reads).toEqual([]);
    cleanup();

    view.requests = [];
    render(createElement(MedicalQuestionsAdminTab));
    expect(view.requests[0]).toEqual({ statuses: ["submitted", "drafting"], order: "oldest", search: undefined, limit: 50, offset: 0 });
    expect(view.reads).toEqual([]);
  });
});
