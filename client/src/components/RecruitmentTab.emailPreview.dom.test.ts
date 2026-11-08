// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// MAIL-13 — le compositeur d’email candidat, monté par React avec un faux
// tRPC : l’aperçu exact (le HTML rendu par le serveur, dans un cadre sans
// script) n’est demandé qu’une fois ouvert, et « M’envoyer un test » part à
// l’administrateur sans envoyer l’email au candidat.

const view = vi.hoisted(() => ({
  previewed: [] as unknown[],
  tested: [] as unknown[],
  sent: [] as unknown[],
  toasts: [] as Array<[string, string]>,
}));

vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "warning", "error", "info"].map(tone => [tone, (message: string) => view.toasts.push([tone, message])])),
}));
vi.mock("./Candidate360Dialog", () => ({ default: () => null }));
vi.mock("./CertificationReview", () => ({ default: () => null }));
vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  const idle = () => ({ mutate: vi.fn(), isPending: false });
  const recorded = (calls: "tested" | "sent", result: unknown) => (options: object) => useMutation({ mutationFn: async (input: unknown) => { view[calls].push(input); return result; }, ...options });
  const dossier = {
    id: 1, trackingId: "CV-2026-000001", firstName: "Camille", lastName: "Candidat1", email: "c1@test.local", phone: null, specialty: "Anesthésie", targetCountries: "[\"France\"]", languages: "[]",
    diplomaCountry: null, availability: null, mobility: null, certifications: null, yearsExperience: null, message: null, status: "reviewing", adminNotes: null, language: "fr",
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
          updateStatus: { useMutation: idle },
          getDownloadUrl: { useMutation: idle },
          reanalyze: { useMutation: idle },
          reanalyzeFailed: { useMutation: idle },
          confirmationEmail: { retry: { useMutation: idle } },
          // The HTML the server renders with the real builder, for the input it is asked.
          previewTemplateEmail: { useQuery: (input: { template: string }, options: { enabled: boolean }) => {
            if (!options.enabled) return { data: undefined, error: null };
            view.previewed.push(input);
            return { data: { subject: input.template === "profile_interest" ? "Votre profil nous intéresse — CV-2026-000001" : "Complément d’information concernant votre candidature — CV-2026-000001", html: `<!DOCTYPE html><html lang="fr"><body><p>Bonjour Camille,</p><p>${input.template}</p></body></html>` }, error: null };
          } },
          sendTemplateTest: { useMutation: recorded("tested", { success: true, to: "admin@test.local" }) },
          sendTemplateEmail: { useMutation: recorded("sent", { success: true }) },
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

function openComposer(action: "Proposer un échange" | "Demander un complément") {
  mount();
  fireEvent.click(screen.getByRole("button", { name: /Camille Candidat1/ }));
  fireEvent.click(screen.getByRole("button", { name: action }));
  return screen.getByRole("dialog", { name: "Composer un email candidat" });
}

beforeEach(() => {
  view.previewed = [];
  view.tested = [];
  view.sent = [];
  view.toasts = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MAIL-13 — aperçu exact et test d’un email candidat", () => {
  it("n’affiche l’aperçu qu’à la demande, dans un cadre sans script, avec l’objet que le candidat recevra", () => {
    const dialog = openComposer("Proposer un échange");
    expect(within(dialog).queryByTitle("Aperçu de l’email au candidat")).toBeNull();
    expect(view.previewed).toEqual([]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Aperçu exact de l’email" }));
    const frame = within(dialog).getByTitle("Aperçu de l’email au candidat");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("<p>Bonjour Camille,</p>");
    expect(within(dialog).getByText("Objet :").parentElement!.textContent).toBe("Objet : Votre profil nous intéresse — CV-2026-000001");
    expect(view.previewed.at(-1)).toEqual({ id: 1, template: "profile_interest", language: "fr" });

    // The preview follows the template and the language chosen.
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Type de message" }), { target: { value: "additional_information" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Langue d’envoi" }), { target: { value: "en" } });
    expect(view.previewed.at(-1)).toEqual({ id: 1, template: "additional_information", language: "en" });
    expect(within(dialog).getByTitle("Aperçu de l’email au candidat").getAttribute("srcdoc")).toContain("additional_information");
  });

  it("envoie le test à l’administrateur avec les précisions tapées, sans envoyer l’email au candidat ni fermer le compositeur", async () => {
    const dialog = openComposer("Demander un complément");
    fireEvent.change(within(dialog).getByPlaceholderText(/attestation d’inscription/), { target: { value: "  Merci de joindre votre diplôme.  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "M’envoyer un test" }));
    await waitFor(() => expect(view.toasts).toEqual([["success", "Email de test envoyé à admin@test.local."]]));
    expect(view.tested).toEqual([{ id: 1, template: "additional_information", language: "fr", customRequest: "Merci de joindre votre diplôme." }]);
    expect(view.sent).toEqual([]);
    expect(screen.getByRole("dialog", { name: "Composer un email candidat" })).toBeTruthy();
  });
});
