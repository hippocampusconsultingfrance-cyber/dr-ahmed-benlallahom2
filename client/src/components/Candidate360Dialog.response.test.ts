import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ADM-13 — la fiche 360° note qu’un candidat a répondu : sa dernière réponse
// est datée et compte dans le taux de réponse du pilotage recrutement.

type MutationOptions = { onSuccess?: () => unknown; onError?: (error: { message: string }) => unknown };

const state = vi.hoisted(() => ({
  markResponse: vi.fn(),
  markResponseOptions: null as null | MutationOptions,
  invalidated: [] as unknown[],
  toasts: [] as string[],
  errors: [] as string[],
}));

vi.mock("sonner", () => ({ toast: { success: (message: string) => state.toasts.push(message), error: (message: string) => state.errors.push(message), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      admin: {
        recruitment: {
          candidate: { detail: { invalidate: (input: unknown) => state.invalidated.push(["candidate.detail", input]) } },
          dashboard: { invalidate: () => state.invalidated.push("dashboard") },
        },
      },
    }),
    admin: {
      recruitment: {
        followUps: { update: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } },
        candidate: {
          detail: {
            useQuery: () => ({
              data: {
                candidate: { id: 5, firstName: "Amal", lastName: "Haddad", specialty: "Anesthésie", trackingId: "CV5", status: "new", createdAt: new Date("2026-10-20T10:00:00Z"), lastCandidateResponseAt: null, adminNotes: null },
                audits: [], campaignRecipients: [], followUps: [], certifications: [],
              },
              isLoading: false,
            }),
          },
          markResponse: { useMutation: (options: MutationOptions) => { state.markResponseOptions = options; return { mutate: state.markResponse, isPending: false }; } },
          confirmCertification: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        },
      },
    },
  },
}));

const { default: Candidate360Dialog } = await import("./Candidate360Dialog");

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
const sheet = () => elements(Candidate360Dialog({ applicationId: 5, onOpenChange: vi.fn() }));
const button = (label: string) => sheet().find(element => typeof element.props.onClick === "function" && renderToStaticMarkup(element).includes(label));

beforeEach(() => {
  state.markResponse.mockClear();
  state.invalidated = [];
  state.toasts = [];
  state.errors = [];
});

describe("ADM-13 — « Le candidat a répondu » dans la fiche 360°", () => {
  it("enregistre la réponse du candidat, puis relit la fiche et les indicateurs", async () => {
    (button("Le candidat a répondu")!.props.onClick as () => void)();
    expect(state.markResponse.mock.calls).toEqual([[{ id: 5 }]]);

    await state.markResponseOptions!.onSuccess!();
    expect(state.toasts).toEqual(["Réponse du candidat enregistrée"]);
    expect(state.invalidated).toEqual([["candidate.detail", { id: 5 }], "dashboard"]);
  });

  it("dit pourquoi le serveur a refusé", async () => {
    await state.markResponseOptions!.onError!({ message: "Base de données indisponible." });
    expect(state.errors).toEqual(["Base de données indisponible."]);
  });
});
