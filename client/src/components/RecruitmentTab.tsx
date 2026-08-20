import { useState } from "react";
import { BrainCircuit, ClipboardList, Download, FileSearch, Loader2, Mail, RefreshCw, Sparkles, Trash2, UserRound, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Candidate360Dialog from "./Candidate360Dialog";

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

type ExtractedProfile = {
  professionalTitle?: string;
  specialties?: string[];
  skills?: string[];
  languages?: string[];
  countriesOfInterest?: string[];
  yearsExperience?: number | null;
  normalizedExperiences?: Array<{ role?: string; organization?: string; startDate?: string | null; endDate?: string | null; employmentType?: string; durationMonths?: number | null }>;
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
    failed: "Analyse à relancer",
  };
  return labels[status || ""] || "Analyse en attente";
}

function analysisStatusTone(status: string | null | undefined) {
  if (status === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "needs_review") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "failed") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-primary/25 bg-primary/10 text-primary";
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

  const { data, isLoading, error, refetch } = trpc.admin.recruitment.list.useQuery({
    status: statusFilter || undefined,
    country: countryFilter.trim() || undefined,
    specialty: specialtyFilter.trim() || undefined,
    language: languageFilter.trim() || undefined,
    certification: certificationFilter.trim() || undefined,
    minimumScore: minimumScore ? Number(minimumScore) : undefined,
    profileId: selectedProfileId ? Number(selectedProfileId) : undefined,
  });

  const updateStatus = trpc.admin.recruitment.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Candidature mise à jour");
      utils.admin.recruitment.list.invalidate();
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
    onSuccess: () => {
      toast.success("Analyse IA mise en file : le profil sera actualisé automatiquement");
      utils.admin.recruitment.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const reanalyzeFailed = trpc.admin.recruitment.reanalyzeFailed.useMutation({
    onSuccess: ({ queued }) => {
      toast.success(`${queued} analyse${queued > 1 ? "s" : ""} IA mise${queued > 1 ? "s" : ""} en reprise contrôlée`);
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

  const openEmailComposer = (id: number, candidateName: string, template: RecruitmentEmailTemplate) => {
    setEmailComposer({ id, candidateName, template });
    setEmailLanguage("fr");
    setCustomRequest("");
  };

  const eraseApplication = trpc.admin.recruitment.erase.useMutation({
    onSuccess: () => {
      toast.success("Dossier candidat effacé");
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
          <Button variant="outline" onClick={() => reanalyzeFailed.mutate({ limit: 10 })} disabled={reanalyzeFailed.isPending}>
            <BrainCircuit className={`mr-2 h-4 w-4 ${reanalyzeFailed.isPending ? "animate-pulse" : ""}`} />
            Reprendre les échecs IA
          </Button>
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
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
      ) : data?.items.length ? (
        <div className="space-y-3">
          {data.items.map(application => {
            const countries = parseJsonList(application.targetCountries);
            const languages = parseJsonList(application.languages);
            const strengths = parseJsonList(application.aiStrengths);
            const weaknesses = parseJsonList(application.aiWeaknesses);
            const extractionWarnings = parseJsonList(application.extractionWarnings);
            const extracted = parseJsonObject(application.aiExtractedSkills);
            const expanded = expandedId === application.id;
            return (
              <article key={application.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
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
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${scoreTone(application.aiScore)}`}>
                      {application.aiScore === null ? "IA en attente" : `Score IA ${application.aiScore}/100`}
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
                      {application.analysisLastError && <p className="text-destructive"><strong>Dernière erreur :</strong> {application.analysisLastError}</p>}
                      {application.message && <p className="pt-2"><strong className="text-foreground">Message :</strong> {application.message}</p>}
                    </div>

                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 md:col-span-2">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="rounded-lg bg-primary/10 p-2 text-primary"><BrainCircuit className="h-5 w-5" /></span>
                          <div>
                            <h4 className="font-semibold text-foreground">Lecture intelligente du CV</h4>
                            <p className="text-xs text-muted-foreground">Aide à la revue humaine · aucune décision automatique</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => reanalyze.mutate({ id: application.id })} disabled={reanalyze.isPending || eraseApplication.isPending}>
                            {reanalyze.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                            {application.aiAnalyzedAt ? "Relancer l’analyse" : "Analyser le CV"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => sendPortalInvitation.mutate({ id: application.id })} disabled={Boolean(application.candidatePortalActive) || sendPortalInvitation.isPending || eraseApplication.isPending || reanalyze.isPending} title={application.candidatePortalActive ? "Cet email possède déjà un espace candidat actif." : "Envoyer une invitation sécurisée de création d’espace candidat."}>
                            {sendPortalInvitation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRoundPlus className="mr-2 h-4 w-4" />}
                            {application.candidatePortalActive ? "Espace candidat actif" : "Inviter à créer l’espace"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEmailComposer(application.id, `${application.firstName} ${application.lastName}`, "profile_interest")} disabled={sendTemplateEmail.isPending || eraseApplication.isPending || reanalyze.isPending}>
                            <Mail className="mr-2 h-4 w-4" /> Proposer un échange
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEmailComposer(application.id, `${application.firstName} ${application.lastName}`, "additional_information")} disabled={sendTemplateEmail.isPending || eraseApplication.isPending || reanalyze.isPending}>
                            <Mail className="mr-2 h-4 w-4" /> Demander un complément
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => { if (window.confirm("Confirmer l’effacement définitif du dossier candidat et de ses résultats IA ?")) eraseApplication.mutate({ id: application.id }); }} disabled={eraseApplication.isPending || reanalyze.isPending}>
                            {eraseApplication.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Effacer RGPD
                          </Button>
                        </div>
                      </div>

                      {application.aiSummary ? (
                        <div className="mt-4 space-y-4">
                          <p className="leading-6 text-foreground/90">{application.aiSummary}</p>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profil extrait</p>
                              <p className="text-foreground">{extracted.professionalTitle || "Titre non identifié"}</p>
                              <p className="text-muted-foreground">{extracted.specialties?.join(", ") || "Spécialités non identifiées"}</p>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compétences</p>
                              <p className="text-foreground">{extracted.skills?.join(", ") || "Compétences non identifiées"}</p>
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Points forts</p>
                              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{strengths.length ? strengths.map(item => <li key={item}>{item}</li>) : <li>Non renseigné</li>}</ul>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Points à vérifier</p>
                              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{weaknesses.length ? weaknesses.map(item => <li key={item}>{item}</li>) : <li>Non renseigné</li>}</ul>
                            </div>
                          </div>
                          {application.aiMatchReasoning && <p className="border-t border-primary/10 pt-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Justification du score :</strong> {application.aiMatchReasoning}</p>}
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
            );
          })}
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
