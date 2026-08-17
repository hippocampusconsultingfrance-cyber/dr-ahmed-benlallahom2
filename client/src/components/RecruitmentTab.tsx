import { useState } from "react";
import { BrainCircuit, Download, FileSearch, Loader2, RefreshCw, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

const statusOptions = [
  { value: "new", label: "Nouvelle" },
  { value: "reviewing", label: "En revue" },
  { value: "shortlisted", label: "Présélectionnée" },
  { value: "placed", label: "Positionnée" },
  { value: "rejected", label: "Refusée" },
  { value: "archived", label: "Archivée" },
] as const;

type Status = (typeof statusOptions)[number]["value"];

type ExtractedProfile = {
  professionalTitle?: string;
  specialties?: string[];
  skills?: string[];
  languages?: string[];
  countriesOfInterest?: string[];
  yearsExperience?: number | null;
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

export default function RecruitmentTab() {
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [countryFilter, setCountryFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading, error, refetch } = trpc.admin.recruitment.list.useQuery({
    status: statusFilter || undefined,
    country: countryFilter.trim() || undefined,
    specialty: specialtyFilter.trim() || undefined,
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
    onSuccess: ({ score }) => {
      toast.success(`Analyse IA terminée — score ${score}/100`);
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
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
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
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Chargement des candidatures…</div>
      ) : data?.items.length ? (
        <div className="space-y-3">
          {data.items.map(application => {
            const countries = parseJsonList(application.targetCountries);
            const languages = parseJsonList(application.languages);
            const strengths = parseJsonList(application.aiStrengths);
            const weaknesses = parseJsonList(application.aiWeaknesses);
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
                      </div>
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${scoreTone(application.aiScore)}`}>
                      {application.aiScore === null ? "IA en attente" : `Score IA ${application.aiScore}/100`}
                    </span>
                    <select aria-label={`Statut de ${application.firstName} ${application.lastName}`} value={application.status} disabled={updateStatus.isPending} onChange={event => updateStatus.mutate({ id: application.id, status: event.target.value as Status })} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
                      {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <Button size="sm" variant="outline" onClick={() => downloadCv.mutate({ id: application.id })} disabled={downloadCv.isPending}>
                      <Download className="mr-2 h-4 w-4" /> CV
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
                    </div>
                    <div className="space-y-1 text-muted-foreground">
                      <p><strong className="text-foreground">Fichier :</strong> {application.cvOriginalName} ({formatBytes(application.cvSizeBytes)})</p>
                      <p><strong className="text-foreground">Reçu le :</strong> {new Date(application.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>
                      <p><strong className="text-foreground">Conservation jusqu’au :</strong> {application.retentionUntil ? new Date(application.retentionUntil).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "—"}</p>
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
                        <Button size="sm" variant="outline" onClick={() => reanalyze.mutate({ id: application.id })} disabled={reanalyze.isPending}>
                          {reanalyze.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                          {application.aiAnalyzedAt ? "Relancer l’analyse" : "Analyser le CV"}
                        </Button>
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
    </section>
  );
}
