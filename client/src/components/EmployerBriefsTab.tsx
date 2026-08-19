import { useState } from "react";
import { BriefcaseBusiness, CheckCircle2, ChevronRight, Loader2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { getPositiveMatchBreakdown } from "./matchBreakdown";

const statusLabels: Record<string, string> = {
  new: "Nouveau brief",
  reviewing: "Qualification en cours",
  shortlist_sent: "Shortlist envoyée",
  contract_signed: "Mission confirmée",
  closed: "Clôturée",
};

export default function EmployerBriefsTab() {
  const utils = trpc.useUtils();
  const [selectedBriefId, setSelectedBriefId] = useState<number | null>(null);
  const { data: briefs, isLoading, error } = trpc.admin.clientBriefs.list.useQuery();
  const matches = trpc.admin.clientBriefs.candidates.useQuery(
    { briefId: selectedBriefId ?? 1 },
    { enabled: selectedBriefId !== null },
  );
  const updateStatus = trpc.admin.clientBriefs.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Statut du brief mis à jour");
      utils.admin.clientBriefs.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const associate = trpc.admin.clientBriefs.associateCandidate.useMutation({
    onSuccess: () => {
      toast.success("Candidat ajouté à la shortlist");
      if (selectedBriefId) utils.admin.clientBriefs.candidates.invalidate({ briefId: selectedBriefId });
    },
    onError: error => toast.error(error.message),
  });
  const activeBrief = matches.data?.brief ?? null;

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(value => <div key={value} className="h-24 animate-pulse rounded-xl bg-card" />)}</div>;
  if (error) return <p className="py-8 text-center text-red-400">Erreur de chargement : {error.message}</p>;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="space-y-3">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Briefs Employeurs</h2>
            <p className="text-sm text-muted-foreground">{briefs?.length ?? 0} besoin(s) de mission reçu(s)</p>
          </div>
          <BriefcaseBusiness className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        {briefs?.map(brief => (
          <article key={brief.id} className={`rounded-xl border p-4 transition-colors ${selectedBriefId === brief.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{brief.organizationName}</p>
                <p className="mt-1 text-sm text-muted-foreground">{brief.specialtyNeeded} · {brief.country}</p>
                <p className="mt-1 text-xs text-muted-foreground">{brief.targetEnvironment} · {brief.timeline || "Calendrier à préciser"}</p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{statusLabels[brief.status] ?? brief.status}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedBriefId(brief.id)}>
                <UsersRound className="mr-1 h-3.5 w-3.5" />Voir les profils
              </Button>
              {brief.status === "new" && <Button size="sm" onClick={() => updateStatus.mutate({ id: brief.id, status: "reviewing" })}>Qualifier</Button>}
              {brief.status === "reviewing" && <Button size="sm" onClick={() => updateStatus.mutate({ id: brief.id, status: "shortlist_sent" })}>Shortlist envoyée</Button>}
            </div>
          </article>
        ))}
        {(!briefs || briefs.length === 0) && <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">Aucun brief Employeur à traiter.</p>}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        {!selectedBriefId && <div className="flex min-h-72 flex-col items-center justify-center text-center"><UsersRound className="mb-3 h-8 w-8 text-primary" /><h2 className="font-semibold text-foreground">Shortlist assistée</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">Sélectionnez un brief pour consulter les correspondances basées exclusivement sur la spécialité, la mobilité et les certifications déclarées.</p></div>}
        {selectedBriefId && matches.isLoading && <div className="flex min-h-72 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calcul des correspondances…</div>}
        {matches.data && activeBrief && <>
          <div className="mb-5 border-b border-border pb-4"><p className="text-sm text-primary">{activeBrief.briefId}</p><h2 className="text-xl font-semibold text-foreground">{activeBrief.specialtyNeeded} — {activeBrief.country}</h2><p className="mt-1 text-sm text-muted-foreground">Les scores sont une aide à la revue humaine, pas une décision automatisée.</p></div>
          <div className="space-y-3">
            {matches.data.candidates.slice(0, 25).map(candidate => (
              <article key={candidate.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row">
                  <div><div className="flex items-center gap-2"><p className="font-medium text-foreground">{candidate.firstName} {candidate.lastName}</p><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{candidate.match.score}/100</span></div><p className="mt-1 text-sm text-muted-foreground">{candidate.specialty} · {candidate.availability || "Disponibilité à confirmer"}</p>{candidate.match.reasons.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">{candidate.match.reasons.join(" · ")}</p> : <p className="mt-2 text-xs text-muted-foreground">Aucune correspondance professionnelle explicite détectée.</p>}{getPositiveMatchBreakdown(candidate.match.breakdown).length > 0 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Détail du score de compatibilité">{getPositiveMatchBreakdown(candidate.match.breakdown).map(item => <span key={item.key} className="rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-medium text-foreground">{item.label} +{item.points}</span>)}</div>}</div>
                  <Button size="sm" disabled={associate.isPending} onClick={() => associate.mutate({ briefId: activeBrief.id, applicationId: candidate.id, matchScore: candidate.match.score, status: "shortlisted" })}>{candidate.association?.status === "shortlisted" ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Shortlisté</> : <>Shortlister<ChevronRight className="ml-1 h-3.5 w-3.5" /></>}</Button>
                </div>
              </article>
            ))}
            {matches.data.candidates.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Aucun candidat disponible pour le moment.</p>}
          </div>
        </>}
      </section>
    </div>
  );
}
