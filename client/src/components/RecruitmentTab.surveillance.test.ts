import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MANUAL_REVIEW_FALLBACK_MODEL } from "@shared/recruitmentAiAnalysis";

// REC-08 et REC-09 dans l’onglet Candidatures : un dossier que l’IA n’a pas
// pu analyser (facturation) est étiqueté comme tel, et les copies Drive en
// échec se relancent d’un clic.

const view = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  driveStatus: { connected: true, lastError: null as string | null, failedExports: 0 },
}));

const dossier = (id: number, lastName: string, extra: Record<string, unknown>) => ({
  id, trackingId: `CV${id}`, firstName: "Dr", lastName, email: `${lastName}@test.local`, phone: null, specialty: "Anesthésie", targetCountries: "[]", languages: "[]",
  diplomaCountry: null, availability: null, mobility: null, certifications: null, yearsExperience: null, message: null, status: "new",
  aiScore: null, aiSummary: null, aiStrengths: null, aiWeaknesses: null, aiExtractedSkills: null, aiMatchReasoning: null, aiAnalyzedAt: null,
  analysisStatus: "queued", analysisAttempts: 1, analysisLastError: null, analysisModel: null, analysisPromptVersion: null, extractionWarnings: null,
  driveExport: null, emailDelivery: null, candidatePortalActive: false, ...extra,
});

const mutation = () => ({ mutate: vi.fn(), isPending: false });
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("./Candidate360Dialog", () => ({ default: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ admin: { recruitment: { list: { invalidate: vi.fn() } } } }),
    // The list loads its pages of 50 through useQueries (ADM-01): one page here.
    useQueries: (build: (t: unknown) => unknown[]) => {
      const t = { admin: { recruitment: { list: (input: unknown) => input } } };
      return build(t).map(() => ({ data: { items: view.items, total: view.items.length }, isLoading: false, error: null, refetch: vi.fn() }));
    },
    admin: {
      recruitment: {
        list: { useQuery: () => ({ data: { items: view.items, total: view.items.length }, isLoading: false, error: null, refetch: vi.fn() }) },
        profiles: { list: { useQuery: () => ({ data: [], refetch: vi.fn() }) }, create: { useMutation: mutation } },
        driveExport: {
          status: { useQuery: () => ({ data: view.driveStatus, refetch: vi.fn() }) },
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

function render() {
  return renderToStaticMarkup(createElement(RecruitmentTab));
}

/** Text of the score chip, right after the dossier's tracking reference. */
function scoreChipOf(html: string, trackingId: string) {
  const after = html.slice(html.indexOf(`· ${trackingId}<`));
  return /<span class="rounded-full border px-2\.5 py-1 text-xs font-medium [^"]*">([^<]+)<\/span>/.exec(after)?.[1];
}

describe("REC-08 — dossier sans analyse IA (facturation du fournisseur)", () => {
  it("étiquette « Analyse IA indisponible », y compris un dossier enregistré avant le statut dédié ; les autres étiquettes ne changent pas", () => {
    const fallback = { aiSummary: "Le texte du CV a été extrait avec succès. L’analyse IA complète est temporairement indisponible.", analysisModel: MANUAL_REVIEW_FALLBACK_MODEL, analysisPromptVersion: "recruitment-v7-verified-score" };
    view.items = [
      dossier(1, "Degraded", { ...fallback, analysisStatus: "degraded", analysisLastError: "ai_gateway_billing_unavailable" }),
      dossier(2, "Legacy", { ...fallback, analysisStatus: "needs_review" }),
      dossier(3, "Outdated", { aiSummary: "Ancienne synthèse", aiScore: 90, analysisStatus: "completed", analysisPromptVersion: "recruitment-v6" }),
      dossier(4, "Scored", { aiSummary: "Synthèse", aiScore: 82, analysisStatus: "completed", analysisModel: "openai/gpt-6-astra", analysisPromptVersion: "recruitment-v7-verified-score" }),
      dossier(5, "Pending", {}),
    ];
    const html = render();
    expect(scoreChipOf(html, "CV1")).toBe("Analyse IA indisponible");
    expect(scoreChipOf(html, "CV2")).toBe("Analyse IA indisponible");
    expect(scoreChipOf(html, "CV3")).toBe("Score à recalculer");
    expect(scoreChipOf(html, "CV4")).toBe("Score IA 82/100");
    expect(scoreChipOf(html, "CV5")).toBe("IA en attente");
    expect(html).toContain("Revue manuelle · IA à reprendre");
    expect(html).toContain("Mettre à jour / reprendre l’IA");
  });
});

describe("REC-09 — relance groupée des copies Google Drive", () => {
  it("propose « Relancer toutes les copies échouées » avec leur nombre, seulement s’il y en a", () => {
    view.items = [];
    view.driveStatus = { connected: true, lastError: null, failedExports: 3 };
    expect(render()).toContain("Relancer toutes les copies échouées (3)");
    view.driveStatus = { connected: true, lastError: null, failedExports: 0 };
    expect(render()).not.toContain("Relancer toutes les copies échouées");
  });

  it("garde l’appel à la reconnexion visible quand la connexion est à renouveler", () => {
    view.items = [];
    view.driveStatus = { connected: true, lastError: "google_drive_token_invalid_grant", failedExports: 2 };
    const html = render();
    expect(html).toContain("Reconnexion Google Drive requise");
    expect(html).toContain("Relancer toutes les copies échouées (2)");
  });
});
