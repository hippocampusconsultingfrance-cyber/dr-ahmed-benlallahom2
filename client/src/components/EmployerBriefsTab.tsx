import { useMemo, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, ChevronRight, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { getPositiveMatchBreakdown } from "./matchBreakdown";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";

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
  const [matchPage, setMatchPage] = useState(0);
  const { data: briefs, isLoading, error } = trpc.admin.clientBriefs.list.useQuery();
  const matchesInput = useMemo(() => ({ briefId: selectedBriefId ?? 1, page: matchPage, limit: 25 }), [selectedBriefId, matchPage]);
  const matches = trpc.admin.clientBriefs.candidates.useQuery(
    matchesInput,
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
      if (selectedBriefId) utils.admin.clientBriefs.candidates.invalidate(matchesInput);
    },
    onError: error => toast.error(error.message),
  });
  const activeBrief = matches.data?.brief ?? null;

  if (isLoading) return <PublicContentSkeleton label="Chargement des briefs employeurs" />;
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
              <Button size="sm" variant="outline" onClick={() => { setSelectedBriefId(brief.id); setMatchPage(0); }}>
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
        {selectedBriefId && matches.isLoading && <PublicContentSkeleton cards={2} columns={2} label="Calcul des correspondances candidats" />}
        {matches.data && activeBrief && <>
          <div className="mb-5 border-b border-border pb-4"><p className="text-sm text-primary">{activeBrief.briefId}</p><h2 className="text-xl font-semibold text-foreground">{activeBrief.specialtyNeeded} — {activeBrief.country}</h2><p className="mt-1 text-sm text-muted-foreground">Les scores sont une aide à la revue humaine, pas une décision automatisée.</p></div>
          <div className="space-y-3">
            {matches.data.candidates.map(candidate => (
              <article key={candidate.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row">
                  <div><div className="flex items-center gap-2"><p className="font-medium text-foreground">{candidate.firstName} {candidate.lastName}</p><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{candidate.match.score}/100</span></div><p className="mt-1 text-sm text-muted-foreground">{candidate.specialty} · {candidate.availability || "Disponibilité à confirmer"}</p>{candidate.match.reasons.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">{candidate.match.reasons.join(" · ")}</p> : <p className="mt-2 text-xs text-muted-foreground">Aucune correspondance professionnelle explicite détectée.</p>}{getPositiveMatchBreakdown(candidate.match.breakdown).length > 0 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Détail du score de compatibilité">{getPositiveMatchBreakdown(candidate.match.breakdown).map(item => <span key={item.key} className="rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-medium text-foreground">{item.label} +{item.points}</span>)}</div>}</div>
                  <Button size="sm" disabled={associate.isPending} onClick={() => associate.mutate({ briefId: activeBrief.id, applicationId: candidate.id, matchScore: candidate.match.score, status: "shortlisted" })}>{candidate.association?.status === "shortlisted" ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Shortlisté</> : <>Shortlister<ChevronRight className="ml-1 h-3.5 w-3.5" /></>}</Button>
                </div>
              </article>
            ))}
            {matches.data.candidates.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Aucun candidat disponible pour le moment.</p>}
          </div>
          {matches.data.pagination.totalPages > 1 && <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Page {matches.data.pagination.page + 1} sur {matches.data.pagination.totalPages} · {matches.data.pagination.total} profil{matches.data.pagination.total > 1 ? "s" : ""} à examiner</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={matches.data.pagination.page === 0 || matches.isFetching} onClick={() => setMatchPage(current => Math.max(0, current - 1))}>Précédent</Button><Button size="sm" variant="outline" disabled={matches.data.pagination.page + 1 >= matches.data.pagination.totalPages || matches.isFetching} onClick={() => setMatchPage(current => current + 1)}>Suivant</Button></div></div>}
        </>}
      </section>
    </div>
  );
}
