import { Fragment, useState } from "react";
import { BrainCircuit, ClipboardList, Download, FileSearch, Loader2, Mail, RefreshCw, Sparkles, Trash2, UserRound, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import AdminLoadMore from "@/components/AdminLoadMore";
import { adminListCount, adminPageOffsets, ADMIN_PAGE_SIZE, mergeAdminPages, updateAdminPageItem, useAdminPageCount } from "@/components/adminPagination";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Candidate360Dialog from "./Candidate360Dialog";
import { AI_ANALYSIS_UNAVAILABLE_LABEL, isAiAnalysisUnavailable, SCORE_UNAVAILABLE_EXPLANATION, SCORE_UNAVAILABLE_HEADING, scoredApplicationsFirst } from "./recruitmentScoreGroups";
import { contradictionEvidenceLabel, CV_READING_LABELS, CV_REVIEW_REMINDER, cvReadingTextForDisplay, fieldEvidenceStatusLabel, fieldEvidenceStatusTone } from "./recruitmentEvidenceLabels";
import {
  recruitmentDriveExportLabel,
  recruitmentDriveExportErrorLabel,
  recruitmentAnalysisErrorLabel,
  reanalysisToast,
  reanalyzeFailedToast,
  driveRetryToast,
  driveBatchRetryToast,
  googleDriveConnectionState,
  type AdminToast,
  recruitmentDriveExportTone,
  recruitmentCandidatePortalLabel,
  recruitmentEmailDeliveryErrorLabel,
  recruitmentEmailDeliveryLabel,
  recruitmentEmailDeliveryTone,
} from "@/lib/recruitmentTraceability";

const statusOptions = [
  { value: "new", label: "Nouvelle" },
  { value: "reviewing", label: "En revue" },
  { value: "shortlisted", label: "Présélectionnée" },
  { value: "placed", label: "Positionnée" },
  { value: "rejected", label: "Refusée" },
  { value: "archived", label: "Archivée" },
] as const;

type Status = (typeof statusOptions)[number]["value"];
type RecruitmentEmailTemplate = "profile_interest" | "additional_information";
const VERIFIED_ANALYSIS_VERSION = "recruitment-v7-verified-score";

type ExtractedProfile = {
  professionalTitle?: string;
  specialties?: string[];
  skills?: string[];
  verifiedSkills?: string[];
  languages?: string[];
  countriesOfInterest?: string[];
  yearsExperience?: number | null;
  normalizedExperiences?: Array<{ role?: string; organization?: string; startDate?: string | null; endDate?: string | null; employmentType?: string; durationMonths?: number | null; evidence?: string; sourceLocation?: string; confidence?: number; evidenceVerified?: boolean }>;
  fieldEvidence?: Array<{ field?: string; value?: string; evidence?: string; sourceLocation?: string; confidence?: number; evidenceVerified?: boolean }>;
  contradictions?: Array<{ field?: string; declaredValue?: string; documentValue?: string; evidence?: string; sourceLocation?: string; confidence?: number; evidenceVerified?: boolean }>;
  confidence?: number;
  evidenceCoverage?: number;
  requiredFollowUps?: string[];
  scoreBreakdown?: {
    specialtyMatch?: number;
    experienceEvidence?: number;
    skillsEvidence?: number;
    languageReadiness?: number;
    credentialReadiness?: number;
  };
};

function parseJsonList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string | null): ExtractedProfile {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formatBytes(value: number | null) {
  if (!value) return "—";
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function scoreTone(score: number | null) {
  if (score === null) return "border-border bg-muted/30 text-muted-foreground";
  if (score >= 75) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (score >= 50) return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300";
}

function analysisStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    queued: "Analyse en attente",
    extracting: "Extraction en cours",
    analyzing: "Analyse IA en cours",
    completed: "Analyse terminée",
    needs_review: "Revue humaine requise",
    degraded: "Revue manuelle · IA à reprendre",
    failed: "Analyse à relancer",
  };
  return labels[status || ""] || "Analyse en attente";
}

function analysisStatusTone(status: string | null | undefined) {
  if (status === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "needs_review" || status === "degraded") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "failed") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-primary/25 bg-primary/10 text-primary";
}

function showAdminToast(notice: AdminToast) {
  if (notice.tone === "success") toast.success(notice.message);
  else if (notice.tone === "warning") toast.warning(notice.message, { duration: 10_000 });
  else if (notice.tone === "error") toast.error(notice.message, { duration: 10_000 });
  else toast.info(notice.message);
}

const ERASURE_CONFIRMATION = "Effacer définitivement ce dossier ? Seront supprimés : le CV et ses copies (stockage et Google Drive), les analyses IA, les relances et historiques d’emails, la présence dans les missions, ainsi que l’espace candidat lié, ses sessions et ses documents. Seule une preuve d’effacement anonymisée est conservée. Action irréversible.";

function describeErasureReport(report: { storageObjectsDeleted: number; googleDrive: { status: string; deleted: number }; candidateAccountsErased: number; candidateDocumentsDeleted: number; rowsDeleted: Record<string, number>; otherApplicationsWithSameEmail: number }) {
  const derivedRows = Object.entries(report.rowsDeleted).filter(([table]) => table !== "cv_applications").reduce((total, [, count]) => total + count, 0);
  const parts = [
    `${report.storageObjectsDeleted} fichier(s) stocké(s) supprimé(s)`,
    report.googleDrive.status === "pending_retry" ? "copie Google Drive en attente de suppression" : `${report.googleDrive.deleted} copie(s) Google Drive supprimée(s)`,
    `${derivedRows} donnée(s) liée(s) supprimée(s)`,
    report.candidateAccountsErased ? `espace candidat supprimé (${report.candidateDocumentsDeleted} document(s))` : "aucun espace candidat lié",
  ];
  if (report.otherApplicationsWithSameEmail > 0) parts.push(`${report.otherApplicationsWithSameEmail} autre(s) candidature(s) avec le même email à traiter séparément`);
  return parts.join(" · ");
}

export default function RecruitmentTab() {
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [countryFilter, setCountryFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [certificationFilter, setCertificationFilter] = useState("");
  const [minimumScore, setMinimumScore] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [candidate360Id, setCandidate360Id] = useState<number | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileCountry, setProfileCountry] = useState("");
  const [profileSpecialty, setProfileSpecialty] = useState("");
  const [profileScore, setProfileScore] = useState("80");
  const [profileLanguages, setProfileLanguages] = useState("");
  const [profileSkills, setProfileSkills] = useState("");
  const [emailComposer, setEmailComposer] = useState<{ id: number; candidateName: string; template: RecruitmentEmailTemplate } | null>(null);
  const [emailLanguage, setEmailLanguage] = useState<"fr" | "en">("fr");
  const [customRequest, setCustomRequest] = useState("");
  const utils = trpc.useUtils();
  const profilesQuery = trpc.admin.recruitment.profiles.list.useQuery();
  const driveExportStatus = trpc.admin.recruitment.driveExport.status.useQuery();

  const filters = {
    status: statusFilter || undefined,
    country: countryFilter.trim() || undefined,
    specialty: specialtyFilter.trim() || undefined,
    language: languageFilter.trim() || undefined,
    certification: certificationFilter.trim() || undefined,
    minimumScore: minimumScore ? Number(minimumScore) : undefined,
    profileId: selectedProfileId ? Number(selectedProfileId) : undefined,
  };
  // ADM-01: 50 dossiers, then « Charger plus » (offset + 50), back to the first page when a filter changes.
  const { pageCount, loadMore } = useAdminPageCount(JSON.stringify(filters));
  const pages = trpc.useQueries(t => adminPageOffsets(pageCount).map(offset => t.admin.recruitment.list({ ...filters, limit: ADMIN_PAGE_SIZE, offset })));
  const { items: applications, total, isLoading, isLoadingMore, error, loadMoreError, retryLoadMore } = mergeAdminPages(pages);
  // With a score threshold, the dossiers without a verified score are listed apart, not dropped (INTL-02).
  const scoreThreshold = Math.max(Number(minimumScore) || 0, profilesQuery.data?.find(profile => String(profile.id) === selectedProfileId)?.minimumScore ?? 0);
  const listedApplications = scoreThreshold > 0
    ? scoredApplicationsFirst(applications, item => item.analysisPromptVersion === VERIFIED_ANALYSIS_VERSION ? item.aiScore : null)
    : { items: applications, firstUnscored: -1 };

  const updateStatus = trpc.admin.recruitment.updateStatus.useMutation({
    onSuccess: async (_result, input) => {
      toast.success("Candidature mise à jour");
      // ADM-01: with a status filter, the dossier may leave the list and shift the following pages,
      // which are all reloaded. Without one, nothing moves (the order and the other filters do not
      // depend on the status): the dossier is updated in the pages already loaded.
      if (filters.status) {
        void utils.admin.recruitment.list.invalidate();
        return;
      }
      const changes = { status: input.status, ...(input.adminNotes !== undefined ? { adminNotes: input.adminNotes || null } : {}) };
      for (const offset of adminPageOffsets(pageCount)) {
        const page = { ...filters, limit: ADMIN_PAGE_SIZE, offset };
        // A page still loading for the first time is left to its fetch. A refetch of a loaded page started
        // before the update (on window focus…) would bring the old status back over it: it is cancelled.
        if (!utils.admin.recruitment.list.getData(page)) continue;
        await utils.admin.recruitment.list.cancel(page);
        utils.admin.recruitment.list.setData(page, loaded => updateAdminPageItem(loaded, input.id, changes));
      }
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const downloadCv = trpc.admin.recruitment.getDownloadUrl.useMutation({
    onSuccess: ({ url, fileName }) => {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = fileName;
      link.click();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const reanalyze = trpc.admin.recruitment.reanalyze.useMutation({
    onSuccess: result => {
      showAdminToast(reanalysisToast(result));
      utils.admin.recruitment.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const reanalyzeFailed = trpc.admin.recruitment.reanalyzeFailed.useMutation({
    onSuccess: result => {
      showAdminToast(reanalyzeFailedToast(result));
      utils.admin.recruitment.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const retryDriveExport = trpc.admin.recruitment.driveExport.retry.useMutation({
    onSuccess: result => {
      showAdminToast(driveRetryToast(result));
      utils.admin.recruitment.list.invalidate();
      driveExportStatus.refetch();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const retryAllDriveExports = trpc.admin.recruitment.driveExport.retryAllFailed.useMutation({
    onSuccess: result => {
      showAdminToast(driveBatchRetryToast(result));
      utils.admin.recruitment.list.invalidate();
      driveExportStatus.refetch();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const retryConfirmationEmail = trpc.admin.recruitment.confirmationEmail.retry.useMutation({
    onSuccess: result => {
      if (result.outcome === "already_sent") toast.success("L’accusé de dépôt a déjà été envoyé");
      else if (result.outcome === "sent") toast.success("Accusé de dépôt renvoyé");
      else if (result.outcome === "delivery_unknown") toast.info("Réponse de Resend incertaine. Vérifiez le suivi avant tout nouvel envoi pour éviter un doublon.");
      else if (result.outcome === "failed") toast.error("Resend a refusé l’e-mail. Vérifiez la configuration et le suivi.");
      else toast.info("Aucun nouvel e-mail n’a été envoyé. Vérifiez le suivi de la candidature.");
      utils.admin.recruitment.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const createProfile = trpc.admin.recruitment.profiles.create.useMutation({
    onSuccess: () => {
      toast.success("Profil de matching enregistré");
      setProfileName("");
      profilesQuery.refetch();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const sendTemplateEmail = trpc.admin.recruitment.sendTemplateEmail.useMutation({
    onSuccess: () => {
      toast.success("Email envoyé au candidat");
      setEmailComposer(null);
      setCustomRequest("");
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const sendPortalInvitation = trpc.admin.recruitment.candidate.sendPortalInvitation.useMutation({
    onSuccess: () => {
      toast.success("Invitation de création d’espace candidat envoyée");
      utils.admin.recruitment.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  // Langue d’envoi présélectionnée d’après la langue du formulaire de candidature :
  // français pour « fr », anglais sinon, comme les emails automatiques (EN-02).
  const openEmailComposer = (id: number, candidateName: string, template: RecruitmentEmailTemplate, applicationLanguage?: string | null) => {
    setEmailComposer({ id, candidateName, template });
    setEmailLanguage(!applicationLanguage || applicationLanguage === "fr" ? "fr" : "en");
    setCustomRequest("");
  };

  const eraseApplication = trpc.admin.recruitment.erase.useMutation({
    onSuccess: result => {
      const summary = describeErasureReport(result);
      if (result.googleDrive.status === "pending_retry") {
        toast.warning("Dossier effacé ; la copie Google Drive sera supprimée automatiquement dès que Drive répondra (reconnexion peut-être nécessaire).", { description: summary, duration: 15_000 });
      } else {
        toast.success("Dossier effacé définitivement ; preuve RGPD anonymisée ajoutée au journal.", { description: summary, duration: 15_000 });
      }
      setExpandedId(null);
      utils.admin.recruitment.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  if (error) {
    return <div className="py-8 text-center text-red-400">Erreur de chargement : {error.message}</div>;
  }

  return (
    <section className="space-y-6" aria-labelledby="recruitment-heading">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Hippocampus Consulting</p>
          <h2 id="recruitment-heading" className="mt-2 text-2xl font-semibold text-foreground">Candidatures internationales</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Les CV sont conservés dans un stockage privé. L’analyse IA fournit une aide à la revue humaine et ne prend aucune décision automatique.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/google-drive/oauth/connect"
            className={googleDriveConnectionState(driveExportStatus.data).needsAttention
              ? "inline-flex h-9 items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
              : "inline-flex h-9 items-center rounded-md border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"}
            title={driveExportStatus.data?.lastError ? recruitmentDriveExportErrorLabel(driveExportStatus.data.lastError) ?? undefined : undefined}
          >
            {googleDriveConnectionState(driveExportStatus.data).label}
          </a>
          {driveExportStatus.data?.failedExports ? (
            <Button variant="outline" onClick={() => retryAllDriveExports.mutate()} disabled={retryAllDriveExports.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${retryAllDriveExports.isPending ? "animate-spin" : ""}`} />
              Relancer toutes les copies échouées ({driveExportStatus.data.failedExports})
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => reanalyzeFailed.mutate({ limit: 10 })} disabled={reanalyzeFailed.isPending}>
            <BrainCircuit className={`mr-2 h-4 w-4 ${reanalyzeFailed.isPending ? "animate-pulse" : ""}`} />
            Mettre à jour / reprendre l’IA
          </Button>
          <Button variant="outline" onClick={() => void utils.admin.recruitment.list.invalidate()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card/60 p-4 md:grid-cols-3">
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Statut</span>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as Status | "")} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
            <option value="">Tous les statuts</option>
            {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Spécialité</span>
          <input value={specialtyFilter} onChange={event => setSpecialtyFilter(event.target.value)} placeholder="Ex. anesthésie" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Pays ciblé</span>
          <input value={countryFilter} onChange={event => setCountryFilter(event.target.value)} placeholder="Ex. Allemagne" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Langue</span>
          <input value={languageFilter} onChange={event => setLanguageFilter(event.target.value)} placeholder="Ex. anglais" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Certification</span>
          <input value={certificationFilter} onChange={event => setCertificationFilter(event.target.value)} placeholder="Ex. ACLS, ATLS" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Score IA minimum</span>
          <input type="number" min="0" max="100" value={minimumScore} onChange={event => setMinimumScore(event.target.value)} placeholder="Ex. 80" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Profil de matching</span>
          <select value={selectedProfileId} onChange={event => setSelectedProfileId(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
            <option value="">Tous les profils</option>
            {profilesQuery.data?.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.minimumScore}+</option>)}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Profils de matching</h3>
            <p className="text-xs text-muted-foreground">Les profils servent à prioriser la revue humaine ; ils ne décident jamais d’un recrutement.</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-6">
          <input value={profileName} onChange={event => setProfileName(event.target.value)} placeholder="Nom du profil" className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground md:col-span-2" />
          <input value={profileCountry} onChange={event => setProfileCountry(event.target.value)} placeholder="Pays" className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground" />
          <input value={profileSpecialty} onChange={event => setProfileSpecialty(event.target.value)} placeholder="Spécialité" className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground" />
          <input type="number" min="0" max="100" value={profileScore} onChange={event => setProfileScore(event.target.value)} placeholder="Score min." className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground" />
          <Button disabled={!profileName.trim() || createProfile.isPending} onClick={() => createProfile.mutate({ name: profileName.trim(), targetCountry: profileCountry.trim() || undefined, specialty: profileSpecialty.trim() || undefined, minimumScore: Number(profileScore) || 0, requiredLanguages: profileLanguages.split(",").map(value => value.trim()).filter(Boolean), requiredSkills: profileSkills.split(",").map(value => value.trim()).filter(Boolean) })}>
            {createProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Enregistrer
          </Button>
          <input value={profileLanguages} onChange={event => setProfileLanguages(event.target.value)} placeholder="Langues requises, séparées par virgule" className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground md:col-span-3" />
          <input value={profileSkills} onChange={event => setProfileSkills(event.target.value)} placeholder="Compétences requises, séparées par virgule" className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground md:col-span-3" />
        </div>
      </div>

      {isLoading ? (
        <PublicContentSkeleton label="Chargement des candidatures" />
      ) : applications.length ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{adminListCount(applications.length, total, "candidature(s)")}</p>
          {listedApplications.items.map((application, index) => {
            const countries = parseJsonList(application.targetCountries);
            const languages = parseJsonList(application.languages);
            const strengths = parseJsonList(application.aiStrengths);
            const weaknesses = parseJsonList(application.aiWeaknesses);
            const extractionWarnings = parseJsonList(application.extractionWarnings);
            const extracted = parseJsonObject(application.aiExtractedSkills);
            const hasVerifiedAnalysis = application.analysisPromptVersion === VERIFIED_ANALYSIS_VERSION;
            const verifiedScore = hasVerifiedAnalysis ? application.aiScore : null;
            const expanded = expandedId === application.id;
            return (
              <Fragment key={application.id}>
              {index === listedApplications.firstUnscored ? (
                <div className="border-t border-border pt-4">
                  <h3 className="font-semibold text-foreground">{SCORE_UNAVAILABLE_HEADING}</h3>
                  <p className="text-xs text-muted-foreground">{SCORE_UNAVAILABLE_EXPLANATION}</p>
                </div>
              ) : null}
              <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <button type="button" onClick={() => setExpandedId(expanded ? null : application.id)} className="min-w-0 text-left">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 rounded-full bg-primary/10 p-2 text-primary"><UserRound className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground">{application.firstName} {application.lastName}</h3>
                        <p className="text-sm text-muted-foreground">{application.specialty} · {application.trackingId}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{countries.join(", ") || "Pays non précisés"}</p>
                        {application.diplomaCountry ? <p className="mt-1 text-sm text-muted-foreground">Diplôme obtenu : {application.diplomaCountry}</p> : null}
                      </div>
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${scoreTone(verifiedScore)}`}>
                      {verifiedScore === null ? (isAiAnalysisUnavailable(application) ? AI_ANALYSIS_UNAVAILABLE_LABEL : application.aiSummary ? (hasVerifiedAnalysis ? SCORE_UNAVAILABLE_HEADING : "Score à recalculer") : "IA en attente") : `Score IA ${verifiedScore}/100`}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${analysisStatusTone(application.analysisStatus)}`}>
                      {analysisStatusLabel(application.analysisStatus)}
                    </span>
                    <select aria-label={`Statut de ${application.firstName} ${application.lastName}`} value={application.status} disabled={updateStatus.isPending} onChange={event => updateStatus.mutate({ id: application.id, status: event.target.value as Status })} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
                      {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                          <Button size="sm" variant="outline" onClick={() => downloadCv.mutate({ id: application.id })} disabled={downloadCv.isPending}>
                            <Download className="mr-2 h-4 w-4" /> CV
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setCandidate360Id(application.id)}>
                            <ClipboardList className="mr-2 h-4 w-4" /> Fiche 360°
                          </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 grid gap-4 border-t border-border pt-4 text-sm md:grid-cols-2">
                    <div className="space-y-1 text-muted-foreground">
                      <p><strong className="text-foreground">Email :</strong> {application.email}</p>
                      <p><strong className="text-foreground">Téléphone :</strong> {application.phone || "—"}</p>
                      <p><strong className="text-foreground">Langues déclarées :</strong> {languages.join(", ") || "—"}</p>
                      <p><strong className="text-foreground">Expérience déclarée :</strong> {application.yearsExperience ?? "—"} ans</p>
                      <p><strong className="text-foreground">Disponibilité :</strong> {application.availability || "—"}</p>
                      <p><strong className="text-foreground">Mobilité :</strong> {application.mobility || "—"}</p>
                      <p><strong className="text-foreground">Certifications :</strong> {application.certifications || "—"}</p>
                    </div>
                    <div className="space-y-1 text-muted-foreground">
                      <p><strong className="text-foreground">Fichier :</strong> {application.cvOriginalName} ({formatBytes(application.cvSizeBytes)})</p>
                      <p><strong className="text-foreground">Contrôle du fichier :</strong> {application.fileValidationStatus === "accepted" ? "validé" : application.fileValidationStatus || "en attente"}{application.fileSecurityScanVersion ? ` · ${application.fileSecurityScanVersion}` : ""}</p>
                      <p><strong className="text-foreground">Reçu le :</strong> {new Date(application.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>
                      <p><strong className="text-foreground">Conservation jusqu’au :</strong> {application.retentionUntil ? new Date(application.retentionUntil).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "—"}</p>
                      <p><strong className="text-foreground">Pipeline :</strong> {analysisStatusLabel(application.analysisStatus)} · tentative {application.analysisAttempts ?? 0}</p>
                      {application.analysisModel && <p><strong className="text-foreground">Analyse :</strong> {application.analysisModel} · {application.analysisPromptVersion || "version non renseignée"}</p>}
                      {application.extractionMethod && <p><strong className="text-foreground">Extraction :</strong> {application.extractionMethod}{application.extractionTotalPages ? ` · ${application.extractionTotalPages} page${application.extractionTotalPages > 1 ? "s" : ""}` : ""}</p>}
                      {application.ocrModelVersion && <p><strong className="text-foreground">OCR :</strong> {application.ocrModelVersion}{application.ocrConfidence !== null ? ` · confiance ${application.ocrConfidence}%` : ""}</p>}
                      {application.analysisLastError && <p className="text-destructive" title={application.analysisLastError}><strong>Dernière erreur :</strong> {recruitmentAnalysisErrorLabel(application.analysisLastError)}</p>}
                      {application.message && <p className="pt-2"><strong className="text-foreground">Message :</strong> {application.message}</p>}
                    </div>

                    <div className="rounded-xl border border-border bg-background/60 p-4 md:col-span-2" aria-label={`Traçabilité de la candidature ${application.trackingId}`}>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <h4 className="font-semibold text-foreground">Traçabilité du dépôt</h4>
                          <p className="text-xs text-muted-foreground">Contrôle de bout en bout, du formulaire jusqu’aux traitements externes.</p>
                        </div>
                        <span className="text-xs text-muted-foreground">Référence {application.trackingId}</span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                          <p className="text-xs font-medium text-muted-foreground">Base de données</p>
                          <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">Enregistrée</p>
                        </div>
                        <div className={`rounded-lg border p-3 ${recruitmentEmailDeliveryTone(application.emailDelivery?.eventType)}`}>
                          <p className="text-xs font-medium opacity-80">Dernier e-mail candidat</p>
                          <p className="mt-1 font-semibold">{recruitmentEmailDeliveryLabel(application.emailDelivery?.eventType)}</p>
                          {application.emailDelivery?.attempts ? <p className="mt-1 text-xs opacity-80">Tentative {application.emailDelivery.attempts}/3</p> : null}
                          {recruitmentEmailDeliveryErrorLabel(application.emailDelivery?.failureCode) ? <p className="mt-1 text-xs opacity-90">{recruitmentEmailDeliveryErrorLabel(application.emailDelivery?.failureCode)}</p> : null}
                          {application.emailDelivery?.eventType === "email.failed" || !application.emailDelivery?.eventType ? (
                            <Button size="sm" variant="outline" className="mt-2 h-8" onClick={() => {
                              const untracked = !application.emailDelivery?.eventType;
                              if (untracked && !window.confirm("Aucune preuve d’envoi n’est disponible. Confirmez l’envoi de l’accusé de dépôt ; un doublon reste possible si le premier e-mail a été accepté sans être journalisé.")) return;
                              retryConfirmationEmail.mutate({ id: application.id });
                            }} disabled={retryConfirmationEmail.isPending}>
                              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${retryConfirmationEmail.isPending ? "animate-spin" : ""}`} />
                              {application.emailDelivery?.eventType === "email.failed" ? "Renvoyer l’accusé" : "Envoyer l’accusé"}
                            </Button>
                          ) : null}
                        </div>
                        <div className={`rounded-lg border p-3 ${recruitmentDriveExportTone(application.driveExport?.status)}`}>
                          <p className="text-xs font-medium opacity-80">Google Drive</p>
                          <p className="mt-1 font-semibold">{recruitmentDriveExportLabel(application.driveExport?.status)}</p>
                          {application.driveExport ? <p className="mt-1 text-xs opacity-80">Tentative {application.driveExport.attempts}/{application.driveExport.maxAttempts}</p> : null}
                          {recruitmentDriveExportErrorLabel(application.driveExport?.lastError) ? <p className="mt-1 text-xs opacity-90">{recruitmentDriveExportErrorLabel(application.driveExport?.lastError)}</p> : null}
                          {application.driveExport?.driveFileUrl ? <a href={application.driveExport.driveFileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-xs font-medium underline underline-offset-2">Ouvrir le CV dans Drive</a> : null}
                          {application.driveExport?.status === "failed" || !application.driveExport ? (
                            <Button size="sm" variant="outline" className="mt-2 h-8" onClick={() => retryDriveExport.mutate({ id: application.id })} disabled={retryDriveExport.isPending}>
                              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${retryDriveExport.isPending ? "animate-spin" : ""}`} />
                              {application.driveExport?.status === "failed" ? "Relancer la copie" : "Planifier la copie"}
                            </Button>
                          ) : null}
                        </div>
                        <div className={`rounded-lg border p-3 ${analysisStatusTone(application.analysisStatus)}`}>
                          <p className="text-xs font-medium opacity-80">Lecture intelligente</p>
                          <p className="mt-1 font-semibold">{analysisStatusLabel(application.analysisStatus)}</p>
                          <p className="mt-1 text-xs opacity-80">Tentative {application.analysisAttempts ?? 0}</p>
                        </div>
                        <div className={`rounded-lg border p-3 ${recruitmentEmailDeliveryTone(application.candidatePortalActive ? "email.delivered" : application.candidatePortalActivation?.eventType || application.candidatePortalInvitation?.eventType)}`}>
                          <p className="text-xs font-medium opacity-80">Espace candidat</p>
                          <p className="mt-1 font-semibold">{recruitmentCandidatePortalLabel(Boolean(application.candidatePortalActive), application.candidatePortalInvitation?.eventType, application.candidatePortalActivation?.eventType)}</p>
                          {!application.candidatePortalActive && application.candidatePortalActivation?.attempts ? <p className="mt-1 text-xs opacity-80">Activation {application.candidatePortalActivation.attempts}</p> : null}
                          {!application.candidatePortalActive && recruitmentEmailDeliveryErrorLabel(application.candidatePortalActivation?.failureCode) ? <p className="mt-1 text-xs opacity-90">{recruitmentEmailDeliveryErrorLabel(application.candidatePortalActivation?.failureCode)}</p> : null}
                          {!application.candidatePortalActive && application.candidatePortalInvitation?.attempts ? <p className="mt-1 text-xs opacity-80">Envoi {application.candidatePortalInvitation.attempts}</p> : null}
                          {!application.candidatePortalActive && recruitmentEmailDeliveryErrorLabel(application.candidatePortalInvitation?.failureCode) ? <p className="mt-1 text-xs opacity-90">{recruitmentEmailDeliveryErrorLabel(application.candidatePortalInvitation?.failureCode)}</p> : null}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 md:col-span-2">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="rounded-lg bg-primary/10 p-2 text-primary"><BrainCircuit className="h-5 w-5" /></span>
                          <div>
                            <h4 className="font-semibold text-foreground">Lecture intelligente du CV</h4>
                            <p className="text-xs text-muted-foreground">Aide à la revue humaine · aucune décision automatique</p>
                            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">{CV_REVIEW_REMINDER}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => reanalyze.mutate({ id: application.id })} disabled={reanalyze.isPending || eraseApplication.isPending}>
                            {reanalyze.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                            {application.aiAnalyzedAt ? "Relancer l’analyse" : "Analyser le CV"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => sendPortalInvitation.mutate({ id: application.id })} disabled={Boolean(application.candidatePortalActive) || sendPortalInvitation.isPending || eraseApplication.isPending || reanalyze.isPending} title={application.candidatePortalActive ? "Cet email possède déjà un espace candidat actif." : "Envoyer une invitation sécurisée de création d’espace candidat."}>
                            {sendPortalInvitation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRoundPlus className="mr-2 h-4 w-4" />}
                            {application.candidatePortalActive ? "Espace candidat actif" : application.candidatePortalInvitation?.eventType ? "Renvoyer l’invitation" : "Inviter à créer l’espace"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEmailComposer(application.id, `${application.firstName} ${application.lastName}`, "profile_interest", application.language)} disabled={sendTemplateEmail.isPending || eraseApplication.isPending || reanalyze.isPending}>
                            <Mail className="mr-2 h-4 w-4" /> Proposer un échange
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEmailComposer(application.id, `${application.firstName} ${application.lastName}`, "additional_information", application.language)} disabled={sendTemplateEmail.isPending || eraseApplication.isPending || reanalyze.isPending}>
                            <Mail className="mr-2 h-4 w-4" /> Demander un complément
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => { if (window.confirm(ERASURE_CONFIRMATION)) eraseApplication.mutate({ id: application.id }); }} disabled={eraseApplication.isPending || reanalyze.isPending}>
                            {eraseApplication.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Effacer RGPD + preuve
                          </Button>
                        </div>
                      </div>

                      {application.aiSummary ? (
                        <div className="mt-4 space-y-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CV_READING_LABELS.summary}</p>
                          <p className="leading-6 text-foreground/90">{cvReadingTextForDisplay(application.aiSummary)}</p>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CV_READING_LABELS.profile}</p>
                              <p className="text-foreground">{extracted.professionalTitle || "Titre non identifié"}</p>
                              <p className="text-muted-foreground">{extracted.specialties?.join(", ") || "Spécialités non identifiées"}</p>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CV_READING_LABELS.skills}</p>
                              <p className="text-foreground">{extracted.verifiedSkills?.join(", ") || CV_READING_LABELS.noSkills}</p>
                            </div>
                          </div>
                          {(typeof extracted.confidence === "number" || typeof extracted.evidenceCoverage === "number") && (
                            <div className="grid gap-3 rounded-lg border border-primary/10 bg-background/50 p-3 sm:grid-cols-2">
                              <p className="text-muted-foreground"><strong className="text-foreground">Confiance de lecture :</strong> {typeof extracted.confidence === "number" ? `${extracted.confidence}%` : "—"}</p>
                              <p className="text-muted-foreground"><strong className="text-foreground">Couverture des preuves :</strong> {typeof extracted.evidenceCoverage === "number" ? `${extracted.evidenceCoverage}%` : "—"}</p>
                            </div>
                          )}
                          {verifiedScore !== null && extracted.scoreBreakdown && (
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Détail du score professionnel</p>
                              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
                                <p>Spécialité <strong className="text-foreground">{extracted.scoreBreakdown.specialtyMatch ?? 0}/30</strong></p>
                                <p>Expérience <strong className="text-foreground">{extracted.scoreBreakdown.experienceEvidence ?? 0}/25</strong></p>
                                <p>Compétences <strong className="text-foreground">{extracted.scoreBreakdown.skillsEvidence ?? 0}/20</strong></p>
                                <p>Langues <strong className="text-foreground">{extracted.scoreBreakdown.languageReadiness ?? 0}/15</strong></p>
                                <p>{CV_READING_LABELS.credentials} <strong className="text-foreground">{extracted.scoreBreakdown.credentialReadiness ?? 0}/10</strong></p>
                              </div>
                            </div>
                          )}
                          {extracted.fieldEvidence && extracted.fieldEvidence.length > 0 && (
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preuves issues du CV</p>
                              <div className="space-y-2">
                                {extracted.fieldEvidence.slice(0, 16).map((item, index) => (
                                  <div key={`${item.field}-${item.value}-${index}`} className="rounded-lg border border-primary/10 bg-background/50 p-3 text-xs">
                                    <p className="font-medium text-foreground">{item.value || "Information extraite"}</p>
                                    <p className="mt-1 text-muted-foreground">« {item.evidence || "Preuve non fournie"} »</p>
                                    <p className="mt-1 text-muted-foreground">Source : {item.sourceLocation || "non localisée"} · confiance {typeof item.confidence === "number" ? `${item.confidence}%` : "—"}</p>
                                    <p className={`mt-1 font-medium ${fieldEvidenceStatusTone(item)}`}>
                                      {fieldEvidenceStatusLabel(item)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {extracted.contradictions && extracted.contradictions.length > 0 && (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">Contradictions à vérifier humainement</p>
                              <ul className="space-y-2 text-xs text-amber-900 dark:text-amber-100">
                                {extracted.contradictions.map((item, index) => (
                                  <li key={`${item.field}-${index}`}>
                                    <strong>{item.field || "Champ"} :</strong> formulaire « {item.declaredValue || "—"} » / CV « {item.documentValue || "—"} » — {item.sourceLocation || "source non localisée"}
                                    <span className="ml-1 font-medium">({contradictionEvidenceLabel(item.evidenceVerified)})</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CV_READING_LABELS.strengths}</p>
                              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{strengths.length ? strengths.map(item => <li key={item}>{cvReadingTextForDisplay(item)}</li>) : <li>Non renseigné</li>}</ul>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Points à vérifier</p>
                              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{weaknesses.length ? weaknesses.map(item => <li key={item}>{item}</li>) : <li>Non renseigné</li>}</ul>
                            </div>
                          </div>
                          {application.aiMatchReasoning && <p className="border-t border-primary/10 pt-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">{verifiedScore === null ? "Conclusion de l’analyse :" : "Justification du score :"}</strong> {cvReadingTextForDisplay(application.aiMatchReasoning)}</p>}
                          {extractionWarnings.length > 0 && <p className="border-t border-primary/10 pt-3 text-xs leading-5 text-amber-700 dark:text-amber-300"><strong>Qualité d’extraction :</strong> {extractionWarnings.join(" · ")}</p>}
                          {application.aiAnalyzedAt && <p className="text-[11px] text-muted-foreground">Analysé le {new Date(application.aiAnalyzedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-muted-foreground">L’analyse sera disponible après extraction du texte. Les formats DOC historiques nécessitent une vérification manuelle.</p>
                      )}
                    </div>

                    <label className="space-y-1 text-sm text-muted-foreground md:col-span-2">
                      <span>Note interne</span>
                      <textarea defaultValue={application.adminNotes ?? ""} onBlur={event => { const value = event.target.value.trim(); if (value !== (application.adminNotes ?? "")) updateStatus.mutate({ id: application.id, status: application.status as Status, adminNotes: value }); }} className="min-h-20 w-full rounded-md border border-border bg-background p-3 text-foreground" maxLength={5000} />
                    </label>
                  </div>
                )}
              </article>
              </Fragment>
            );
          })}
          <AdminLoadMore shown={applications.length} total={total} loading={isLoadingMore} onLoadMore={loadMore} error={loadMoreError} onRetry={retryLoadMore} />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <FileSearch className="mx-auto mb-3 h-8 w-8" />
          Aucune candidature ne correspond aux filtres.
        </div>
      )}

      <Dialog open={Boolean(emailComposer)} onOpenChange={open => { if (!open && !sendTemplateEmail.isPending) setEmailComposer(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Composer un email candidat</DialogTitle>
            <DialogDescription>
              {emailComposer ? `Message individuel à ${emailComposer.candidateName}.` : "Préparez un message individuel."}
            </DialogDescription>
          </DialogHeader>
          {emailComposer && (
            <div className="space-y-4 py-2">
              <label className="block space-y-1 text-sm text-muted-foreground">
                <span>Type de message</span>
                <select value={emailComposer.template} onChange={event => setEmailComposer(current => current ? { ...current, template: event.target.value as RecruitmentEmailTemplate } : current)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
                  <option value="profile_interest">Proposer un échange</option>
                  <option value="additional_information">Demander un complément</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm text-muted-foreground">
                <span>Langue d’envoi</span>
                <select value={emailLanguage} onChange={event => setEmailLanguage(event.target.value as "fr" | "en")} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </label>
              {emailComposer.template === "additional_information" && (
                <label className="block space-y-1 text-sm text-muted-foreground">
                  <span>Précisions à demander au candidat</span>
                  <textarea value={customRequest} onChange={event => setCustomRequest(event.target.value)} maxLength={3000} placeholder="Ex. Merci de transmettre votre attestation d’inscription à l’ordre, vos diplômes et vos disponibilités." className="min-h-32 w-full rounded-md border border-border bg-background p-3 text-foreground placeholder:text-muted-foreground" />
                  <span className="text-xs">Ce texte libre sera ajouté au message dans la langue choisie.</span>
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailComposer(null)} disabled={sendTemplateEmail.isPending}>Annuler</Button>
            <Button disabled={!emailComposer || sendTemplateEmail.isPending} onClick={() => emailComposer && sendTemplateEmail.mutate({ id: emailComposer.id, template: emailComposer.template, language: emailLanguage, customRequest: emailComposer.template === "additional_information" ? customRequest.trim() || undefined : undefined })}>
              {sendTemplateEmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Envoyer l’email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Candidate360Dialog applicationId={candidate360Id} onOpenChange={open => { if (!open) setCandidate360Id(null); }} />
    </section>
  );
}
