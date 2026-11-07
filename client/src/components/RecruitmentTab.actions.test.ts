import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";
import { CV_READING_LABELS, CV_REVIEW_REMINDER, contradictionEvidenceLabel, cvReadingTextForDisplay, fieldEvidenceStatusLabel, fieldEvidenceStatusTone } from "./recruitmentEvidenceLabels";
import { recruitmentAnalysisErrorLabel, recruitmentDriveExportErrorLabel, recruitmentEmailDeliveryErrorLabel } from "@/lib/recruitmentTraceability";

// Candidatures de l’administration, ouvertes et manipulées comme par
// l’administrateur : effacement RGPD confirmé puis rapporté, reprise de
// l’accusé de dépôt (avec avertissement de doublon quand rien n’est tracé),
// reprise de la copie Google Drive, suivi de l’invitation et de l’activation
// de l’espace candidat, pays du diplôme, erreurs d’analyse lisibles et lecture
// du CV jamais présentée comme vérifiée (IA-01).

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type MutationOptions = { onSuccess?: (result: any, input?: any) => unknown };
const state = vi.hoisted(() => {
  const mutations: Record<string, { mutate: ReturnType<typeof vi.fn>; options?: MutationOptions }> = {};
  return {
    applications: [] as Array<Record<string, unknown>>,
    drive: { connected: true, lastError: null as string | null, failedExports: 0 },
    profiles: [] as Array<Record<string, unknown>>,
    /** The analysis the open card reads (ADM-20): null while it loads. */
    analysisLoading: false,
    detailRequests: [] as unknown[],
    utils: { list: { invalidate: vi.fn(), cancel: vi.fn(), getData: vi.fn(), setData: vi.fn() }, detail: { invalidate: vi.fn() } },
    mutations,
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    mutation: (path: string) => (options?: MutationOptions) => {
      const entry = (mutations[path] ??= { mutate: vi.fn() });
      entry.options = options;
      return { mutate: entry.mutate, isPending: false };
    },
  };
});

vi.mock("sonner", () => ({ toast: state.toast }));
vi.mock("./Candidate360Dialog", () => ({ default: () => null }));
vi.mock("./CertificationReview", () => ({ default: () => null }));
// The list as the server sends it (ADM-20): without the CV analysis, which detail gives the open card.
const ANALYSIS_FIELDS = ["aiSummary", "aiStrengths", "aiWeaknesses", "aiExtractedSkills", "aiMatchReasoning", "extractionWarnings"];
const listed = (application: Record<string, unknown>) => ({
  ...Object.fromEntries(Object.entries(application).filter(([field]) => !ANALYSIS_FIELDS.includes(field))),
  hasAiSummary: Boolean(application.aiSummary),
});
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ admin: { recruitment: state.utils } }),
    useQueries: (build: (t: unknown) => unknown[]) => {
      const t = { admin: { recruitment: { list: (input: unknown) => input } } };
      return build(t).map(() => ({ data: { items: state.applications.map(listed), total: state.applications.length }, isLoading: false, error: null, refetch: vi.fn() }));
    },
    admin: {
      recruitment: {
        detail: {
          useQuery: (input: { id: number }, options: { enabled: boolean }) => {
            if (options.enabled) state.detailRequests.push(input);
            const application = state.applications.find(item => item.id === input.id);
            const data = options.enabled && application && !state.analysisLoading ? { id: application.id, ...Object.fromEntries(ANALYSIS_FIELDS.map(field => [field, application[field] ?? null])) } : undefined;
            return { data, isLoading: !data, isFetching: false, error: null, refetch: vi.fn() };
          },
        },
        profiles: { list: { useQuery: () => ({ data: state.profiles, refetch: vi.fn() }) }, create: { useMutation: state.mutation("profiles.create") }, delete: { useMutation: state.mutation("profiles.delete") } },
        driveExport: {
          status: { useQuery: () => ({ data: state.drive, refetch: vi.fn() }) },
          retry: { useMutation: state.mutation("driveExport.retry") },
          retryAllFailed: { useMutation: state.mutation("driveExport.retryAllFailed") },
        },
        updateStatus: { useMutation: state.mutation("updateStatus") },
        getDownloadUrl: { useMutation: state.mutation("getDownloadUrl") },
        reanalyze: { useMutation: state.mutation("reanalyze") },
        reanalyzeFailed: { useMutation: state.mutation("reanalyzeFailed") },
        confirmationEmail: { retry: { useMutation: state.mutation("confirmationEmail.retry") } },
        sendTemplateEmail: { useMutation: state.mutation("sendTemplateEmail") },
        candidate: { sendPortalInvitation: { useMutation: state.mutation("candidate.sendPortalInvitation") } },
        erase: { useMutation: state.mutation("erase") },
      },
    },
  },
}));

const { default: RecruitmentTab } = await import("./RecruitmentTab");

type Element = { type: unknown; props: Record<string, any> };
const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as Element).props.children);
  return "";
};
const render = () => elementsOf(renderStateful(RecruitmentTab as () => ReactElement)) as Element[];
const pageText = () => textOf(renderStateful(RecruitmentTab as () => ReactElement));
/** The clickable element whose visible text is exactly `name`. */
const action = (name: string) => render().find(element => typeof element.props.onClick === "function" && textOf(element.props.children).trim() === name);
const mutate = (path: string) => state.mutations[path]!.mutate;

const dossier = (id: number, extra: Record<string, unknown> = {}) => ({
  id, trackingId: `CV-2026-00000${id}`, firstName: "Dr", lastName: `Candidat${id}`, email: `c${id}@test.local`, phone: null, specialty: "Anesthésie", targetCountries: "[\"France\"]", languages: "[]",
  diplomaCountry: null, availability: null, mobility: null, certifications: null, yearsExperience: null, message: null, status: "new", adminNotes: null, language: "fr",
  aiScore: null, aiSummary: null, aiStrengths: null, aiWeaknesses: null, aiExtractedSkills: null, aiMatchReasoning: null, aiAnalyzedAt: null,
  analysisStatus: "queued", analysisAttempts: 1, analysisLastError: null, analysisModel: null, analysisPromptVersion: null, extractionWarnings: null,
  cvOriginalName: "cv.pdf", cvSizeBytes: 120_000, fileValidationStatus: "accepted", fileSecurityScanVersion: null, createdAt: "2026-10-01T08:00:00.000Z", retentionUntil: null,
  certificationFacts: [], driveExport: null, emailDelivery: null, candidatePortalActive: false, candidatePortalInvitation: null, candidatePortalActivation: null, ...extra,
});

/** Opens a dossier's detail by clicking its header, as the administrator does. */
function open(id: number) {
  const header = render().find(element => element.type === "button" && new RegExp(`Candidat${id}(?!\\d)`).test(textOf(element.props.children)));
  header!.props.onClick();
}

let confirmAnswer: boolean;
const confirm = vi.fn(() => confirmAnswer);

beforeEach(() => {
  for (const key of Object.keys(state.mutations)) delete state.mutations[key];
  for (const fn of Object.values(state.toast)) fn.mockClear();
  state.drive = { connected: true, lastError: null, failedExports: 0 };
  state.profiles = [];
  state.analysisLoading = false;
  state.detailRequests = [];
  confirmAnswer = false;
  confirm.mockClear();
  vi.stubGlobal("window", { confirm });
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("effacement RGPD d’une candidature", () => {
  beforeEach(() => {
    state.applications = [dossier(1), dossier(2)];
  });

  it("n’efface qu’après une confirmation qui annonce la portée de l’effacement", () => {
    expect(action("Effacer RGPD + preuve")).toBeUndefined();
    open(2);

    action("Effacer RGPD + preuve")!.props.onClick();
    expect(confirm).toHaveBeenCalledTimes(1);
    const message = String(confirm.mock.calls[0]![0]);
    expect(message).toContain("Seule une preuve d’effacement anonymisée est conservée");
    expect(message).not.toContain("révocation immédiate de l’accès au document");
    expect(mutate("erase")).not.toHaveBeenCalled();

    confirmAnswer = true;
    action("Effacer RGPD + preuve")!.props.onClick();
    expect(mutate("erase").mock.calls).toEqual([[{ id: 2 }]]);
  });

  it("rend compte de ce qui a été supprimé, et signale une copie Drive restant à effacer", () => {
    open(1);
    render();
    const report = { storageObjectsDeleted: 2, googleDrive: { status: "deleted", deleted: 1 }, candidateAccountsErased: 1, candidateDocumentsDeleted: 2, rowsDeleted: { cv_applications: 1, cv_application_jobs: 2, recruitment_email_events: 1 }, otherApplicationsWithSameEmail: 1 };

    state.mutations.erase!.options!.onSuccess!(report);
    expect(state.toast.success).toHaveBeenCalledTimes(1);
    expect(state.toast.success.mock.calls[0]![1]).toMatchObject({
      description: "2 fichier(s) stocké(s) supprimé(s) · 1 copie(s) Google Drive supprimée(s) · 3 donnée(s) liée(s) supprimée(s) · espace candidat supprimé (2 document(s)) · 1 autre(s) candidature(s) avec le même email à traiter séparément",
    });
    expect(action("Effacer RGPD + preuve"), "le détail du dossier effacé se referme").toBeUndefined();

    state.mutations.erase!.options!.onSuccess!({ ...report, googleDrive: { status: "pending_retry", deleted: 0 }, candidateAccountsErased: 0, otherApplicationsWithSameEmail: 0 });
    expect(state.toast.warning).toHaveBeenCalledTimes(1);
    expect(state.toast.warning.mock.calls[0]![1].description).toBe("2 fichier(s) stocké(s) supprimé(s) · copie Google Drive en attente de suppression · 3 donnée(s) liée(s) supprimée(s) · aucun espace candidat lié");
  });
});

describe("reprise de l’accusé de dépôt", () => {
  it("demande confirmation, en annonçant un doublon possible, avant d’envoyer un accusé sans trace d’envoi", () => {
    state.applications = [dossier(1)];
    open(1);

    action("Envoyer l’accusé")!.props.onClick();
    expect(String(confirm.mock.calls[0]![0])).toContain("un doublon reste possible");
    expect(mutate("confirmationEmail.retry")).not.toHaveBeenCalled();

    confirmAnswer = true;
    action("Envoyer l’accusé")!.props.onClick();
    expect(mutate("confirmationEmail.retry").mock.calls).toEqual([[{ id: 1 }]]);
  });

  it("renvoie directement un accusé en échec, avec la cause et le nombre de tentatives", () => {
    state.applications = [dossier(1, { emailDelivery: { eventType: "email.failed", attempts: 3, failureCode: "quota" } })];
    open(1);

    expect(pageText()).toContain("Tentative 3/3");
    expect(pageText()).toContain(recruitmentEmailDeliveryErrorLabel("quota")!);
    action("Renvoyer l’accusé")!.props.onClick();
    expect(confirm).not.toHaveBeenCalled();
    expect(mutate("confirmationEmail.retry").mock.calls).toEqual([[{ id: 1 }]]);
  });

  it("ne propose aucune reprise d’un accusé tracé comme envoyé", () => {
    state.applications = [dossier(1, { emailDelivery: { eventType: "email.delivered", attempts: 1, failureCode: null } })];
    open(1);
    expect(action("Renvoyer l’accusé")).toBeUndefined();
    expect(action("Envoyer l’accusé")).toBeUndefined();
  });
});

describe("reprise de la copie Google Drive", () => {
  it("planifie une copie absente, relance une copie en échec avec sa cause, et laisse une copie réussie", () => {
    state.applications = [
      dossier(1),
      dossier(2, { driveExport: { status: "failed", attempts: 5, maxAttempts: 5, lastError: "google_drive_token_invalid_grant" } }),
      dossier(3, { driveExport: { status: "completed", attempts: 1, maxAttempts: 5, lastError: null, driveFileUrl: "https://drive.google.com/file/d/x" } }),
    ];
    open(1);
    action("Planifier la copie")!.props.onClick();
    expect(mutate("driveExport.retry").mock.calls).toEqual([[{ id: 1 }]]);

    open(2);
    expect(pageText()).toContain("Tentative 5/5");
    expect(pageText()).toContain(recruitmentDriveExportErrorLabel("google_drive_token_invalid_grant")!);
    action("Relancer la copie")!.props.onClick();
    expect(mutate("driveExport.retry").mock.calls.at(-1)).toEqual([{ id: 2 }]);

    open(3);
    expect(action("Relancer la copie")).toBeUndefined();
    expect(action("Planifier la copie")).toBeUndefined();
  });

  it("annonce dans l’en-tête une connexion Google Drive à renouveler (ADM-DRIVE-01)", () => {
    state.applications = [];
    state.drive = { connected: true, lastError: "google_drive_token_invalid_grant", failedExports: 0 };
    const link = render().find(element => element.type === "a" && element.props.href === "/api/google-drive/oauth/connect")!;
    expect(textOf(link.props.children)).toBe("Reconnexion Google Drive requise");
    expect(link.props.title).toBe(recruitmentDriveExportErrorLabel("google_drive_token_invalid_grant"));
  });
});

describe("espace candidat", () => {
  it("montre l’échec du dernier e-mail d’activation et propose de renvoyer l’invitation", () => {
    state.applications = [dossier(1, {
      candidatePortalInvitation: { eventType: "email.delivered", attempts: 1, failureCode: null },
      candidatePortalActivation: { eventType: "email.failed", attempts: 2, failureCode: "rate_limited" },
    })];
    open(1);

    const text = pageText();
    expect(text).toContain("Échec de l’activation");
    expect(text).toContain("Activation 2");
    expect(text).toContain(recruitmentEmailDeliveryErrorLabel("rate_limited")!);
    const resend = action("Renvoyer l’invitation")!;
    expect(resend.props.disabled).toBe(false);
    resend.props.onClick();
    expect(mutate("candidate.sendPortalInvitation").mock.calls).toEqual([[{ id: 1 }]]);
  });

  it("invite un candidat jamais invité et n’invite plus un espace actif", () => {
    state.applications = [dossier(1), dossier(2, { candidatePortalActive: true, candidatePortalActivation: { eventType: "email.failed", attempts: 2, failureCode: "quota" } })];
    open(1);
    expect(action("Inviter à créer l’espace")).toBeDefined();
    open(2);
    const active = action("Espace candidat actif")!;
    expect(active.props.disabled).toBe(true);
    expect(pageText()).toContain("Espace actif");
    expect(pageText()).not.toContain("Activation 2");
  });
});

describe("informations du dossier", () => {
  it("affiche le pays du diplôme quand il est renseigné, sans écarter les candidatures historiques", () => {
    state.applications = [dossier(1, { diplomaCountry: "Algérie" }), dossier(2)];
    const text = pageText();
    expect(text).toContain("Diplôme obtenu : Algérie");
    expect(text.match(/Diplôme obtenu/g)).toHaveLength(1);
    expect(text).toContain("Candidat2");
  });

  it("explique une erreur d’analyse au lieu d’afficher le message technique (ADM-REC-02)", () => {
    state.applications = [dossier(1, { analysisStatus: "failed", analysisLastError: "AI Gateway requires a valid credit card (402)" })];
    open(1);
    const text = pageText();
    expect(text).toContain(recruitmentAnalysisErrorLabel("AI Gateway requires a valid credit card (402)")!);
    expect(text).not.toContain("credit card");
  });
});

describe("lecture du CV par l’outil (IA-01)", () => {
  const fieldEvidence = [
    { field: "title", value: "Anesthésiste-réanimateur", evidence: "Anesthésiste-réanimateur", sourceLocation: "page 1", confidence: 92, evidenceVerified: true },
    { field: "language", value: "Anglais", evidence: "Anglais courant", sourceLocation: "formulaire de candidature", confidence: 80, evidenceVerified: true },
    { field: "skill", value: "ALR", evidence: "ALR échoguidée", sourceLocation: "page 2", confidence: 60, evidenceVerified: false },
  ];
  const analysed = (promptVersion: string) => dossier(1, {
    analysisStatus: "completed", analysisPromptVersion: promptVersion, aiScore: 82, aiAnalyzedAt: "2026-10-02T08:00:00.000Z",
    aiSummary: "Lecture automatisée : 3 citation(s) vérifiée(s) sur 4. Les faits disposent d’une preuve exploitable. Revue humaine obligatoire.",
    aiStrengths: JSON.stringify(["Titre professionnel vérifié : Anesthésiste-réanimateur"]),
    aiMatchReasoning: "Score déterministe calculé uniquement à partir de faits professionnels vérifiés et rapprochés de la spécialité déclarée.",
    aiExtractedSkills: JSON.stringify({
      professionalTitle: "Anesthésiste-réanimateur", specialties: ["Anesthésie"], verifiedSkills: ["ALR"], confidence: 90, evidenceCoverage: 75,
      scoreBreakdown: { specialtyMatch: 30, experienceEvidence: 20, skillsEvidence: 15, languageReadiness: 10, credentialReadiness: 7 },
      fieldEvidence,
      contradictions: [{ field: "specialty", declaredValue: "Anesthésie", documentValue: "Réanimation", sourceLocation: "page 1", evidenceVerified: true }],
    }),
  });

  it("présente les citations comme trouvées dans le texte lu, jamais comme vérifiées", () => {
    state.applications = [analysed("recruitment-v7-verified-score")];
    open(1);
    const tree = render();
    const text = textOf(tree);

    expect(text).toContain(CV_REVIEW_REMINDER);
    for (const heading of [CV_READING_LABELS.summary, CV_READING_LABELS.profile, CV_READING_LABELS.skills, CV_READING_LABELS.strengths]) expect(text).toContain(heading);
    for (const item of fieldEvidence) {
      const status = tree.find(element => element.type === "p" && textOf(element.props.children) === fieldEvidenceStatusLabel(item));
      expect(status, item.field).toBeDefined();
      expect(status!.props.className).toContain(fieldEvidenceStatusTone(item));
    }
    expect(text).toContain(`(${contradictionEvidenceLabel(true)})`);
    // Analyses saved with the earlier wording are shown with the current one.
    expect(text).toContain(cvReadingTextForDisplay("Lecture automatisée : 3 citation(s) vérifiée(s) sur 4. Les faits disposent d’une preuve exploitable. Revue humaine obligatoire."));
    expect(text).toContain("Titre professionnel trouvé dans le texte lu par l’outil : Anesthésiste-réanimateur");
    expect(text).toContain("faits professionnels trouvés dans le texte lu par l’outil");
    for (const wording of ["Citation vérifiée", "Compétences vérifiées", "Synthèse des preuves vérifiées", "Profil vérifié dans le CV", "Éléments professionnels vérifiés", "Certifications vérifiées", "citation(s) vérifiée(s)", "Titre professionnel vérifié", "faits professionnels vérifiés"]) {
      expect(text).not.toContain(wording);
    }
  });

  it("ne montre le score et son détail que pour une analyse au score vérifié", () => {
    state.applications = [analysed("recruitment-v7-verified-score")];
    open(1);
    expect(pageText()).toContain("Score IA 82/100");
    expect(pageText()).toContain("Détail du score professionnel");

    resetStatefulHooks();
    state.applications = [analysed("recruitment-v6-evidence")];
    open(1);
    const text = pageText();
    expect(text).toContain("Score à recalculer");
    expect(text).not.toContain("82/100");
    expect(text).not.toContain("Détail du score professionnel");
  });
});

describe("REC-14 — invitation dont la livraison est incertaine", () => {
  const uncertainSince = (minutes: number) => dossier(1, {
    candidatePortalInvitation: { eventType: "email.delivery_unknown", attempts: 1, failureCode: "delivery_exception", occurredAt: new Date(Date.now() - minutes * 60_000) },
  });

  it("propose « Renvoyer quand même » 10 minutes après la tentative, confirmé, comme une nouvelle tentative forcée", () => {
    state.applications = [uncertainSince(11)];
    open(1);
    expect(pageText()).toContain("Invitation à confirmer");

    action("Renvoyer quand même")!.props.onClick();
    expect(String(confirm.mock.calls[0]![0])).toContain("le candidat l’a peut-être reçue");
    expect(mutate("candidate.sendPortalInvitation")).not.toHaveBeenCalled();

    confirmAnswer = true;
    action("Renvoyer quand même")!.props.onClick();
    expect(mutate("candidate.sendPortalInvitation").mock.calls).toEqual([[{ id: 1, force: true }]]);
  });

  it("dit avant ces 10 minutes à quelle heure il sera possible, sans le proposer", () => {
    const uncertain = uncertainSince(3);
    state.applications = [uncertain];
    open(1);
    expect(action("Renvoyer quand même")).toBeUndefined();
    const at = new Date(uncertain.candidatePortalInvitation.occurredAt.getTime() + 10 * 60_000)
      .toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
    expect(pageText()).toContain(`« Renvoyer quand même » possible à ${at}, une fois le suivi vérifié.`);
  });

  it("ne le propose ni pour une invitation envoyée ni pour un espace actif", () => {
    state.applications = [
      dossier(1, { candidatePortalInvitation: { eventType: "email.sent", attempts: 1, failureCode: null, occurredAt: new Date(Date.now() - 3_600_000) } }),
      { ...uncertainSince(60), id: 2, lastName: "Candidat2", candidatePortalActive: true },
    ];
    open(1);
    expect(action("Renvoyer quand même")).toBeUndefined();
    open(2);
    expect(action("Renvoyer quand même")).toBeUndefined();
  });
});

describe("ADM-20 — analyse du CV chargée à l’ouverture de la carte", () => {
  it("ne la demande que pour la carte ouverte qui en a une, et l’affiche une fois reçue", () => {
    state.applications = [
      dossier(1, { analysisStatus: "completed", aiSummary: "Synthèse de la lecture du CV.", aiStrengths: JSON.stringify(["Expérience au bloc"]), aiMatchReasoning: "Justification du dossier." }),
      dossier(2),
    ];
    render();
    expect(state.detailRequests).toEqual([]);

    state.analysisLoading = true;
    open(1);
    let tree = render();
    expect(state.detailRequests.at(-1)).toEqual({ id: 1 });
    expect(tree.some(element => element.props.label === "Chargement de l’analyse du CV")).toBe(true);
    expect(textOf(tree)).not.toContain("Synthèse de la lecture du CV.");
    // The card's actions are there while its analysis loads.
    expect(action("Analyser le CV")).toBeDefined();
    expect(action("Effacer RGPD + preuve")).toBeDefined();

    state.analysisLoading = false;
    tree = render();
    expect(textOf(tree)).toContain("Synthèse de la lecture du CV.");
    expect(textOf(tree)).toContain("Expérience au bloc");
    expect(textOf(tree)).toContain("Justification du dossier.");

    // A dossier not analysed yet asks for nothing.
    open(2);
    state.detailRequests = [];
    render();
    expect(state.detailRequests).toEqual([]);
    expect(pageText()).toContain("L’analyse sera disponible après extraction du texte.");
  });

  it("« Actualiser » recharge aussi l’analyse de la carte ouverte, qu’une analyse terminée entre-temps a pu remplacer", () => {
    state.applications = [dossier(1, { analysisStatus: "completed", aiSummary: "Synthèse de la lecture du CV." })];
    open(1);
    state.utils.list.invalidate.mockClear();
    state.utils.detail.invalidate.mockClear();

    action("Actualiser")!.props.onClick();
    expect(state.utils.list.invalidate).toHaveBeenCalledTimes(1);
    expect(state.utils.detail.invalidate).toHaveBeenCalledTimes(1);
  });
});

describe("ADM-13 — profils de matching", () => {
  it("supprime un profil après confirmation et le retire du filtre s’il était choisi", () => {
    state.applications = [];
    state.profiles = [{ id: 7, name: "Golfe anesthésie", targetCountry: "Qatar", specialty: "Anesthésie", minimumScore: 70, requiredLanguages: JSON.stringify(["Anglais"]), requiredSkills: "[]" }];
    const profileSelect = () => render().find(element => element.type === "select" && textOf(element.props.children).includes("Tous les profils"))!;
    profileSelect().props.onChange({ target: { value: "7" } });
    expect(profileSelect().props.value).toBe("7");

    // Folded by default (ADM-20), behind « Gérer les profils ».
    expect(action("Supprimer")).toBeUndefined();
    render().find(element => element.props["aria-controls"] === "recruitment-profiles-panel")!.props.onClick();
    expect(pageText()).toContain("Anesthésie · Qatar · Anglais");
    // Each button names its profile for a screen reader.
    expect(action("Supprimer")!.props["aria-label"]).toBe("Supprimer le profil de matching Golfe anesthésie");

    action("Supprimer")!.props.onClick();
    expect(String(confirm.mock.calls[0]![0])).toContain("« Golfe anesthésie »");
    expect(mutate("profiles.delete")).not.toHaveBeenCalled();
    confirmAnswer = true;
    action("Supprimer")!.props.onClick();
    expect(mutate("profiles.delete").mock.calls).toEqual([[{ id: 7 }]]);

    state.mutations["profiles.delete"]!.options!.onSuccess!({ success: true }, { id: 7 });
    expect(state.toast.success).toHaveBeenCalledWith("Profil de matching supprimé");
    expect(profileSelect().props.value).toBe("");
  });
});
