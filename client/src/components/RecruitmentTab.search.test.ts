import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// ADM-02 dans l’onglet Candidatures : le champ de recherche part au serveur
// après la pause de frappe, avec les autres filtres, depuis la première page.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

const view = vi.hoisted(() => ({
  requests: [] as Array<Record<string, unknown>>,
  page: { items: [] as Array<Record<string, unknown>>, total: 0 },
}));

const dossier = (id: number, lastName: string) => ({
  id, trackingId: `CV${id}`, firstName: "Dr", lastName, email: `${lastName}@test.local`, phone: null, specialty: "Anesthésie", targetCountries: "[]", languages: "[]",
  diplomaCountry: null, availability: null, mobility: null, certifications: null, yearsExperience: null, message: null, status: "new",
  aiScore: null, aiSummary: null, aiStrengths: null, aiWeaknesses: null, aiExtractedSkills: null, aiMatchReasoning: null, aiAnalyzedAt: null,
  analysisStatus: "queued", analysisAttempts: 1, analysisLastError: null, analysisModel: null, analysisPromptVersion: null, extractionWarnings: null,
  driveExport: null, emailDelivery: null, candidatePortalActive: false,
});

const mutation = () => ({ mutate: vi.fn(), isPending: false });
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("./Candidate360Dialog", () => ({ default: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ admin: { recruitment: { list: { invalidate: vi.fn() } } } }),
    useQueries: (build: (t: unknown) => unknown[]) => {
      view.requests = [];
      const t = { admin: { recruitment: { list: (input: Record<string, unknown>) => { view.requests.push(input); return input; } } } };
      return build(t).map(() => ({ data: view.page, isLoading: false, error: null, refetch: vi.fn() }));
    },
    admin: {
      recruitment: {
        profiles: { list: { useQuery: () => ({ data: [], refetch: vi.fn() }) }, create: { useMutation: mutation } },
        driveExport: {
          status: { useQuery: () => ({ data: { connected: true, lastError: null, failedExports: 0 }, refetch: vi.fn() }) },
          retry: { useMutation: mutation },
          retryAllFailed: { useMutation: mutation },
        },
        updateStatus: { useMutation: mutation },
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
const { default: AdminSearchField } = await import("./AdminSearchField");
const { default: AdminLoadMore } = await import("./AdminLoadMore");
const { ADMIN_SEARCH_DELAY_MS } = await import("./adminSearch");

const render = () => renderStateful(RecruitmentTab) as ReactElement;
const propsOf = (tree: ReactElement, type: unknown) => elementsOf(tree).find(element => element.type === type)!.props;
const sent = () => view.requests.map(({ search, offset }) => ({ search, offset }));

beforeEach(() => {
  vi.useFakeTimers();
  view.page = { items: [dossier(1, "Dupont"), dossier(2, "Martin")], total: 120 };
});
afterEach(() => {
  resetStatefulHooks();
  vi.useRealTimers();
});

describe("ADM-02 — recherche dans les candidatures", () => {
  it("envoie la recherche après la pause de frappe et repart de la première page", () => {
    let tree = render();
    (propsOf(tree, AdminLoadMore).onLoadMore as () => void)();
    tree = render();
    expect(sent()).toEqual([{ search: undefined, offset: 0 }, { search: undefined, offset: 50 }]);

    (propsOf(tree, AdminSearchField).onChange as (value: string) => void)("dupont jean");
    tree = render();
    // Still typing: the pages already loaded stay as they are.
    expect(sent()).toEqual([{ search: undefined, offset: 0 }, { search: undefined, offset: 50 }]);
    expect(propsOf(tree, AdminSearchField).value).toBe("dupont jean");

    vi.advanceTimersByTime(ADMIN_SEARCH_DELAY_MS);
    tree = render();
    expect(view.requests).toEqual([{ search: "dupont jean", limit: 50, offset: 0 }]);
    expect(renderToStaticMarkup(tree)).toContain("2 sur 120 candidature(s) pour « dupont jean »");
  });

  it("garde les autres filtres avec la recherche, et la croix revient à la liste complète", () => {
    let tree = render();
    const status = elementsOf(tree).find(element => element.type === "select" && element.props.value === "")!;
    (status.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "shortlisted" } });
    tree = render();
    (propsOf(tree, AdminSearchField).onChange as (value: string) => void)("CV1");
    render();
    vi.advanceTimersByTime(ADMIN_SEARCH_DELAY_MS);
    tree = render();
    expect(view.requests).toEqual([{ status: "shortlisted", search: "CV1", limit: 50, offset: 0 }]);

    view.page = { items: [], total: 0 };
    tree = render();
    expect(renderToStaticMarkup(tree)).toContain("Aucune candidature ne correspond à « CV1 » avec ces filtres.");

    (propsOf(tree, AdminSearchField).onClear as () => void)();
    tree = render();
    expect(view.requests).toEqual([{ status: "shortlisted", limit: 50, offset: 0 }]);
    expect(propsOf(tree, AdminSearchField).value).toBe("");
  });
});
