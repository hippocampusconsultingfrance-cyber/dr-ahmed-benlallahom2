import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-04, IA-02, RGPD-03 — écran d’une mission : filtres du classement,
// origine des certifications, accès à la fiche 360° et au CV, et accord du
// candidat noté avant l’export de la shortlist.

type MutationOptions = { onSuccess?: (result: unknown, variables: never) => unknown; onError?: (error: unknown, variables: never) => unknown };

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
  language: "fr" as "fr" | "en" | "de" | "zh",
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
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: state.language }) }));
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
const candidate = (id: number, firstName: string, lastName: string, association: null | Record<string, unknown>, match: Record<string, unknown> = {}) => ({
  id, firstName, lastName, specialty: "Anesthésie-réanimation", availability: null, association,
  match: { score: 50, reasons: [], breakdown, matchedCertifications: [], certificationsToConfirm: [], matchedLanguages: [], certifications: [], languages: [], ...match },
});

function missionData(extra: Record<string, unknown> = {}) {
  return {
    brief,
    candidates: [
      candidate(11, "Amal", "Haddad", { status: "shortlisted", candidateConsentAt: null }, { reasons: [{ criterion: "specialty" }], certifications: [{ name: "Licence DHA", origins: ["extracted"], expiresAt: null, status: "to_confirm" }] }),
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
  state.language = "fr";
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
    // Each control names its candidate.
    control(render(), "Date de l’accord — Amal Haddad", "onChange")({ target: { value: "2026-10-24" } });
    control(render(), "Accord du candidat reçu — Amal Haddad")();
    expect(state.consentMutate).toHaveBeenCalledWith({ briefId: 7, applicationId: 11, consentDate: "2026-10-24" });
    control(render(), "Retirer l’accord — Jean Martin")();
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

    // Opened from this screen, translated, the sheet words its certifications in the admin's language (IA-02).
    expect(dialogOf().props.certificationLanguage).toBe("fr");
    state.language = "zh";
    expect(dialogOf().props.certificationLanguage).toBe("zh");
  });

  it("demande au serveur une compatibilité minimale et l’état de présélection, depuis la première page (ADM-04)", () => {
    const html = renderToStaticMarkup(render());
    expect(html).toContain("Classement calculé sur 2000 des 2500 dossiers ouverts : les plus récents et ceux déjà associés à cette mission.");
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

  it("suit la page renvoyée par le serveur quand celle demandée s’est vidée (ADM-04)", () => {
    state.data = missionData({ pagination: { page: 1, limit: 25, total: 51, totalPages: 3 } });
    control(render(), "Suivant")();
    render();
    expect(state.inputs.at(-1)).toMatchObject({ page: 2 });
    // Two candidates left the list: the server returns the last page, the second.
    state.data = missionData({ pagination: { page: 1, limit: 25, total: 49, totalPages: 2 } });
    const html = renderToStaticMarkup(render());
    expect(html).toContain("Page 2 sur 2 · 49 profil(s) à examiner");
    control(render(), "Précédent")();
    render();
    expect(state.inputs.at(-1)).toMatchObject({ page: 0 });
  });

  it.each([
    ["en", ["Minimum compatibility", "Already shortlisted", "Ranking computed on 2000 of 2500 open applications", "Candidate’s agreement received on 20/10/2026 for this mission.", "Candidate’s agreement for this mission not recorded", "1 of 2 with the candidate’s agreement: only those are exported.", "Export shortlist (1)"], "CV of Amal Haddad", "1 candidate(s) left out for lack of agreement."],
    ["de", ["Mindestkompatibilität", "Bereits auf der Shortlist", "Rangfolge berechnet für 2000 von 2500 offenen Bewerbungen", "Zustimmung des Kandidaten für diese Mission am 20.10.2026 erhalten.", "1 von 2 mit Zustimmung des Kandidaten", "Shortlist exportieren (1)"], "Lebenslauf von Amal Haddad", "1 Kandidat(en) mangels Zustimmung ausgeschlossen."],
    ["zh", ["最低匹配度", "已列入名单", "排名基于 2500 份未结申请中的 2000 份", "已于 2026/10/20 收到候选人对此任务的同意。", "2 人中有 1 人已同意", "导出候选名单 (1)"], "Amal Haddad 的简历", "1 名候选人因未同意而被排除。"],
  ] as const)("écrit l’écran de la mission dans la langue de l’administration (%s)", async (language, texts, cvLabel, excluded) => {
    state.language = language;
    const html = renderToStaticMarkup(render());
    for (const text of texts) expect(html).toContain(text);
    expect(html).not.toContain("Accord du candidat");
    control(render(), cvLabel)();
    expect(state.cvMutate).toHaveBeenCalledWith({ id: 11 });
    await state.exportOptions!.onSuccess?.({ filename: "shortlist.csv", csv: "x", count: 1, excludedWithoutConsent: 1 }, {} as never);
    expect(state.toasts.at(-1)![1]).toMatch(new RegExp(`${excluded.replace(/[()]/g, "\\$&")}$`));
  });

  it("montre pourquoi une certification ne compte pas encore (IA-02)", () => {
    expect(renderToStaticMarkup(render())).toContain("spécialité compatible · certification à confirmer : Licence DHA (extraite du CV par l’IA) — aucun point tant que l’admin ne l’a pas confirmée");
    // Two of them, still to confirm.
    state.data = missionData({ candidates: [candidate(11, "Amal", "Haddad", null, { certifications: [
      { name: "Licence DHA", origins: ["extracted"], expiresAt: null, status: "to_confirm" },
      { name: "BLS", origins: ["declared"], expiresAt: null, status: "to_confirm" },
    ] })] });
    expect(renderToStaticMarkup(render())).toContain("certifications à confirmer : Licence DHA (extraite du CV par l’IA) ; BLS (déclarée par le candidat) — aucun point tant que l’admin ne les a pas confirmées");
  });

  it.each([
    ["fr", "spécialité compatible · mobilité vers le pays de mission déclarée · expérience déclarée : 8 an(s) pour un minimum de 5 · disponibilité compatible avec le besoin exprimé · certifications correspondantes : BLS (déclarée par le candidat, confirmée par l’admin) · certification à confirmer : Licence DHA (extraite du CV par l’IA) — aucun point tant que l’admin ne l’a pas confirmée · certification hors validité : ACLS (déclarée par le candidat, extraite du CV par l’IA), expirée en mai 2023 — aucun point tant que l’admin n’a pas confirmé son renouvellement · langues correspondantes : Anglais (déclarée par le candidat, extraite du CV par l’IA)", ["Spécialité +35", "Mobilité +15", "Certifications +10", "Langues +15", "Expérience +10", "Disponibilité +5"]],
    ["en", "compatible specialty · declared mobility to the mission country · declared experience: 8 year(s) for a minimum of 5 · availability compatible with the stated need · matching certifications: BLS (declared by the candidate, confirmed by the admin) · certification to confirm: Licence DHA (read from the CV by the AI) — no points until the admin confirms it · certification no longer valid: ACLS (declared by the candidate, read from the CV by the AI), expired in May 2023 — no points until the admin confirms its renewal · matching languages: Anglais (declared by the candidate, read from the CV by the AI)", ["Specialty +35", "Mobility +15", "Certifications +10", "Languages +15", "Experience +10", "Availability +5"]],
    ["de", "passendes Fachgebiet · angegebene Mobilität ins Einsatzland · angegebene Erfahrung: 8 Jahr(e) bei mindestens 5 · Verfügbarkeit passt zum angegebenen Bedarf · passende Zertifikate: BLS (vom Kandidaten angegeben, vom Admin bestätigt) · zu bestätigendes Zertifikat: Licence DHA (von der KI aus dem Lebenslauf gelesen) — keine Punkte, solange der Admin es nicht bestätigt hat · nicht mehr gültiges Zertifikat: ACLS (vom Kandidaten angegeben, von der KI aus dem Lebenslauf gelesen), abgelaufen im Mai 2023 — keine Punkte, bis der Admin seine Erneuerung bestätigt · passende Sprachen: Anglais (vom Kandidaten angegeben, von der KI aus dem Lebenslauf gelesen)", ["Fachgebiet +35", "Mobilität +15", "Zertifikate +10", "Sprachen +15", "Erfahrung +10", "Verfügbarkeit +5"]],
    ["zh", "专业匹配 · 已申报可前往任务所在国家 · 申报经验：8 年（最低要求 5 年） · 可入职时间符合所述需求 · 匹配的证书：BLS (候选人自行申报, 管理员已确认) · 待确认的证书：Licence DHA (AI 从简历中提取)——管理员确认前不计分 · 已失效的证书：ACLS (候选人自行申报, AI 从简历中提取), 已于 2023年5月 过期——管理员确认续期前不计分 · 匹配的语言：Anglais (候选人自行申报, AI 从简历中提取)", ["专业 +35", "流动性 +15", "证书 +10", "语言 +15", "经验 +10", "可入职时间 +5"]],
  ] as const)("écrit les motifs du classement, l’origine des certifications et des langues, et ce qui manque pour qu’une certification compte, dans la langue de l’administration (%s, IA-02)", (language, reasons, scoreDetail) => {
    state.language = language;
    state.data = missionData({ candidates: [candidate(11, "Amal", "Haddad", null, {
      reasons: [{ criterion: "specialty" }, { criterion: "mobility" }, { criterion: "experience", years: 8, minimum: 5 }, { criterion: "availability" }],
      breakdown: { specialty: 35, mobility: 15, certifications: 10, languages: 15, experience: 10, availability: 5 },
      certifications: [
        { name: "BLS", origins: ["declared", "confirmed"], expiresAt: null, status: "matched" },
        { name: "Licence DHA", origins: ["extracted"], expiresAt: null, status: "to_confirm" },
        { name: "ACLS", origins: ["declared", "extracted"], expiresAt: "2023-05", status: "expired" },
      ],
      languages: [{ name: "Anglais", origins: ["declared", "extracted"] }],
    })] });
    const html = renderToStaticMarkup(render());
    expect(html).toContain(`<p class="mt-2 text-xs text-muted-foreground">${reasons}</p>`);
    for (const chip of scoreDetail) expect(html).toContain(`>${chip}</span>`);
    // Nothing of the card is left in French in another language.
    if (language !== "fr") expect(html).not.toMatch(/spécialité|mobilité|expérience|disponibilité|Spécialité|Mobilité|Expérience|Disponibilité|Langues/);
  });

  it.each([
    ["fr", "certification hors validité : ACLS (extraite du CV par l’IA), expirée le 31/05/2023 — ", "certification hors validité : PALS (extraite du CV par l’IA), expirée en 2022 — "],
    ["en", "certification no longer valid: ACLS (read from the CV by the AI), expired on 31/05/2023 — ", "certification no longer valid: PALS (read from the CV by the AI), expired in 2022 — "],
    ["de", "nicht mehr gültiges Zertifikat: ACLS (von der KI aus dem Lebenslauf gelesen), abgelaufen am 31.05.2023 — ", "nicht mehr gültiges Zertifikat: PALS (von der KI aus dem Lebenslauf gelesen), abgelaufen im Jahr 2022 — "],
    ["zh", "已失效的证书：ACLS (AI 从简历中提取), 已于 2023/05/31 过期——", "已失效的证书：PALS (AI 从简历中提取), 已于 2022年 过期——"],
  ] as const)("date l’expiration d’une certification au jour près ou à l’année, dans la langue de l’administration (%s, IA-02)", (language, toTheDay, year) => {
    state.language = language;
    const expiredOn = (name: string, expiresAt: string) => candidate(11, "Amal", "Haddad", null, { certifications: [{ name, origins: ["extracted"], expiresAt, status: "expired" }] });
    state.data = missionData({ candidates: [expiredOn("ACLS", "2023-05-31"), { ...expiredOn("PALS", "2022"), id: 12 }] });
    const html = renderToStaticMarkup(render());
    expect(html).toContain(toTheDay);
    expect(html).toContain(year);
    expect(html).not.toContain("2023-05-31");
  });

  it.each([
    ["fr", "certification hors validité : ACLS (déclarée par le candidat), expirée en mai 2023 selon le CV, à vérifier — "],
    ["en", "certification no longer valid: ACLS (declared by the candidate), expired in May 2023 according to the CV, to be checked — "],
    ["de", "nicht mehr gültiges Zertifikat: ACLS (vom Kandidaten angegeben), abgelaufen im Mai 2023 laut Lebenslauf, zu prüfen — "],
    ["zh", "已失效的证书：ACLS (候选人自行申报), 已于 2023年5月 过期（据简历，待核实）——"],
  ] as const)("dit d’une date d’expiration que seul un CV dont l’analyse n’a retenu aucun fait la donne, à vérifier (%s, IA-02)", (language, expired) => {
    state.language = language;
    state.data = missionData({ candidates: [candidate(11, "Amal", "Haddad", null, { certifications: [{ name: "ACLS", origins: ["declared"], expiresAt: "2023-05", expiryUnverified: true, status: "expired" }] })] });
    expect(renderToStaticMarkup(render())).toContain(expired);
  });

  it.each([
    ["fr", "La date de l’accord du candidat ne peut pas précéder sa candidature, reçue le 21/10/2026.", "La date de l’accord du candidat ne peut pas précéder la création de la mission, le 19/10/2026.", "La date de l’accord du candidat ne peut pas être dans le futur.", "Ce candidat n’est pas associé à cette mission : présélectionnez-le d’abord."],
    ["en", "The candidate’s agreement cannot be dated before their application, received on 21/10/2026.", "The candidate’s agreement cannot be dated before the mission was created, on 19/10/2026.", "The candidate’s agreement cannot be dated in the future.", "This candidate is not linked to this mission: shortlist them first."],
    ["de", "Die Zustimmung des Kandidaten kann nicht vor dem Eingang seiner Bewerbung am 21.10.2026 datiert sein.", "Die Zustimmung des Kandidaten kann nicht vor der Erstellung der Mission am 19.10.2026 datiert sein.", "Die Zustimmung des Kandidaten kann nicht in der Zukunft datiert sein.", "Dieser Kandidat ist nicht mit dieser Mission verknüpft: Setzen Sie ihn zuerst auf die Shortlist."],
    ["zh", "候选人同意日期不能早于其申请收到日期（2026/10/21）。", "候选人同意日期不能早于任务创建日期（2026/10/19）。", "候选人同意日期不能晚于今天。", "该候选人未与此任务关联：请先将其加入候选名单。"],
  ] as const)("dit pourquoi le serveur refuse une date d’accord, dans la langue de l’administration (%s, RGPD-03)", async (language, beforeApplication, beforeMission, future, notAssociated) => {
    state.language = language;
    // The mission was created at 00:30 on 19 October in Paris, the application at 00:30 on 21 October.
    state.data = missionData({
      brief: { ...brief, createdAt: new Date("2026-10-18T22:30:00.000Z") },
      candidates: [{ ...candidate(11, "Amal", "Haddad", { status: "shortlisted", candidateConsentAt: null }), createdAt: new Date("2026-10-20T22:30:00.000Z") }],
    });
    render();
    // The server's French message, its stable reason and the day it names, as tRPC delivers them.
    const refusal = (reason: string | undefined, date?: string, message = "Message du serveur en français.") => state.consentOptions!.onError?.({ message, data: { code: "BAD_REQUEST", reason, ...(date ? { date } : {}) } }, { briefId: 7, applicationId: 11, consentDate: "2026-10-01" } as never);
    await refusal("consent_before_application", "2026-10-21");
    await refusal("consent_before_mission", "2026-10-19");
    for (const reason of ["consent_date_future", "consent_not_associated"]) await refusal(reason);
    // Any other failure keeps the server's message.
    await refusal(undefined, undefined, "Une erreur interne est survenue. Veuillez réessayer dans quelques instants. (réf. 1a2b3c4d)");
    expect(state.toasts).toEqual([
      ["error", beforeApplication],
      ["error", beforeMission],
      ["error", future],
      ["error", notAssociated],
      ["error", "Une erreur interne est survenue. Veuillez réessayer dans quelques instants. (réf. 1a2b3c4d)"],
    ]);
  });

  it.each([
    ["en", "The candidate’s agreement cannot be dated before the mission was created, on 24/10/2026.", "The candidate’s agreement cannot be dated before their application, received on 25/10/2026.", "The candidate’s agreement cannot be dated in the future."],
    ["de", "Die Zustimmung des Kandidaten kann nicht vor der Erstellung der Mission am 24.10.2026 datiert sein.", "Die Zustimmung des Kandidaten kann nicht vor dem Eingang seiner Bewerbung am 25.10.2026 datiert sein.", "Die Zustimmung des Kandidaten kann nicht in der Zukunft datiert sein."],
    ["zh", "候选人同意日期不能早于任务创建日期（2026/10/24）。", "候选人同意日期不能早于其申请收到日期（2026/10/25）。", "候选人同意日期不能晚于今天。"],
  ] as const)("date le refus avec le jour envoyé par le serveur, même quand l’admin a changé de mission pendant la requête (%s, RGPD-03)", async (language, beforeMission, beforeApplication, future) => {
    state.language = language;
    // Mission 7 on screen, created on 19 October in Paris.
    state.data = missionData({
      brief: { ...brief, createdAt: new Date("2026-10-18T22:30:00.000Z") },
      candidates: [{ ...candidate(11, "Amal", "Haddad", { status: "shortlisted", candidateConsentAt: null }), createdAt: new Date("2026-10-20T22:30:00.000Z") }],
    });
    render();
    const refusal = (reason: string, variables: Record<string, unknown>, date?: string) => state.consentOptions!.onError?.({ message: `Message du serveur : ${reason}.`, data: { code: "BAD_REQUEST", reason, ...(date ? { date } : {}) } }, { consentDate: "2026-10-01", ...variables } as never);
    // The admin moved to mission 7 while the agreement for mission 8, created
    // on 24 October, was being saved: dated with mission 8, in their language.
    await refusal("consent_before_mission", { briefId: 8, applicationId: 11 }, "2026-10-24");
    // A candidate no longer among those shown, whose application came on 25 October.
    await refusal("consent_before_application", { briefId: 7, applicationId: 99 }, "2026-10-25");
    // A reason that needs no date.
    await refusal("consent_date_future", { briefId: 8, applicationId: 11 });
    // Without the day (a server of an earlier version), the server's message rather than a wrong date.
    await refusal("consent_before_mission", { briefId: 7, applicationId: 11 });
    expect(state.toasts).toEqual([
      ["error", beforeMission],
      ["error", beforeApplication],
      ["error", future],
      ["error", "Message du serveur : consent_before_mission."],
    ]);
  });

  it("ne propose pas une date d’accord antérieure à la candidature ou à la création de la mission (RGPD-03)", () => {
    const dateInput = () => renderToStaticMarkup(render()).match(/<input[^>]*type="date"[^>]*>/)?.[0];
    // The mission was created at 00:30 on 19 October in Paris, after the application.
    const shortlistedOn = (createdAt: string) => missionData({
      brief: { ...brief, createdAt: new Date("2026-10-18T22:30:00.000Z") },
      candidates: [{ ...candidate(11, "Amal", "Haddad", { status: "shortlisted", candidateConsentAt: null }), createdAt: new Date(createdAt) }],
    });
    state.data = shortlistedOn("2026-10-15T08:00:00.000Z");
    expect(dateInput()).toContain('min="2026-10-19"');
    state.data = shortlistedOn("2026-10-21T09:00:00.000Z");
    expect(dateInput()).toContain('min="2026-10-21"');
    expect(dateInput()).toContain('max="2026-10-26"');
  });

  it("n’offre l’export qu’avec au moins un accord, et dit combien de candidats en sont exclus (RGPD-03)", async () => {
    const exportButton = (html: string) => [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/gs)].find(match => match[2]!.includes("Exporter la shortlist"))!;
    let html = renderToStaticMarkup(render());
    expect(html).toContain("1 sur 2 avec l’accord du candidat : seuls ceux-là sont exportés.");
    expect(exportButton(html)[1]).not.toMatch(/\sdisabled=""/);
    // The button counts what the file will carry: the candidates who agreed (REC-01).
    expect(exportButton(html)[2]!.replace(/<[^>]+>/g, "")).toBe("Exporter la shortlist (1)");

    await state.exportOptions!.onSuccess?.({ filename: "shortlist.csv", csv: "x", count: 1, excludedWithoutConsent: 1 }, {} as never);
    expect(state.toasts).toContainEqual(["success", "1 profil(s) de shortlist exporté(s). L’export est journalisé. 1 candidat(s) exclu(s) faute d’accord."]);

    state.data = missionData({ consentedCount: 0 });
    html = renderToStaticMarkup(render());
    expect(exportButton(html)[1]).toMatch(/\sdisabled=""/);
    expect(html).toContain("Aucun accord de candidat noté : notez l’accord de chaque candidat présélectionné avant d’exporter.");
  });
});
