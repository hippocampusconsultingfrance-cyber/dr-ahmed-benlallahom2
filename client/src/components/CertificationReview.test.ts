import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// IA-02 — chaque certification dit d’où elle vient (déclarée, extraite du CV
// par l’IA, confirmée par l’admin) dans la fiche 360°, la fiche du dossier et
// le filtre « certification », avec « Confirmer » / « Annuler la confirmation ».

type MutationOptions = { onSuccess?: (result: unknown, variables: { id: number; name: string; confirmed: boolean }) => unknown };

// useState kept between two renders like React does (see EmployerBriefsTab.missionShortlist.test.ts).
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
    // The tab is called as a plain function: its effects (the search box's
    // typing delay, ADM-02) do not run, as in a static render.
    useEffect: () => undefined,
  };
});

const state = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  detail: null as null | Record<string, unknown>,
  confirmOptions: null as null | MutationOptions,
  confirmMutate: vi.fn(),
  invalidated: [] as unknown[],
  toasts: [] as string[],
}));

const idle = () => ({ mutate: vi.fn(), isPending: false });
vi.mock("sonner", () => ({ toast: { success: (message: string) => state.toasts.push(message), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      admin: {
        recruitment: { list: { invalidate: () => state.invalidated.push("recruitment.list") }, candidate: { detail: { invalidate: (input: unknown) => state.invalidated.push(["candidate.detail", input]) } } },
        clientBriefs: { candidates: { invalidate: () => state.invalidated.push("clientBriefs.candidates") } },
      },
    }),
    useQueries: (build: (t: unknown) => unknown[]) => build({ admin: { recruitment: { list: (input: unknown) => input } } }).map(() => ({ data: { items: state.items, total: state.items.length }, isLoading: false, error: null, refetch: vi.fn() })),
    admin: {
      recruitment: {
        profiles: { list: { useQuery: () => ({ data: [], refetch: vi.fn() }) }, create: { useMutation: idle } },
        driveExport: { status: { useQuery: () => ({ data: { connected: true, lastError: null, failedExports: 0 }, refetch: vi.fn() }) }, retry: { useMutation: idle }, retryAllFailed: { useMutation: idle } },
        updateStatus: { useMutation: idle },
        getDownloadUrl: { useMutation: idle },
        reanalyze: { useMutation: idle },
        reanalyzeFailed: { useMutation: idle },
        confirmationEmail: { retry: { useMutation: idle } },
        sendTemplateEmail: { useMutation: idle },
        erase: { useMutation: idle },
        followUps: { update: { useMutation: idle } },
        candidate: {
          sendPortalInvitation: { useMutation: idle },
          detail: { useQuery: () => ({ data: state.detail, isLoading: false }) },
          confirmCertification: { useMutation: (options: MutationOptions) => { state.confirmOptions = options; return { mutate: state.confirmMutate, isPending: false }; } },
        },
      },
    },
  },
}));

const { default: CertificationReview } = await import("./CertificationReview");
const { default: Candidate360Dialog } = await import("./Candidate360Dialog");
const { default: RecruitmentTab } = await import("./RecruitmentTab");

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
const clickable = (tree: ReactNode, label: string) => {
  const found = elements(tree).find(element => typeof element.props.onClick === "function" && (element.props["aria-label"] === label || renderToStaticMarkup(element).includes(label)));
  if (!found) throw new Error(`no « ${label} » button`);
  return found.props.onClick as () => void;
};

const facts = [
  { name: "Licence DHA", origins: ["extracted"], expiresAt: "2028-05" },
  { name: "BLS", origins: ["declared", "confirmed"], expiresAt: null },
];

const dossier = (extra: Record<string, unknown> = {}) => ({
  id: 5, trackingId: "CV5", firstName: "Amal", lastName: "Haddad", email: "amal@test.local", phone: null, specialty: "Anesthésie", targetCountries: "[]", languages: "[]",
  diplomaCountry: null, availability: null, mobility: null, certifications: "BLS", yearsExperience: null, message: null, status: "new",
  aiScore: null, aiSummary: null, aiStrengths: null, aiWeaknesses: null, aiExtractedSkills: null, aiMatchReasoning: null, aiAnalyzedAt: null,
  analysisStatus: "queued", analysisAttempts: 1, analysisLastError: null, analysisModel: null, analysisPromptVersion: null, extractionWarnings: null,
  driveExport: null, emailDelivery: null, candidatePortalActive: false, createdAt: new Date("2026-10-20T10:00:00Z"), certificationFacts: facts, ...extra,
});

function renderTab() {
  hooks.index = 0;
  return RecruitmentTab() as ReactElement;
}

beforeEach(() => {
  hooks.values = [];
  state.items = [dossier()];
  state.detail = null;
  state.confirmMutate.mockClear();
  state.invalidated = [];
  state.toasts = [];
});

describe("confirmation des certifications par l’admin (IA-02)", () => {
  it("affiche l’origine de chaque certification et propose de la confirmer, ou d’annuler la confirmation", async () => {
    const tree = CertificationReview({ applicationId: 5, certifications: facts as never });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Licence DHA");
    expect(html).toContain("expire le 2028-05");
    expect(html).toContain("extraite du CV par l’IA");
    expect(html).toContain("déclarée par le candidat");
    expect(html).toContain("confirmée par l’admin");
    expect(html).toContain("ne compte dans le matching des missions qu’une fois confirmée par l’admin");

    clickable(tree, "Confirmer Licence DHA")();
    expect(state.confirmMutate).toHaveBeenCalledWith({ id: 5, name: "Licence DHA", confirmed: true });
    clickable(tree, "Annuler la confirmation de BLS")();
    expect(state.confirmMutate).toHaveBeenLastCalledWith({ id: 5, name: "BLS", confirmed: false });

    await state.confirmOptions!.onSuccess?.({ success: true }, { id: 5, name: "Licence DHA", confirmed: true });
    expect(state.toasts).toEqual(["Certification confirmée : Licence DHA"]);
    expect(state.invalidated).toEqual(["recruitment.list", ["candidate.detail", { id: 5 }], "clientBriefs.candidates"]);

    expect(renderToStaticMarkup(CertificationReview({ applicationId: 5, certifications: [] }))).toContain("Aucune certification déclarée ni lue dans le CV.");
  });

  it("place les certifications et leurs boutons dans la fiche 360°", () => {
    state.detail = { candidate: { id: 5, firstName: "Amal", lastName: "Haddad", specialty: "Anesthésie", trackingId: "CV5", status: "new", createdAt: new Date("2026-10-20T10:00:00Z"), lastCandidateResponseAt: null, adminNotes: null }, audits: [], campaignRecipients: [], followUps: [], certifications: facts };
    hooks.index = 0;
    const review = elements(Candidate360Dialog({ applicationId: 5, onOpenChange: vi.fn() })).find(element => element.type === CertificationReview);
    expect(review?.props).toEqual({ applicationId: 5, certifications: facts });
  });

  it("le filtre « certification » dit d’où vient chaque certification trouvée, et la fiche du dossier permet de la confirmer", () => {
    expect(renderToStaticMarkup(renderTab())).not.toContain("Certification recherchée");
    const certificationInput = elements(renderTab()).find(element => element.type === "input" && element.props.placeholder === "Ex. ACLS, ATLS")!;
    (certificationInput.props.onChange as (event: unknown) => void)({ target: { value: "dha" } });
    expect(renderToStaticMarkup(renderTab())).toContain("Certification recherchée : Licence DHA (extraite du CV par l’IA)");

    clickable(renderTab(), "Amal Haddad")();
    const review = elements(renderTab()).find(element => element.type === CertificationReview);
    expect(review?.props).toEqual({ applicationId: 5, certifications: facts });
  });
});
