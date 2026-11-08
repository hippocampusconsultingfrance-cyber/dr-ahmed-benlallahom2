// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// EN-15, A11Y-13 — Questions santé montées par React dans un DOM, avec un faux
// tRPC : la bibliothèque publique présente la version anonymisée dans la langue
// de la question (attribut lang, mention « In French »… sur une page d’une autre
// langue). Le formulaire de publication le dit à côté des deux champs, pour que
// le médecin la rédige dans cette langue.

type Question = { id: number; trackingId: string; firstName: string; lastName: string; email: string; phone: string; question: string; language: string; status: string; createdAt: string; publicationConsent: number; adminResponse: string | null; publicQuestion: string | null; publicResponse: string | null; responseSentAt: string | null; rejectionReason: string | null };
const view = vi.hoisted(() => ({ questions: [] as Question[] }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    trpc: {
      useUtils: () => ({ medicalQuestions: { admin: { get: { invalidate: vi.fn() }, list: { invalidate: vi.fn() } } } }),
      useQueries: (build: (t: unknown) => unknown[]) => {
        const t = { medicalQuestions: { admin: { list: (input: Record<string, unknown>) => input } } };
        return build(t).map(() => ({ data: { items: view.questions, total: view.questions.length }, isLoading: false, error: null, refetch: vi.fn() }));
      },
      medicalQuestions: {
        admin: {
          get: {
            useQuery: ({ id }: { id: number }, options: { enabled: boolean }) => ({
              data: options.enabled ? view.questions.find(question => question.id === id) : undefined, isLoading: false, error: null, refetch: vi.fn(),
            }),
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

const question = (id: number, lastName: string, language: string): Question => ({
  id, trackingId: `QMED-ABCD2345-EFGH${id}`, firstName: "Jeanne", lastName, email: `p${id}@example.test`, phone: "+33600000000", question: "Can I drink water before anaesthesia?", language,
  status: "submitted", createdAt: "2026-11-02T09:00:00.000Z", publicationConsent: 1, adminResponse: null, publicQuestion: null, publicResponse: null, responseSentAt: null, rejectionReason: null,
});
const detail = () => screen.getByRole("region", { name: "Question sélectionnée" });
const publicFields = () => [screen.getByLabelText("Question publique anonymisée"), screen.getByLabelText("Réponse publique anonymisée")];
const descriptionOf = (field: HTMLElement) => document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent;

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: query === "(min-width: 64rem)", media: query }) as MediaQueryList);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("langue de la version publique d’une question santé (EN-15, A11Y-13)", () => {
  it("dit, aux deux champs de la version anonymisée, la langue de la question où la bibliothèque la présente", async () => {
    view.questions = [question(7, "Patiente7", "en"), question(8, "Patiente8", "de")];
    render(createElement(MedicalQuestionsAdminTab));

    fireEvent.click(screen.getByRole("button", { name: /Patiente7/ }));
    await waitFor(() => expect(detail().textContent).toContain("Jeanne Patiente7"));
    for (const field of publicFields()) expect(descriptionOf(field)).toBe("Version publique présentée en anglais, la langue de la question : rédigez-la en anglais.");

    fireEvent.click(screen.getByRole("button", { name: /Patiente8/ }));
    await waitFor(() => expect(detail().textContent).toContain("Jeanne Patiente8"));
    for (const field of publicFields()) expect(descriptionOf(field)).toBe("Version publique présentée en allemand, la langue de la question : rédigez-la en allemand.");
  });

  it("annonce le français pour une question en français, et pour une langue inconnue, comme la bibliothèque", async () => {
    view.questions = [question(7, "Patiente7", "fr"), question(8, "Patiente8", "es")];
    render(createElement(MedicalQuestionsAdminTab));

    for (const name of [/Patiente7/, /Patiente8/]) {
      fireEvent.click(screen.getByRole("button", { name }));
      await waitFor(() => expect(screen.getByRole("button", { name }).getAttribute("aria-current")).toBe("true"));
      for (const field of publicFields()) expect(descriptionOf(field)).toBe("Version publique présentée en français, la langue de la question : rédigez-la en français.");
    }
  });
});
