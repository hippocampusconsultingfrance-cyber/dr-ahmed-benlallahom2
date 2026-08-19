import { useMemo, useState } from "react";
import { CheckSquare, Loader2, Mail, RefreshCw, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import PublicContentSkeleton from "./PublicContentSkeleton";

type VivierTabProps = {
  onCompose: (candidateIds: number[]) => void;
};

function parseJsonList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function scoreTone(score: number | null) {
  if (score === null) return "border-border bg-muted/30 text-muted-foreground";
  if (score >= 75) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (score >= 50) return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300";
}

export default function VivierTab({ onCompose }: VivierTabProps) {
  const [specialty, setSpecialty] = useState("");
  const [country, setCountry] = useState("");
  const [availability, setAvailability] = useState("");
  const [mobility, setMobility] = useState("");
  const [certification, setCertification] = useState("");
  const [minimumScore, setMinimumScore] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const filters = useMemo(() => ({
    specialty: specialty.trim() || undefined,
    country: country.trim() || undefined,
    availability: availability.trim() || undefined,
    mobility: mobility.trim() || undefined,
    certification: certification.trim() || undefined,
    minimumScore: minimumScore ? Number(minimumScore) : undefined,
    limit: 200,
  }), [specialty, country, availability, mobility, certification, minimumScore]);
  const { data: candidates, isLoading, error, refetch } = trpc.admin.recruitment.pool.list.useQuery(filters);
  const visibleIds = candidates?.map(candidate => candidate.id) || [];
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));

  const toggleCandidate = (candidateId: number) => {
    setSelectedIds(current => current.includes(candidateId) ? current.filter(id => id !== candidateId) : [...current, candidateId]);
  };

  const toggleVisible = () => {
    setSelectedIds(current => {
      if (allVisibleSelected) return current.filter(id => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  };

  const composeSelected = () => {
    if (!selectedIds.length) {
      toast.error("Sélectionnez au moins un candidat pour composer une campagne ciblée.");
      return;
    }
    onCompose(selectedIds);
  };

  if (error) return <div className="py-10 text-center text-destructive">Erreur de chargement du vivier : {error.message}</div>;

  return (
    <section className="space-y-6" aria-labelledby="vivier-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Hippocampus Consulting</p>
          <h2 id="vivier-heading" className="mt-2 text-2xl font-semibold text-foreground">Vivier de talents</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Seuls les candidats ayant donné leur consentement explicite aux communications de recrutement apparaissent dans cet espace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refetch()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
          <Button onClick={composeSelected} disabled={!selectedIds.length}>
            <Mail className="mr-2 h-4 w-4" /> Composer pour {selectedIds.length || "…"} profil{selectedIds.length > 1 ? "s" : ""}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card/60 p-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Spécialité</span>
          <input value={specialty} onChange={event => setSpecialty(event.target.value)} placeholder="Ex. anesthésie" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Pays ciblé</span>
          <input value={country} onChange={event => setCountry(event.target.value)} placeholder="Ex. Allemagne" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Disponibilité</span>
          <input value={availability} onChange={event => setAvailability(event.target.value)} placeholder="Ex. immédiate, septembre" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Mobilité</span>
          <input value={mobility} onChange={event => setMobility(event.target.value)} placeholder="Ex. Moyen-Orient, offshore" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Certification</span>
          <input value={certification} onChange={event => setCertification(event.target.value)} placeholder="Ex. ACLS, HUET" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Score IA minimum</span>
          <input type="number" min="0" max="100" value={minimumScore} onChange={event => setMinimumScore(event.target.value)} placeholder="Ex. 80" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm text-muted-foreground"><strong className="text-foreground">{candidates?.length || 0}</strong> profil{(candidates?.length || 0) > 1 ? "s" : ""} éligible{(candidates?.length || 0) > 1 ? "s" : ""} dans le vivier filtré.</p>
        <Button size="sm" variant="outline" onClick={toggleVisible} disabled={!visibleIds.length}>
          <CheckSquare className="mr-2 h-4 w-4" /> {allVisibleSelected ? "Désélectionner la liste" : "Sélectionner la liste"}
        </Button>
      </div>

      {isLoading ? (
        <PublicContentSkeleton cards={2} columns={2} label="Chargement du vivier de candidats" />
      ) : candidates?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {candidates.map(candidate => {
            const countries = parseJsonList(candidate.targetCountries);
            const languages = parseJsonList(candidate.languages);
            const selected = selectedIds.includes(candidate.id);
            return (
              <article key={candidate.id} className={`rounded-xl border bg-card p-4 shadow-sm transition-colors ${selected ? "border-primary ring-1 ring-primary/30" : "border-border"}`}>
                <div className="flex gap-3">
                  <input type="checkbox" aria-label={`Sélectionner ${candidate.firstName} ${candidate.lastName}`} checked={selected} onChange={() => toggleCandidate(candidate.id)} className="mt-1 h-4 w-4 accent-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-foreground">{candidate.firstName} {candidate.lastName}</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">{candidate.specialty}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${scoreTone(candidate.aiScore)}`}>{candidate.aiScore === null ? "Score IA indisponible" : `Score IA ${candidate.aiScore}/100`}</span>
                    </div>
                    <div className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                      <p><strong className="text-foreground">Pays :</strong> {countries.join(", ") || "—"}</p>
                      <p><strong className="text-foreground">Langues :</strong> {languages.join(", ") || "—"}</p>
                      <p><strong className="text-foreground">Disponibilité :</strong> {candidate.availability || "—"}</p>
                      <p><strong className="text-foreground">Mobilité :</strong> {candidate.mobility || "—"}</p>
                    </div>
                    {candidate.certifications && <p className="mt-3 text-xs text-muted-foreground"><strong className="text-foreground">Certifications :</strong> {candidate.certifications}</p>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <UsersRound className="mx-auto mb-3 h-8 w-8" /> Aucun candidat éligible ne correspond aux filtres actuels.
        </div>
      )}
    </section>
  );
}
