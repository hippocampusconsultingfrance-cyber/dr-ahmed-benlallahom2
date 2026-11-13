import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ADM-13 — la fiche 360° note qu’un candidat a répondu : sa dernière réponse
// est datée et compte dans le taux de réponse du pilotage recrutement.

type MutationOptions = { onSuccess?: (result?: { closedFollowUps: number }) => unknown; onError?: (error: { message: string }) => unknown };

const state = vi.hoisted(() => ({
  markResponse: vi.fn(),
  markResponseOptions: null as null | MutationOptions,
  invalidated: [] as unknown[],
  toasts: [] as string[],
  errors: [] as string[],
  specialty: "Anesthésie",
}));

vi.mock("sonner", () => ({ toast: { success: (message: string) => state.toasts.push(message), error: (message: string) => state.errors.push(message), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      admin: {
        recruitment: {
          candidate: { detail: { invalidate: (input: unknown) => state.invalidated.push(["candidate.detail", input]) } },
          dashboard: { invalidate: () => state.invalidated.push("dashboard") },
          followUps: { list: { invalidate: () => state.invalidated.push("followUps.list") } },
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
                candidate: { id: 5, firstName: "Amal", lastName: "Haddad", specialty: state.specialty, trackingId: "CV5", status: "new", createdAt: new Date("2026-10-20T10:00:00Z"), lastCandidateResponseAt: null, adminNotes: null },
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
  state.specialty = "Anesthésie";
});

describe("ADM-07 — statut et dates de la fiche 360°", () => {
  it("écrit le statut de la candidature en mots et sa réception à l’heure de Paris", () => {
    const html = sheet().filter(element => element.type === "p" || element.type === "span").map(element => renderToStaticMarkup(element)).join("\n");
    expect(html).toContain("Statut : Nouvelle");
    expect(html).not.toContain("Statut : new");
    // 10:00 UTC on 20 October 2026: 12:00 in Paris.
    expect(html).toContain("20/10/2026 12:00 (heure de Paris)");
  });
});

describe("REC-11 — parcours de la candidature dans la fiche 360°", () => {
  const header = () => sheet().filter(element => element.type === "p").map(element => renderToStaticMarkup(element)).find(html => html.includes("CV5"))!;

  it("nomme le parcours VVIP & Offshore et donne la spécialité sans le préfixe qui le marque", () => {
    state.specialty = "[VVIP / Offshore] Médecin urgentiste (ATLS / ACLS)";
    expect(header()).toContain(">VVIP &amp; Offshore</span>Médecin urgentiste (ATLS / ACLS) · CV5");
    expect(header()).not.toContain("[VVIP / Offshore]");
  });

  it("ne donne aucun parcours à une candidature standard", () => {
    expect(header()).not.toContain("VVIP");
    expect(header()).toContain("Anesthésie · CV5");
  });
});

describe("ADM-13 — « Le candidat a répondu » dans la fiche 360°", () => {
  it("enregistre la réponse du candidat, puis relit la fiche et les indicateurs", async () => {
    (button("Le candidat a répondu")!.props.onClick as () => void)();
    expect(state.markResponse.mock.calls).toEqual([[{ id: 5 }]]);

    await state.markResponseOptions!.onSuccess!();
    expect(state.toasts).toEqual(["Réponse du candidat enregistrée"]);
    expect(state.invalidated).toEqual([["candidate.detail", { id: 5 }], "dashboard"]);
  });

  it("dit combien de relances en attente la réponse a closes, et relit alors « Relances à faire »", async () => {
    await state.markResponseOptions!.onSuccess!({ closedFollowUps: 2 });
    await state.markResponseOptions!.onSuccess!({ closedFollowUps: 1 });
    expect(state.toasts).toEqual(["Réponse du candidat enregistrée ; ses 2 relances en attente sont closes", "Réponse du candidat enregistrée ; sa relance en attente est close"]);
    expect(state.invalidated.filter(entry => entry === "followUps.list")).toHaveLength(2);
  });

  it("dit pourquoi le serveur a refusé", async () => {
    await state.markResponseOptions!.onError!({ message: "Base de données indisponible." });
    expect(state.errors).toEqual(["Base de données indisponible."]);
  });
});
