import { BarChart3, CheckCircle2, Clock3, Loader2, MailWarning, UsersRound, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

function count(value: number | null | undefined) {
  return Number(value || 0);
}

export default function RecruitmentOperationsTab() {
  const utils = trpc.useUtils();
  const dashboard = trpc.admin.recruitment.dashboard.useQuery();
  const followUps = trpc.admin.recruitment.followUps.list.useQuery({ status: "suggested" });
  const updateFollowUp = trpc.admin.recruitment.followUps.update.useMutation({
    onSuccess: () => {
      toast.success("Relance mise à jour");
      utils.admin.recruitment.followUps.list.invalidate();
      utils.admin.recruitment.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (dashboard.isLoading) return <div className="flex items-center gap-2 py-14 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Chargement du pilotage recrutement…</div>;
  if (!dashboard.data) return <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-destructive">Les indicateurs de recrutement ne sont pas disponibles.</div>;

  const { candidateStats, campaignStats, deliveryStats, followUpStats, briefStats } = dashboard.data;
  const contacted = count(candidateStats.contacted);
  const responded = count(candidateStats.responded);
  const responseRate = contacted ? Math.round((responded / contacted) * 100) : 0;
  const cards = [
    { label: "CV reçus", value: count(candidateStats.total), note: `${count(candidateStats.analysesCompleted)} analyses terminées`, icon: UsersRound, tone: "text-primary" },
    { label: "Vivier consentant", value: count(candidateStats.marketingEligible), note: "contact marketing autorisé", icon: UsersRound, tone: "text-emerald-600 dark:text-emerald-300" },
    { label: "Réponses consignées", value: `${responseRate}%`, note: `${responded} réponse(s) pour ${contacted} contact(s)`, icon: BarChart3, tone: "text-violet-600 dark:text-violet-300" },
    { label: "Relances à revoir", value: count(followUpStats.due), note: `${count(followUpStats.pending)} suggestion(s) active(s)`, icon: Clock3, tone: "text-amber-600 dark:text-amber-300" },
    { label: "Délivrabilité", value: count(deliveryStats.delivered), note: `${count(deliveryStats.failed)} erreur(s) / rebond(s)`, icon: MailWarning, tone: "text-cyan-600 dark:text-cyan-300" },
    { label: "Missions actives", value: count(briefStats.active), note: `${count(briefStats.total)} brief(s) au total · ${count(campaignStats.sent)} campagne(s) envoyée(s)`, icon: BarChart3, tone: "text-rose-600 dark:text-rose-300" },
  ];

  return (
    <section className="space-y-7" aria-labelledby="recruitment-operations-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Hippocampus Consulting</p>
        <h2 id="recruitment-operations-heading" className="mt-2 text-2xl font-semibold text-foreground">Pilotage recrutement</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Indicateurs de suivi, délivrabilité et actions à préparer. Les relances ci-dessous sont uniquement des suggestions : aucun email n’est envoyé automatiquement.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(card => { const Icon = card.icon; return <article key={card.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><Icon className={`h-5 w-5 ${card.tone}`} /><p className="mt-4 text-3xl font-semibold text-foreground">{card.value}</p><h3 className="mt-1 font-medium text-foreground">{card.label}</h3><p className="mt-1 text-xs text-muted-foreground">{card.note}</p></article>; })}
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" /><div><h3 className="font-semibold text-foreground">Relances suggérées</h3><p className="text-sm text-muted-foreground">À traiter manuellement, après votre revue du candidat et du contexte de mission.</p></div></div>
        {followUps.isLoading ? <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div> : followUps.data?.length ? <div className="space-y-3">{followUps.data.map(task => {
          const overdue = new Date(task.dueAt).getTime() <= Date.now();
          return <article key={task.id} className="flex flex-col gap-3 rounded-xl border border-border p-4 md:flex-row md:items-center md:justify-between"><div><h4 className="font-semibold text-foreground">{task.firstName} {task.lastName} <span className="font-normal text-muted-foreground">· {task.specialty}</span></h4><p className="mt-1 text-sm text-muted-foreground">{task.kind === "follow_up_7" ? "Relance suggérée J+7" : task.kind === "follow_up_14" ? "Relance suggérée J+14" : "Relance personnalisée"} · échéance {new Date(task.dueAt).toLocaleDateString("fr-FR")}{overdue ? " · à revoir" : ""}</p>{task.notes ? <p className="mt-1 text-xs text-muted-foreground">{task.notes}</p> : null}</div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={updateFollowUp.isPending} onClick={() => updateFollowUp.mutate({ id: task.id, status: "dismissed" })}><XCircle className="mr-1 h-3.5 w-3.5" /> Ignorer</Button><Button size="sm" disabled={updateFollowUp.isPending} onClick={() => updateFollowUp.mutate({ id: task.id, status: "completed" })}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Traité</Button></div></article>;
        })}</div> : <p className="py-8 text-sm text-muted-foreground">Aucune relance suggérée active.</p>}
      </section>
    </section>
  );
}
