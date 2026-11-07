// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-09 — Candidatures montées par React dans un DOM, avec un faux tRPC : le
// lien « Ouvrir la candidature » de la notification d’une nouvelle candidature
// (/admin?tab=recruitment&ref=CV…) ouvre sa carte, l’amène à l’écran et lui
// donne le focus, sans clic de plus.

const view = vi.hoisted(() => ({ requests: [] as Array<Record<string, unknown>>, dossiers: [] as Array<Record<string, unknown>> }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("./Candidate360Dialog", () => ({ default: () => null }));
vi.mock("./CertificationReview", () => ({ default: () => null }));
vi.mock("@/lib/trpc", () => {
  const idle = () => ({ mutate: vi.fn(), isPending: false });
  return {
    trpc: {
      useUtils: () => ({ admin: { recruitment: { list: { invalidate: vi.fn(), cancel: vi.fn(), getData: () => undefined, setData: vi.fn() } } } }),
      useQueries: (build: (t: unknown) => unknown[]) => {
        const t = { admin: { recruitment: { list: (input: Record<string, unknown>) => { view.requests.push(input); return input; } } } };
        return build(t).map(() => ({ data: { items: view.dossiers, total: view.dossiers.length }, isLoading: false, error: null, refetch: vi.fn() }));
      },
      admin: {
        recruitment: {
          profiles: { list: { useQuery: () => ({ data: [], refetch: vi.fn() }) }, create: { useMutation: idle }, delete: { useMutation: idle } },
          detail: { useQuery: () => ({ data: undefined, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }) },
          driveExport: {
            status: { useQuery: () => ({ data: { connected: true, lastError: null, failedExports: 0 }, refetch: vi.fn() }) },
            retry: { useMutation: idle },
            retryAllFailed: { useMutation: idle },
          },
          updateStatus: { useMutation: idle },
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

const dossier = (id: number, trackingId: string) => ({
  id, trackingId, firstName: "Dr", lastName: `Candidat${id}`, email: `c${id}@test.local`, phone: `+2165100000${id}`, specialty: "Anesthésie", targetCountries: "[\"Qatar\"]", languages: "[]",
  diplomaCountry: null, availability: null, mobility: null, certifications: null, yearsExperience: null, message: null, status: "new", adminNotes: null, language: "fr",
  aiScore: null, hasAiSummary: false, analysisStatus: "queued", analysisAttempts: 1, analysisLastError: null, analysisModel: null, analysisPromptVersion: null,
  cvOriginalName: "cv.pdf", cvSizeBytes: 120_000, fileValidationStatus: "accepted", fileSecurityScanVersion: null, createdAt: "2026-10-01T08:00:00.000Z", retentionUntil: null,
  certificationFacts: [], driveExport: null, emailDelivery: null, candidatePortalActive: false, candidatePortalInvitation: null, candidatePortalActivation: null,
});
const mount = (initialSearch?: string) => render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RecruitmentTab, initialSearch ? { initialSearch } : {})));
const card = (name: string) => screen.getByRole("heading", { name }).closest("article")!;
const toggle = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  view.requests = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ADM-09 — candidature ouverte depuis le lien d’une notification", () => {
  it("cherche la référence, déplie la carte qu’elle nomme, l’amène à l’écran et lui donne le focus", async () => {
    view.dossiers = [dossier(7, "CV00000000000007AB"), dossier(8, "CV00000000000008AB")];
    const scrolled: Element[] = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) { scrolled.push(this); });
    mount("CV00000000000007AB");

    expect(view.requests[0]).toMatchObject({ search: "CV00000000000007AB", offset: 0 });
    await waitFor(() => expect(toggle("Dr Candidat7").getAttribute("aria-expanded")).toBe("true"));
    expect(card("Dr Candidat7").textContent).toContain("+21651000007");
    expect(card("Dr Candidat7").getAttribute("aria-current")).toBe("true");
    expect(scrolled).toEqual([card("Dr Candidat7")]);
    expect(document.activeElement).toBe(card("Dr Candidat7"));
    expect(toggle("Dr Candidat8").getAttribute("aria-expanded")).toBe("false");
    expect(card("Dr Candidat8").getAttribute("aria-current")).toBeNull();

    // Closed by the admin, it stays closed.
    fireEvent.click(toggle("Dr Candidat7"));
    await waitFor(() => expect(toggle("Dr Candidat7").getAttribute("aria-expanded")).toBe("false"));
  });

  it("ne déplie ni ne déplace rien sans lien, ou pour une référence qu’aucune carte n’a", () => {
    view.dossiers = [dossier(7, "CV00000000000007AB")];
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);
    mount("CV99999999999999ZZ");
    expect(toggle("Dr Candidat7").getAttribute("aria-expanded")).toBe("false");
    cleanup();
    mount();
    expect(toggle("Dr Candidat7").getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[aria-current]")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
