import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-04, IA-02, RGPD-03 — écran d’une mission : filtres du classement,
// origine des certifications, accès à la fiche 360° et au CV, et accord du
// candidat noté avant l’export de la shortlist.

type MutationOptions = { onSuccess?: (result: unknown, variables: never) => unknown; onError?: (error: Error) => unknown };

// The component's useState/useMemo, kept between two renders like React does:
// a click updates the state, the next render() returns the new tree.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const slot = hooks.index++;
      if (!(slot in hooks.values)) hooks.values[slot] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.values[slot], (next: unknown) => { hooks.values[slot] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.values[slot]) : next; }];
    },
    useMemo: (factory: () => unknown) => factory(),
  };
});

const state = vi.hoisted(() => ({
  data: null as null | Record<string, unknown>,
  inputs: [] as Array<Record<string, unknown>>,
  consentOptions: null as null | MutationOptions,
  exportOptions: null as null | MutationOptions,
  consentMutate: vi.fn(),
  cvMutate: vi.fn(),
  invalidateCandidates: vi.fn(),
  toasts: [] as Array<[string, string]>,
}));

const idle = () => ({ mutate: vi.fn(), isPending: false });
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr" }) }));
vi.mock("sonner", () => ({ toast: Object.fromEntries(["success", "error"].map(kind => [kind, (message: string) => state.toasts.push([kind, message])])) }));
vi.mock("./recruitmentCsvDownload", () => ({ downloadRecruitmentCsv: vi.fn() }));
vi.mock("./Candidate360Dialog", () => ({ default: function Candidate360Dialog() { return null; } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ admin: { clientBriefs: { list: { invalidate: vi.fn() }, candidates: { invalidate: state.invalidateCandidates } } } }),
    admin: {
      clientBriefs: {
        list: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
        candidates: { useQuery: (input: Record<string, unknown>) => { state.inputs.push(input); return { data: state.data, isLoading: false, isFetching: false }; } },
        updateStatus: { useMutation: idle },
        associateCandidate: { useMutation: idle },
        setCandidateConsent: { useMutation: (options: MutationOptions) => { state.consentOptions = options; return { mutate: state.consentMutate, isPending: false }; } },
      },
      recruitment: {
        exportCsv: { useMutation: (options: MutationOptions) => { state.exportOptions = options; return idle(); } },
        getDownloadUrl: { useMutation: () => ({ mutate: state.cvMutate, isPending: false }) },
      },
    },
  },
}));

const { default: EmployerBriefsTab } = await import("./EmployerBriefsTab");

const brief = { id: 7, briefId: "BRIEF-GOLFE", organizationName: "Hôpital du Golfe", specialtyNeeded: "Anesthésie-réanimation", country: "Émirats arabes unis", targetEnvironment: "Hôpital", status: "reviewing" };
const breakdown = { specialty: 35, mobility: 15, certifications: 0, languages: 0, experience: 0, availability: 0 };
const candidate = (id: number, firstName: string, lastName: string, association: null | Record<string, unknown>, reasons: string[] = []) => ({
  id, firstName, lastName, specialty: "Anesthésie-réanimation", availability: null, association,
  match: { score: 50, reasons, breakdown, matchedCertifications: [], certificationsToConfirm: [], matchedLanguages: [], certifications: [], languages: [] },
});

function missionData(extra: Record<string, unknown> = {}) {
  return {
    brief,
    candidates: [
      candidate(11, "Amal", "Haddad", { status: "shortlisted", candidateConsentAt: null }, ["spécialité compatible", "certification à confirmer : Licence DHA (extraite du CV par l’IA) — aucun point tant que l’admin ne l’a pas confirmée"]),
      candidate(12, "Jean", "Martin", { status: "shortlisted", candidateConsentAt: new Date("2026-10-20T12:00:00.000Z") }),
      candidate(13, "Lina", "Saleh", null),
    ],
    shortlistedCount: 2,
    consentedCount: 1,
    ranking: { eligible: 2500, ranked: 2000 },
    pagination: { page: 0, limit: 25, total: 3, totalPages: 1 },
    ...extra,
  };
}

function render() {
  hooks.index = 0;
  return EmployerBriefsTab() as ReactElement;
}

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

/** The element with a handler whose markup or accessible name holds `label`. */
function control(tree: ReactNode, label: string, handler = "onClick") {
  const found = elements(tree).find(element => typeof element.props[handler] === "function" && (element.props["aria-label"] === label || renderToStaticMarkup(element).includes(label)));
  if (!found) throw new Error(`no « ${label} » control`);
  return found.props[handler] as (event?: unknown) => void;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-26T10:00:00.000Z"), toFake: ["Date"] });
  hooks.values = [];
  state.data = missionData();
  state.inputs = [];
  state.consentMutate.mockClear();
  state.cvMutate.mockClear();
  state.invalidateCandidates.mockClear();
  state.toasts = [];
});
afterEach(() => vi.useRealTimers());

describe("écran d’une mission employeur", () => {
  it("affiche l’accord du candidat dans la shortlist, le note à la date du jour modifiable et permet de le retirer (RGPD-03)", async () => {
    const html = renderToStaticMarkup(render());
    expect(html).toContain("Accord du candidat pour cette mission non noté : son profil ne sera pas exporté.");
    expect(html).toContain("Accord du candidat reçu le 20/10/2026 pour cette mission.");
    // Only shortlisted candidates carry the agreement.
    expect(html.match(/Accord du candidat (reçu le|pour cette mission non noté)/g)).toHaveLength(2);
    const dateInput = html.match(/<input[^>]*type="date"[^>]*>/)?.[0];
    expect(dateInput).toContain('value="2026-10-26"');
    expect(dateInput).toContain('max="2026-10-26"');

    // The agreement came by email two days ago: the admin changes the date, then records it.
    const dateField = elements(render()).find(element => element.type === "label" && renderToStaticMarkup(element).includes("Date de l’accord"))!;
    (elements(dateField).find(element => element.props.type === "date")!.props.onChange as (event: unknown) => void)({ target: { value: "2026-10-24" } });
    control(render(), "Accord du candidat reçu")();
    expect(state.consentMutate).toHaveBeenCalledWith({ briefId: 7, applicationId: 11, consentDate: "2026-10-24" });
    control(render(), "Retirer l’accord")();
    expect(state.consentMutate).toHaveBeenLastCalledWith({ briefId: 7, applicationId: 12, consentDate: null });

    await state.consentOptions!.onSuccess?.({ success: true }, { consentDate: "2026-10-24" } as never);
    await state.consentOptions!.onSuccess?.({ success: true }, { consentDate: null } as never);
    expect(state.toasts).toEqual([["success", "Accord du candidat noté"], ["success", "Accord du candidat retiré"]]);
    expect(state.invalidateCandidates).toHaveBeenCalledTimes(2);
  });

  it("ouvre la fiche 360° et le CV de chaque candidat depuis la mission (ADM-04)", () => {
    const dialogOf = () => elements(render()).find(element => typeof element.type === "function" && element.type.name === "Candidate360Dialog")!;
    expect(dialogOf().props.applicationId).toBeNull();
    control(render(), "Fiche 360° de Jean Martin")();
    expect(dialogOf().props.applicationId).toBe(12);
    (dialogOf().props.onOpenChange as (open: boolean) => void)(false);
    expect(dialogOf().props.applicationId).toBeNull();

    control(render(), "CV de Amal Haddad")();
    expect(state.cvMutate).toHaveBeenCalledWith({ id: 11 });
  });

  it("demande au serveur une compatibilité minimale et l’état de présélection, depuis la première page (ADM-04)", () => {
    const html = renderToStaticMarkup(render());
    expect(html).toContain("Classement calculé sur les 2000 dossiers ouverts les plus récents (sur 2500).");
    expect(state.inputs.at(-1)).toMatchObject({ briefId: 1, page: 0, minimumMatch: 0, shortlist: "all" });

    control(render(), "50 et plus", "onChange")({ target: { value: "50" } });
    render();
    expect(state.inputs.at(-1)).toMatchObject({ page: 0, minimumMatch: 50, shortlist: "all" });
    control(render(), "Déjà présélectionnés", "onChange")({ target: { value: "shortlisted" } });
    render();
    expect(state.inputs.at(-1)).toMatchObject({ page: 0, minimumMatch: 50, shortlist: "shortlisted" });

    state.data = missionData({ candidates: [], ranking: { eligible: 3, ranked: 3 } });
    const filtered = renderToStaticMarkup(render());
    expect(filtered).toContain("Aucun candidat ne correspond à ces filtres.");
    expect(filtered).not.toContain("Classement calculé sur");
  });

  it("montre pourquoi une certification ne compte pas encore (IA-02)", () => {
    expect(renderToStaticMarkup(render())).toContain("certification à confirmer : Licence DHA (extraite du CV par l’IA) — aucun point tant que l’admin ne l’a pas confirmée");
  });

  it("n’offre l’export qu’avec au moins un accord, et dit combien de candidats en sont exclus (RGPD-03)", async () => {
    const exportButton = (html: string) => [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/gs)].find(match => match[2]!.includes("Exporter la shortlist"))!;
    let html = renderToStaticMarkup(render());
    expect(html).toContain("1 sur 2 avec l’accord du candidat : seuls ceux-là sont exportés.");
    expect(exportButton(html)[1]).not.toMatch(/\sdisabled=""/);

    await state.exportOptions!.onSuccess?.({ filename: "shortlist.csv", csv: "x", count: 1, excludedWithoutConsent: 1 }, {} as never);
    expect(state.toasts).toContainEqual(["success", "1 profil(s) de shortlist exporté(s). L’export est journalisé. 1 candidat(s) exclu(s) faute d’accord."]);

    state.data = missionData({ consentedCount: 0 });
    html = renderToStaticMarkup(render());
    expect(exportButton(html)[1]).toMatch(/\sdisabled=""/);
    expect(html).toContain("Aucun accord de candidat noté : notez l’accord de chaque candidat présélectionné avant d’exporter.");
  });
});
