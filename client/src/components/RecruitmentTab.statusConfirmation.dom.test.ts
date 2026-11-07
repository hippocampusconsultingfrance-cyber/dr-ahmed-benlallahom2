// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-11 — Candidatures montées par React dans un DOM, avec un faux tRPC :
// passer un dossier à « Refusée » ou « Archivée » (qui le sort du vivier, des
// campagnes et des missions) demande une confirmation ; annulée, rien n’est
// enregistré et la liste déroulante revient au statut actuel. Les autres
// statuts changent sans question.

const view = vi.hoisted(() => ({ updates: [] as unknown[], toasts: [] as Array<[string, string]> }));

vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "warning", "error", "info"].map(tone => [tone, (message: string) => view.toasts.push([tone, message])])),
}));
vi.mock("./Candidate360Dialog", () => ({ default: () => null }));
vi.mock("./CertificationReview", () => ({ default: () => null }));
vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  const idle = () => ({ mutate: vi.fn(), isPending: false });
  const dossier = {
    id: 1, trackingId: "CV-2026-000001", firstName: "Dr", lastName: "Candidat1", email: "c1@test.local", phone: null, specialty: "Anesthésie", targetCountries: "[\"France\"]", languages: "[]",
    diplomaCountry: null, availability: null, mobility: null, certifications: null, yearsExperience: null, message: null, status: "shortlisted", adminNotes: null, language: "fr",
    aiScore: null, aiSummary: null, aiStrengths: null, aiWeaknesses: null, aiExtractedSkills: null, aiMatchReasoning: null, aiAnalyzedAt: null,
    analysisStatus: "queued", analysisAttempts: 1, analysisLastError: null, analysisModel: null, analysisPromptVersion: null, extractionWarnings: null,
    cvOriginalName: "cv.pdf", cvSizeBytes: 120_000, fileValidationStatus: "accepted", fileSecurityScanVersion: null, createdAt: "2026-10-01T08:00:00.000Z", retentionUntil: null,
    certificationFacts: [], driveExport: null, emailDelivery: null, candidatePortalActive: false, candidatePortalInvitation: null, candidatePortalActivation: null,
  };
  return {
    trpc: {
      useUtils: () => ({ admin: { recruitment: { list: { invalidate: vi.fn(), cancel: vi.fn(), getData: () => undefined, setData: vi.fn() } } } }),
      useQueries: (build: (t: unknown) => unknown[]) => {
        const t = { admin: { recruitment: { list: (input: unknown) => input } } };
        return build(t).map(() => ({ data: { items: [dossier], total: 1 }, isLoading: false, error: null, refetch: vi.fn() }));
      },
      admin: {
        recruitment: {
          profiles: { list: { useQuery: () => ({ data: [], refetch: vi.fn() }) }, create: { useMutation: idle }, delete: { useMutation: idle } },
        detail: { useQuery: () => ({ data: undefined, isLoading: true, isFetching: false, error: null, refetch: vi.fn() }) },
          driveExport: {
            status: { useQuery: () => ({ data: { connected: true, lastError: null, failedExports: 0 }, refetch: vi.fn() }) },
            retry: { useMutation: idle },
            retryAllFailed: { useMutation: idle },
          },
          updateStatus: { useMutation: (options: object) => useMutation({ mutationFn: async (input: unknown) => { view.updates.push(input); return { success: true }; }, ...options }) },
          getDownloadUrl: { useMutation: idle },
          reanalyze: { useMutation: idle },
          reanalyzeFailed: { useMutation: idle },
          confirmationEmail: { retry: { useMutation: idle } },
          sendTemplateEmail: { useMutation: idle },
          candidate: { sendPortalInvitation: { useMutation: idle } },
          erase: { useMutation: idle },
        },
      },
    },
  };
});

const { default: RecruitmentTab } = await import("./RecruitmentTab");

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(RecruitmentTab)));
}

const statusSelect = () => screen.getByRole("combobox", { name: "Statut de Dr Candidat1" }) as HTMLSelectElement;

beforeEach(() => {
  view.updates = [];
  view.toasts = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ADM-11 — passage d’une candidature à « Refusée » ou « Archivée »", () => {
  it.each([["rejected", "Refusée"], ["archived", "Archivée"]])("vers %s : annulé, rien n’est enregistré et la liste revient au statut actuel", (status, label) => {
    mount();
    expect(statusSelect().value).toBe("shortlisted");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.change(statusSelect(), { target: { value: status } });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toBe(`Passer la candidature de Dr Candidat1 (CV-2026-000001) à « ${label} » ? Elle sortira du vivier, des campagnes et des missions.`);
    expect(statusSelect().value).toBe("shortlisted");
    expect(view.updates).toEqual([]);
  });

  it("enregistre le refus une fois confirmé", async () => {
    mount();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.change(statusSelect(), { target: { value: "rejected" } });

    await waitFor(() => expect(view.toasts).toEqual([["success", "Candidature mise à jour"]]));
    expect(view.updates).toEqual([{ id: 1, status: "rejected" }]);
  });

  it("change les autres statuts sans demander de confirmation", async () => {
    mount();
    const confirm = vi.spyOn(window, "confirm");
    fireEvent.change(statusSelect(), { target: { value: "placed" } });

    await waitFor(() => expect(view.updates).toEqual([{ id: 1, status: "placed" }]));
    expect(confirm).not.toHaveBeenCalled();
  });
});
