import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vitest compiles JSX with the classic runtime: it has no React plugin.
Object.assign(globalThis, { React });

const state = vi.hoisted(() => ({ language: "fr", shortlistedCount: 0, exportPending: false }));

const brief = { id: 7, briefId: "BRIEF-REC01", organizationName: "Clinique", specialtyNeeded: "Anesthésie", country: "Suisse", targetEnvironment: "Hôpital", status: "reviewing" };
const idleMutation = { mutate: vi.fn(), isPending: false };

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: state.language }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ admin: { clientBriefs: { list: { invalidate: vi.fn() }, candidates: { invalidate: vi.fn() } } } }),
    admin: {
      clientBriefs: {
        list: { useQuery: () => ({ data: [brief], isLoading: false, error: null }) },
        candidates: { useQuery: () => ({ data: { brief, candidates: [], shortlistedCount: state.shortlistedCount, pagination: { page: 0, limit: 25, total: 0, totalPages: 0 } }, isLoading: false, isFetching: false }) },
        updateStatus: { useMutation: () => idleMutation },
        associateCandidate: { useMutation: () => idleMutation },
      },
      recruitment: { exportCsv: { useMutation: () => ({ mutate: vi.fn(), isPending: state.exportPending }) } },
    },
  },
}));

import EmployerBriefsTab from "./EmployerBriefsTab";

function exportButton() {
  const html = renderToStaticMarkup(React.createElement(EmployerBriefsTab));
  const button = [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/gs)].find(match => /shortlist|Shortlist|候选名单/.test(match[2]!) && match[2]!.includes("("));
  if (!button) throw new Error("shortlist export button not rendered");
  return { disabled: /\sdisabled=""/.test(button[1]!), label: button[2]!.replace(/<[^>]+>/g, "") };
}

describe("export de la shortlist d’une mission (REC-01)", () => {
  beforeEach(() => {
    state.language = "fr";
    state.shortlistedCount = 0;
    state.exportPending = false;
  });

  it("affiche le nombre de présélectionnés et grise le bouton à zéro", () => {
    expect(exportButton()).toEqual({ disabled: true, label: "Exporter la shortlist (0)" });
    state.shortlistedCount = 3;
    expect(exportButton()).toEqual({ disabled: false, label: "Exporter la shortlist (3)" });
  });

  it("garde le nombre dans chaque langue de l’administration", () => {
    state.shortlistedCount = 2;
    state.language = "en";
    expect(exportButton()).toEqual({ disabled: false, label: "Export shortlist (2)" });
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
});
