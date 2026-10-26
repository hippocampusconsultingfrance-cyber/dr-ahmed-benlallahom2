import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// IA-02 — chaque certification dit d’où elle vient (déclarée, extraite du CV
// par l’IA, confirmée par l’admin) dans la fiche 360°, la fiche du dossier et
// le filtre « certification », avec « Confirmer » / « Annuler la confirmation ».

type MutationOptions = {
  onSuccess?: (result: unknown, variables: { id: number; name: string; confirmed: boolean; renewal?: { expiresAt: string | null } }) => unknown;
  onError?: (error: { message: string; data?: { code: string; reason?: string; date?: string } }) => unknown;
};

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
  language: "fr" as "fr" | "en" | "de" | "zh",
  items: [] as Array<Record<string, unknown>>,
  detail: null as null | Record<string, unknown>,
  confirmOptions: null as null | MutationOptions,
  confirmMutate: vi.fn(),
  invalidated: [] as unknown[],
  toasts: [] as string[],
  errors: [] as string[],
}));

const idle = () => ({ mutate: vi.fn(), isPending: false });
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: state.language }) }));
vi.mock("sonner", () => ({ toast: { success: (message: string) => state.toasts.push(message), error: (message: string) => state.errors.push(message), warning: vi.fn(), info: vi.fn() } }));
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
  // Whether a certification has expired depends on the day.
  vi.useFakeTimers({ now: new Date("2026-10-26T10:00:00.000Z"), toFake: ["Date"] });
  hooks.values = [];
  state.language = "fr";
  state.items = [dossier()];
  state.detail = null;
  state.confirmMutate.mockClear();
  state.invalidated = [];
  state.toasts = [];
  state.errors = [];
});
afterEach(() => vi.useRealTimers());

describe("confirmation des certifications par l’admin (IA-02)", () => {
  it("affiche l’origine de chaque certification et propose de la confirmer, ou d’annuler la confirmation", async () => {
    const tree = CertificationReview({ applicationId: 5, certifications: facts as never });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Licence DHA");
    // A month alone, written as the export and the mission write it.
    expect(html).toContain("Licence DHA<span class=\"font-normal text-muted-foreground\"> · expire en mai 2028</span>");
    expect(html).toContain("extraite du CV par l’IA");
    expect(html).toContain("déclarée par le candidat");
    expect(html).toContain("confirmée par l’admin");
    expect(html).toContain("ne compte dans le matching des missions qu’une fois confirmée par l’admin");

    clickable(tree, "Confirmer Licence DHA")();
    expect(state.confirmMutate).toHaveBeenCalledWith({ id: 5, name: "Licence DHA", confirmed: true });
    clickable(tree, "Annuler la confirmation de BLS")();
    expect(state.confirmMutate).toHaveBeenLastCalledWith({ id: 5, name: "BLS", confirmed: false });

    await state.confirmOptions!.onSuccess?.({ success: true, changed: true }, { id: 5, name: "Licence DHA", confirmed: true });
    await state.confirmOptions!.onSuccess?.({ success: true, changed: true }, { id: 5, name: "BLS", confirmed: false });
    // Withdrawn, a licence the latest analysis of the CV no longer retains loses its reading by the AI.
    await state.confirmOptions!.onSuccess?.({ success: true, changed: true, notRetainedByAnalysis: true }, { id: 5, name: "Licence DHA", confirmed: false });
    expect(state.toasts).toEqual([
      "Certification confirmée : Licence DHA",
      "Confirmation retirée : BLS",
      "Confirmation retirée : Licence DHA. La dernière analyse du CV ne la retient pas : elle n’est plus comptée comme extraite du CV.",
    ]);
    expect(state.invalidated.slice(0, 3)).toEqual(["recruitment.list", ["candidate.detail", { id: 5 }], "clientBriefs.candidates"]);

    expect(renderToStaticMarkup(CertificationReview({ applicationId: 5, certifications: [] }))).toContain("Aucune certification déclarée ni lue dans le CV.");
  });

  it("dit qu’une certification a expiré et propose de confirmer son renouvellement, avec sa nouvelle date d’expiration ou, si on le coche, sans", async () => {
    const certifications = [
      { name: "ACLS", origins: ["declared", "extracted", "confirmed"], expiresAt: "2023-05" },
      { name: "Licence DHA", origins: ["extracted"], expiresAt: "2028-05" },
    ];
    const renderReview = () => { hooks.index = 0; return CertificationReview({ applicationId: 5, certifications: certifications as never }); };
    const html = renderToStaticMarkup(renderReview());
    expect(html).toContain("ACLS<span class=\"font-normal text-red-600 dark:text-red-400\"> · expirée en mai 2023</span>");
    expect(html).toContain(" · expire en mai 2028</span>");
    expect(html).toContain("Expirée, elle ne compte pas dans le matching.");
    // Only the expired one offers a renewal, dated today at the earliest and 15 years ahead at most.
    expect(html).toContain('aria-label="Confirmer le renouvellement de ACLS"');
    expect(html).not.toContain("Confirmer le renouvellement de Licence DHA");
    expect(html.match(/<input[^>]*type="date"[^>]*>/g)).toEqual([expect.stringMatching(/min="2026-10-26" max="2041-10-26"/)]);

    const labelled = (label: string) => elements(renderReview()).find(element => element.props["aria-label"] === label)!;
    const renewButton = () => labelled("Confirmer le renouvellement de ACLS");
    const typeDate = (value: string, badInput = false) => (labelled("Nouvelle date d’expiration — ACLS").props.onChange as (event: unknown) => void)({ target: { value, validity: { badInput } } });
    const renew = () => (renewButton().props.onClick as () => void)();

    // Neither a date nor « Sans date d’expiration »: nothing to confirm yet.
    expect(renewButton().props.disabled).toBe(true);
    renew();
    expect(state.confirmMutate).not.toHaveBeenCalled();
    // The new date the admin read on the certificate.
    typeDate("2028-06-30");
    expect(renewButton().props.disabled).toBe(false);
    renew();
    expect(state.confirmMutate).toHaveBeenLastCalledWith({ id: 5, name: "ACLS", confirmed: true, renewal: { expiresAt: "2028-06-30" } });
    // A date partly erased (the field then reads ""): never a renewal without an expiry.
    typeDate("", true);
    expect(renewButton().props.disabled).toBe(true);
    renew();
    expect(state.confirmMutate).toHaveBeenCalledTimes(1);
    // A certificate without an expiry date, said so explicitly.
    (labelled("Le justificatif de ACLS ne porte pas de date d’expiration").props.onChange as (event: unknown) => void)({ target: { checked: true } });
    expect(labelled("Nouvelle date d’expiration — ACLS").props.disabled).toBe(true);
    expect(renewButton().props.disabled).toBe(false);
    renew();
    expect(state.confirmMutate).toHaveBeenLastCalledWith({ id: 5, name: "ACLS", confirmed: true, renewal: { expiresAt: null } });

    // The toast says which expiry the certification now has.
    await state.confirmOptions!.onSuccess?.({ success: true, changed: true }, { id: 5, name: "ACLS", confirmed: true, renewal: { expiresAt: "2028-06-30" } });
    await state.confirmOptions!.onSuccess?.({ success: true, changed: true }, { id: 5, name: "ACLS", confirmed: true, renewal: { expiresAt: null } });
    expect(state.toasts).toEqual(["Renouvellement confirmé : ACLS, expire le 30/06/2028", "Renouvellement confirmé : ACLS, sans date d’expiration"]);
    expect(state.invalidated).toContain("clientBriefs.candidates");
  });

  it("n’offre que le renouvellement d’une certification expirée non confirmée, et dit pourquoi le serveur refuse une confirmation", async () => {
    // Declared, and read in the CV with its expired date: no plain « Confirmer », which would count it without a renewal.
    const certifications = [{ name: "ACLS", origins: ["declared", "extracted"], expiresAt: "2023-05" }];
    const tree = CertificationReview({ applicationId: 5, certifications: certifications as never });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("ACLS<span class=\"font-normal text-red-600 dark:text-red-400\"> · expirée en mai 2023</span>");
    expect(elements(tree).filter(element => element.props["aria-label"] === "Confirmer ACLS")).toEqual([]);
    expect(html).toContain('aria-label="Confirmer le renouvellement de ACLS"');

    // The server's stable reasons, the latest renewal date accepted with its day.
    const refuse = (reason: string | undefined, date?: string, message = "Message du serveur.") => state.confirmOptions!.onError?.({ message, data: { code: "BAD_REQUEST", reason, ...(date ? { date } : {}) } });
    await refuse("renewal_required");
    await refuse("renewal_date_too_far", "2041-10-26");
    await refuse("renewal_date_past");
    await refuse("renewal_date_invalid");
    // Without its day, or for any other error, the server's message.
    await refuse("renewal_date_too_far", undefined, "La nouvelle date d’expiration est à plus de 15 ans : vérifiez-la sur le justificatif (le 26/10/2041 au plus tard).");
    await refuse(undefined, undefined, "Cette certification ne figure pas dans le dossier.");
    expect(state.errors).toEqual([
      "Cette certification a expiré : confirmez son renouvellement, avec la nouvelle date d’expiration lue sur le justificatif, ou cochez qu’il n’en porte pas.",
      "La nouvelle date d’expiration est à plus de 15 ans : vérifiez-la sur le justificatif (le 26/10/2041 au plus tard).",
      "La nouvelle date d’expiration est déjà passée : la certification resterait expirée.",
      "Nouvelle date d’expiration invalide.",
      "La nouvelle date d’expiration est à plus de 15 ans : vérifiez-la sur le justificatif (le 26/10/2041 au plus tard).",
      "Cette certification ne figure pas dans le dossier.",
    ]);
  });

  it.each([
    ["en", {
      expired: " · expired in May 2023</span>", current: " · expires in May 2028</span>",
      texts: ["declared by the candidate", "read from the CV by the AI", "confirmed by the admin", "only counts in the missions’ matching once confirmed by the admin", "Expired, it does not count in the matching.", "New expiry date", "No expiry date", ">Confirm renewal</button>", ">Confirm</button>", ">Withdraw confirmation</button>"],
      labels: ["Confirm the renewal of ACLS", "New expiry date — ACLS", "The certificate of ACLS has no expiry date", "Confirm Licence DHA", "Withdraw the confirmation of BLS"],
      toasts: ["Certification confirmed: Licence DHA", "Confirmation withdrawn: BLS", "Confirmation withdrawn: Licence DHA. The latest analysis of the CV does not retain it: it no longer counts as read from the CV.", "Renewal confirmed: ACLS, expires on 30/06/2028", "Renewal confirmed: ACLS, no expiry date"],
      errors: ["This certification has expired: confirm its renewal, with the new expiry date read on the certificate, or tick that it has none.", "The new expiry date is more than 15 years ahead: check it on the certificate (26/10/2041 at the latest).", "The new expiry date has already passed: the certification would remain expired.", "Invalid new expiry date."],
      none: "No certification declared or read in the CV.",
    }],
    ["de", {
      expired: " · abgelaufen im Mai 2023</span>", current: " · gültig bis Mai 2028</span>",
      texts: ["vom Kandidaten angegeben", "von der KI aus dem Lebenslauf gelesen", "vom Admin bestätigt", "zählt im Matching der Missionen erst, wenn der Admin es", "Abgelaufen, zählt es nicht im Matching.", "Neues Ablaufdatum", "Ohne Ablaufdatum", ">Erneuerung bestätigen</button>", ">Bestätigen</button>", ">Bestätigung zurücknehmen</button>"],
      labels: ["Erneuerung von ACLS bestätigen", "Neues Ablaufdatum — ACLS", "Der Nachweis für ACLS trägt kein Ablaufdatum", "Licence DHA bestätigen", "Bestätigung von BLS zurücknehmen"],
      toasts: ["Zertifikat bestätigt: Licence DHA", "Bestätigung zurückgenommen: BLS", "Bestätigung zurückgenommen: Licence DHA. Die letzte Analyse des Lebenslaufs übernimmt es nicht: Es gilt nicht mehr als aus dem Lebenslauf gelesen.", "Erneuerung bestätigt: ACLS, gültig bis 30.06.2028", "Erneuerung bestätigt: ACLS, ohne Ablaufdatum"],
      errors: ["Dieses Zertifikat ist abgelaufen: Bestätigen Sie seine Erneuerung mit dem neuen Ablaufdatum auf dem Nachweis oder kreuzen Sie an, dass er keines trägt.", "Das neue Ablaufdatum liegt mehr als 15 Jahre in der Zukunft: Prüfen Sie es auf dem Nachweis (spätestens am 26.10.2041).", "Das neue Ablaufdatum ist bereits vergangen: Das Zertifikat bliebe abgelaufen.", "Ungültiges neues Ablaufdatum."],
      none: "Kein Zertifikat angegeben oder im Lebenslauf gelesen.",
    }],
    ["zh", {
      expired: " · 已于 2023年5月 过期</span>", current: " · 有效期至 2028年5月</span>",
      texts: ["候选人自行申报", "AI 从简历中提取", "管理员已确认", "都须经管理员核实证明文件并确认后才计入任务匹配", "已过期，不计入匹配。", "新的到期日期", "无到期日期", ">确认续期</button>", ">确认</button>", ">撤销确认</button>"],
      labels: ["确认 ACLS 的续期", "新的到期日期 — ACLS", "ACLS 的证书上没有到期日期", "确认 Licence DHA", "撤销对 BLS 的确认"],
      toasts: ["已确认证书：Licence DHA", "已撤销确认：BLS", "已撤销确认：Licence DHA。最近一次简历分析未保留该证书：它不再被视为从简历中提取。", "已确认续期：ACLS，有效期至 2028/06/30", "已确认续期：ACLS，无到期日期"],
      errors: ["该证书已过期：请确认其续期，填写证书上的新到期日期，或勾选证书上没有到期日期。", "新的到期日期晚于 15 年之后：请在证书上核对（最晚为 2041/10/26）。", "新的到期日期已过：该证书仍将处于过期状态。", "新的到期日期无效。"],
      none: "未申报证书，简历中也未读到证书。",
    }],
  ] as const)("écrit les certifications, leur renouvellement, les toasts et les refus du serveur dans la langue de l’administration (%s, IA-02)", async (language, expected) => {
    state.language = language;
    const certifications = [
      { name: "ACLS", origins: ["declared", "extracted"], expiresAt: "2023-05" },
      { name: "Licence DHA", origins: ["extracted"], expiresAt: "2028-05" },
      { name: "BLS", origins: ["declared", "confirmed"], expiresAt: null },
    ];
    const tree = CertificationReview({ applicationId: 5, certifications: certifications as never });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain(`ACLS<span class="font-normal text-red-600 dark:text-red-400">${expected.expired}`);
    expect(html).toContain(`Licence DHA<span class="font-normal text-muted-foreground">${expected.current}`);
    for (const text of expected.texts) expect(html).toContain(text);
    for (const label of expected.labels) expect(elements(tree).some(element => element.props["aria-label"] === label)).toBe(true);
    // Nothing of the certifications is left in French.
    expect(html).not.toMatch(/Confirmer|Annuler|expirée|expire |Nouvelle date|déclarée|extraite|confirmée|justificatif|matching des missions/);
    expect(html.match(/<input[^>]*type="date"[^>]*>/g)).toEqual([expect.stringMatching(/min="2026-10-26" max="2041-10-26"/)]);

    clickable(tree, expected.labels[3])();
    expect(state.confirmMutate).toHaveBeenLastCalledWith({ id: 5, name: "Licence DHA", confirmed: true });
    await state.confirmOptions!.onSuccess?.({ success: true, changed: true }, { id: 5, name: "Licence DHA", confirmed: true });
    await state.confirmOptions!.onSuccess?.({ success: true, changed: true }, { id: 5, name: "BLS", confirmed: false });
    await state.confirmOptions!.onSuccess?.({ success: true, changed: true, notRetainedByAnalysis: true }, { id: 5, name: "Licence DHA", confirmed: false });
    await state.confirmOptions!.onSuccess?.({ success: true, changed: true }, { id: 5, name: "ACLS", confirmed: true, renewal: { expiresAt: "2028-06-30" } });
    await state.confirmOptions!.onSuccess?.({ success: true, changed: true }, { id: 5, name: "ACLS", confirmed: true, renewal: { expiresAt: null } });
    expect(state.toasts).toEqual(expected.toasts);

    const refuse = (reason: string | undefined, date?: string, message = "Message du serveur.") => state.confirmOptions!.onError?.({ message, data: { code: "BAD_REQUEST", reason, ...(date ? { date } : {}) } });
    await refuse("renewal_required");
    await refuse("renewal_date_too_far", "2041-10-26");
    await refuse("renewal_date_past");
    await refuse("renewal_date_invalid");
    await refuse(undefined, undefined, "Une erreur interne est survenue. Veuillez réessayer dans quelques instants. (réf. 1a2b3c4d)");
    expect(state.errors).toEqual([...expected.errors, "Une erreur interne est survenue. Veuillez réessayer dans quelques instants. (réf. 1a2b3c4d)"]);

    expect(renderToStaticMarkup(CertificationReview({ applicationId: 5, certifications: [] }))).toContain(expected.none);
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
