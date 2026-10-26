import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vitest compiles JSX with the classic runtime: it has no React plugin.
Object.assign(globalThis, { React });

type ExportVariables = { type: "pool" | "shortlist"; briefId?: number };
type ExportResult = { filename: string; csv: string; count: number };
type ExportOptions = {
  onSuccess?: (result: ExportResult, variables: ExportVariables, context: unknown) => unknown;
  onError?: (error: Error, variables: ExportVariables, context: unknown) => unknown;
  onSettled?: (result: ExportResult | undefined, error: Error | null, variables: ExportVariables, context: unknown) => unknown;
};

const state = vi.hoisted(() => ({
  language: "fr",
  shortlistedCount: 0,
  // Candidates of the shortlist who agreed to be presented (RGPD-03); all of them unless a test says otherwise.
  consentedCount: null as number | null,
  exportPending: false,
  exportOptions: null as null | ExportOptions,
  invalidateCandidates: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  downloads: [] as unknown[],
}));

const brief = { id: 7, briefId: "BRIEF-REC01", organizationName: "Clinique", specialtyNeeded: "Anesthésie", country: "Suisse", targetEnvironment: "Hôpital", status: "reviewing" };
const idleMutation = { mutate: vi.fn(), isPending: false };

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: state.language }) }));
vi.mock("sonner", () => ({ toast: { error: state.toastError, success: state.toastSuccess } }));
vi.mock("./recruitmentCsvDownload", () => ({ downloadRecruitmentCsv: (result: unknown) => state.downloads.push(result) }));
vi.mock("./Candidate360Dialog", () => ({ default: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ admin: { clientBriefs: { list: { invalidate: vi.fn() }, candidates: { invalidate: state.invalidateCandidates } } } }),
    admin: {
      clientBriefs: {
        list: { useQuery: () => ({ data: [brief], isLoading: false, error: null }) },
        candidates: { useQuery: () => ({ data: { brief, candidates: [], shortlistedCount: state.shortlistedCount, consentedCount: state.consentedCount ?? state.shortlistedCount, ranking: { eligible: 0, ranked: 0 }, pagination: { page: 0, limit: 25, total: 0, totalPages: 0 } }, isLoading: false, isFetching: false }) },
        updateStatus: { useMutation: () => idleMutation },
        associateCandidate: { useMutation: () => idleMutation },
        setCandidateConsent: { useMutation: () => idleMutation },
      },
      recruitment: {
        exportCsv: { useMutation: (options: ExportOptions) => { state.exportOptions = options; return { mutate: vi.fn(), isPending: state.exportPending }; } },
        getDownloadUrl: { useMutation: () => idleMutation },
      },
    },
  },
}));

import EmployerBriefsTab from "./EmployerBriefsTab";

function exportButton() {
  const html = renderToStaticMarkup(React.createElement(EmployerBriefsTab));
  const button = [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/gs)].find(match => /shortlist|Shortlist|候选名单/.test(match[2]!) && match[2]!.includes("("));
  if (!button) throw new Error("shortlist export button not rendered");
  return { disabled: /\sdisabled=""/.test(button[1]!), label: button[2]!.replace(/<[^>]+>/g, ""), limitNotice: html.match(/<p id="shortlist-export-limit"[^>]*>(.*?)<\/p>/s)?.[1] ?? null };
}

// What react-query calls once the server answers the export mutation.
const variables: ExportVariables = { type: "shortlist", briefId: brief.id };
async function serverRefusesExport(message: string) {
  const error = new Error(message);
  await state.exportOptions!.onError?.(error, variables, undefined);
  await state.exportOptions!.onSettled?.(undefined, error, variables, undefined);
}
async function serverExports(result: ExportResult) {
  await state.exportOptions!.onSuccess?.(result, variables, undefined);
  await state.exportOptions!.onSettled?.(result, null, variables, undefined);
}

describe("export de la shortlist d’une mission (REC-01)", () => {
  beforeEach(() => {
    state.language = "fr";
    state.shortlistedCount = 0;
    state.consentedCount = null;
    state.exportPending = false;
    state.exportOptions = null;
    state.invalidateCandidates.mockClear();
    state.toastError.mockClear();
    state.toastSuccess.mockClear();
    state.downloads = [];
  });

  it("affiche le nombre de présélectionnés et grise le bouton à zéro", () => {
    expect(exportButton()).toMatchObject({ disabled: true, label: "Exporter la shortlist (0)" });
    state.shortlistedCount = 3;
    expect(exportButton()).toMatchObject({ disabled: false, label: "Exporter la shortlist (3)" });
  });

  it("compte les seuls candidats qui ont donné leur accord, ceux que le fichier contiendra (RGPD-03)", () => {
    state.shortlistedCount = 2;
    state.consentedCount = 1;
    expect(exportButton()).toMatchObject({ disabled: false, label: "Exporter la shortlist (1)" });
    state.consentedCount = 0;
    expect(exportButton()).toMatchObject({ disabled: true, label: "Exporter la shortlist (0)" });
  });

  it("garde le nombre dans chaque langue de l’administration", () => {
    state.shortlistedCount = 2;
    state.language = "en";
    expect(exportButton()).toMatchObject({ disabled: false, label: "Export shortlist (2)" });
    state.language = "de";
    expect(exportButton().label).toBe("Shortlist exportieren (2)");
    state.language = "zh";
    expect(exportButton().label).toBe("导出候选名单 (2)");
    state.shortlistedCount = 0;
    expect(exportButton().disabled).toBe(true);
  });

  it("reste grisé pendant un export en cours", () => {
    state.shortlistedCount = 3;
    state.exportPending = true;
    expect(exportButton().disabled).toBe(true);
  });

  it("rafraîchit le nombre de présélectionnés quand le serveur refuse l’export", async () => {
    state.shortlistedCount = 1;
    expect(exportButton()).toMatchObject({ disabled: false, label: "Exporter la shortlist (1)" });
    // The last shortlisted candidate was removed from another screen meanwhile.
    await serverRefusesExport("Aucun candidat présélectionné pour cette mission.");
    expect(state.toastError).toHaveBeenCalledWith("Aucun candidat présélectionné pour cette mission.");
    expect(state.downloads).toEqual([]);
    expect(state.invalidateCandidates).toHaveBeenCalledTimes(1);
    // The refreshed mission data then greys the button out.
    state.shortlistedCount = 0;
    expect(exportButton()).toMatchObject({ disabled: true, label: "Exporter la shortlist (0)" });
  });

  it("rafraîchit aussi le nombre après un export réussi", async () => {
    state.shortlistedCount = 3;
    exportButton();
    await serverExports({ filename: "shortlist-2026-10-25.csv", csv: "x", count: 2 });
    expect(state.downloads).toHaveLength(1);
    expect(state.toastSuccess).toHaveBeenCalledWith("2 profil(s) de shortlist exporté(s). L’export est journalisé.");
    expect(state.invalidateCandidates).toHaveBeenCalledTimes(1);
  });

  it("annonce la limite par export au lieu d’exporter une shortlist tronquée", () => {
    state.shortlistedCount = 200;
    expect(exportButton()).toEqual({ disabled: false, label: "Exporter la shortlist (200)", limitNotice: null });
    state.shortlistedCount = 206;
    expect(exportButton()).toEqual({ disabled: true, label: "Exporter la shortlist (206)", limitNotice: "200 candidats au maximum par export : retirez des candidats de la shortlist pour l’exporter." });
    state.language = "en";
    expect(exportButton()).toEqual({ disabled: true, label: "Export shortlist (206)", limitNotice: "200 candidates at most per export: remove candidates from the shortlist to export it." });
    state.language = "de";
    expect(exportButton().limitNotice).toBe("Höchstens 200 Kandidaten pro Export: Entfernen Sie Kandidaten von der Shortlist, um sie zu exportieren.");
    state.language = "zh";
    expect(exportButton().limitNotice).toBe("每次导出最多 200 名候选人：请先从候选名单中移除部分候选人再导出。");
  });
});
