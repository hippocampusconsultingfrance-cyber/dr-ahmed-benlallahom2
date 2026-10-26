import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateAdminPageItem } from "./adminPagination";

// ADM-01 — un changement de statut dans Candidatures ne recharge pas toutes
// les pages déjà chargées : sans filtre de statut, rien ne bouge dans la liste
// et le dossier est mis à jour sur place.

type Page = { items: Array<Record<string, unknown> & { id: number }>; total: number };
type MutationOptions = { onSuccess?: (result: unknown, input: never) => unknown };

const state = vi.hoisted(() => ({
  updateStatusOptions: null as null | MutationOptions,
  invalidate: vi.fn(),
  setData: vi.fn(),
}));

const dossier = (id: number, extra: Record<string, unknown> = {}) => ({
  id, trackingId: `CV${id}`, firstName: "Dr", lastName: `Candidat${id}`, email: `c${id}@test.local`, phone: null, specialty: "Anesthésie", targetCountries: "[]", languages: "[]",
  diplomaCountry: null, availability: null, mobility: null, certifications: null, yearsExperience: null, message: null, status: "new", adminNotes: null,
  aiScore: null, aiSummary: null, aiStrengths: null, aiWeaknesses: null, aiExtractedSkills: null, aiMatchReasoning: null, aiAnalyzedAt: null,
  analysisStatus: "queued", analysisAttempts: 1, analysisLastError: null, analysisModel: null, analysisPromptVersion: null, extractionWarnings: null,
  driveExport: null, emailDelivery: null, candidatePortalActive: false, ...extra,
});

const mutation = () => ({ mutate: vi.fn(), isPending: false });
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("./Candidate360Dialog", () => ({ default: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ admin: { recruitment: { list: { invalidate: state.invalidate, setData: state.setData } } } }),
    useQueries: (build: (t: unknown) => unknown[]) => {
      const t = { admin: { recruitment: { list: (input: unknown) => input } } };
      return build(t).map(() => ({ data: { items: [dossier(1), dossier(2)], total: 2 }, isLoading: false, error: null, refetch: vi.fn() }));
    },
    admin: {
      recruitment: {
        profiles: { list: { useQuery: () => ({ data: [], refetch: vi.fn() }) }, create: { useMutation: mutation } },
        driveExport: {
          status: { useQuery: () => ({ data: { connected: true, lastError: null, failedExports: 0 }, refetch: vi.fn() }) },
          retry: { useMutation: mutation },
          retryAllFailed: { useMutation: mutation },
        },
        updateStatus: { useMutation: (options: MutationOptions) => { state.updateStatusOptions = options; return mutation(); } },
        getDownloadUrl: { useMutation: mutation },
        reanalyze: { useMutation: mutation },
        reanalyzeFailed: { useMutation: mutation },
        confirmationEmail: { retry: { useMutation: mutation } },
        sendTemplateEmail: { useMutation: mutation },
        candidate: { sendPortalInvitation: { useMutation: mutation } },
        erase: { useMutation: mutation },
      },
    },
  },
}));

const { default: RecruitmentTab } = await import("./RecruitmentTab");

beforeEach(() => {
  state.invalidate.mockClear();
  state.setData.mockClear();
  renderToStaticMarkup(createElement(RecruitmentTab));
});

describe("ADM-01 — changement de statut d’une candidature", () => {
  it("met à jour le dossier dans la page déjà chargée, sans recharger la liste", async () => {
    await state.updateStatusOptions!.onSuccess!({ success: true }, { id: 2, status: "shortlisted" } as never);

    expect(state.invalidate).not.toHaveBeenCalled();
    expect(state.setData).toHaveBeenCalledTimes(1);
    const [input, updater] = state.setData.mock.calls[0] as [Record<string, unknown>, (page: Page | undefined) => Page | undefined];
    expect(input).toMatchObject({ limit: 50, offset: 0, status: undefined });
    const updated = updater({ items: [dossier(1), dossier(2, { adminNotes: "Appeler lundi" })], total: 2 });
    expect(updated?.items.map(item => [item.id, item.status, item.adminNotes])).toEqual([[1, "new", null], [2, "shortlisted", "Appeler lundi"]]);
    expect(updated?.total).toBe(2);
  });

  it("garde ou efface la note du recruteur comme le serveur", async () => {
    await state.updateStatusOptions!.onSuccess!({ success: true }, { id: 1, status: "new", adminNotes: "" } as never);
    const [, updater] = state.setData.mock.calls[0] as [unknown, (page: Page | undefined) => Page | undefined];
    expect(updater({ items: [dossier(1, { adminNotes: "Ancienne note" })], total: 1 })?.items[0]?.adminNotes).toBeNull();
    expect(updater(undefined)).toBeUndefined();
  });
});

describe("ADM-01 — mise à jour d’une ligne dans une page chargée", () => {
  it("ne change que la ligne visée", () => {
    const page = { items: [{ id: 1, status: "new" }, { id: 2, status: "new" }], total: 2 };
    expect(updateAdminPageItem(page, 2, { status: "placed" })).toEqual({ items: [{ id: 1, status: "new" }, { id: 2, status: "placed" }], total: 2 });
    expect(page.items[1]?.status).toBe("new");
    expect(updateAdminPageItem(page, 3, { status: "placed" })?.items).toEqual(page.items);
  });
});
