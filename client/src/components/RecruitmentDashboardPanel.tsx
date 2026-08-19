import { AlertTriangle, BarChart3, CheckCircle2, Clock3, MailCheck, Send, UserRound, UsersRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { nonNegativeCount, percentageLabel } from "./recruitmentDashboardMetrics";
import PublicContentSkeleton from "./PublicContentSkeleton";

type MetricCardProps = {
  icon: typeof UserRound;
  label: string;
  value: string | number;
  detail: string;
  tone: string;
};

function MetricCard({ icon: Icon, label, value, detail, tone }: MetricCardProps) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <span className="text-2xl font-semibold tracking-tight text-foreground">{value}</span>
      </div>
      <h3 className="mt-4 text-sm font-medium text-foreground">{label}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

export default function RecruitmentDashboardPanel() {
  const { data, isLoading, error } = trpc.admin.recruitment.dashboard.useQuery();

  if (error) {
    return <section className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive" aria-live="polite">Les indicateurs recrutement ne sont pas disponibles : {error.message}</section>;
  }

  if (isLoading || !data) {
    return <section aria-label="Chargement des indicateurs recrutement"><PublicContentSkeleton cards={4} columns={4} label="Chargement des indicateurs recrutement" /></section>;
  }

  const candidates = data.candidateStats;
  const campaigns = data.campaignStats;
  const delivery = data.deliveryStats;
  const totalCandidates = nonNegativeCount(candidates.total);
  const marketingEligible = nonNegativeCount(candidates.marketingEligible);
  const contacted = nonNegativeCount(candidates.contacted);
  const responded = nonNegativeCount(candidates.responded);
  const totalCampaigns = nonNegativeCount(campaigns.total);
  const sentCampaigns = nonNegativeCount(campaigns.sent);

  const analysisStates = [
    { label: "En attente", value: nonNegativeCount(candidates.analysesQueued), icon: Clock3, tone: "bg-slate-500/10 text-slate-500" },
    { label: "En cours", value: nonNegativeCount(candidates.analysesInProgress), icon: BarChart3, tone: "bg-sky-500/10 text-sky-500" },
    { label: "À revue humaine", value: nonNegativeCount(candidates.analysesNeedsReview), icon: UsersRound, tone: "bg-amber-500/10 text-amber-500" },
    { label: "Terminées", value: nonNegativeCount(candidates.analysesCompleted), icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-500" },
    { label: "En échec", value: nonNegativeCount(candidates.analysesFailed), icon: AlertTriangle, tone: "bg-destructive/10 text-destructive" },
  ];

  return (
    <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6" aria-labelledby="recruitment-dashboard-title">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Hippocampus Consulting</p>
          <h2 id="recruitment-dashboard-title" className="mt-1 text-xl font-semibold text-foreground">Pilotage recrutement</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Vue consolidée des candidatures, consentements, analyses assistées et activités de campagnes. Les ratios sont indicatifs et n’automatisent aucune décision.</p>
        </div>
        <div className="rounded-full border border-primary/25 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground"><span className="font-semibold text-foreground">{nonNegativeCount(data.followUpStats.due)}</span> relance{nonNegativeCount(data.followUpStats.due) > 1 ? "s" : ""} manuelle{nonNegativeCount(data.followUpStats.due) > 1 ? "s" : ""} à examiner</div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={UserRound} label="CV enregistrés" value={totalCandidates} detail="Volume total de candidatures conservées." tone="bg-primary/10 text-primary" />
        <MetricCard icon={UsersRound} label="Consentements marketing" value={percentageLabel(marketingEligible, totalCandidates)} detail={`${marketingEligible} candidat${marketingEligible > 1 ? "s" : ""} éligible${marketingEligible > 1 ? "s" : ""} au vivier.`} tone="bg-violet-500/10 text-violet-500" />
        <MetricCard icon={MailCheck} label="Taux de réponse" value={percentageLabel(responded, contacted)} detail={`${responded} réponse${responded > 1 ? "s" : ""} pour ${contacted} profil${contacted > 1 ? "s" : ""} contacté${contacted > 1 ? "s" : ""}.`} tone="bg-cyan-500/10 text-cyan-500" />
        <MetricCard icon={Send} label="Campagnes" value={sentCampaigns} detail={`${totalCampaigns} campagne${totalCampaigns > 1 ? "s" : ""} créée${totalCampaigns > 1 ? "s" : ""} · ${nonNegativeCount(delivery.delivered)} distribution${nonNegativeCount(delivery.delivered) > 1 ? "s" : ""} confirmée${nonNegativeCount(delivery.delivered) > 1 ? "s" : ""}.`} tone="bg-emerald-500/10 text-emerald-500" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="analysis-status-title">
          <div className="flex items-center justify-between gap-3"><h3 id="analysis-status-title" className="text-sm font-semibold text-foreground">État des analyses IA</h3><span className="text-xs text-muted-foreground">Aide à la revue humaine</span></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {analysisStates.map(state => { const Icon = state.icon; return <div key={state.label} className="rounded-lg bg-muted/40 p-3"><Icon className={`h-4 w-4 ${state.tone}`} aria-hidden="true" /><p className="mt-3 text-lg font-semibold text-foreground">{state.value}</p><p className="text-xs text-muted-foreground">{state.label}</p></div>; })}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="delivery-status-title">
          <h3 id="delivery-status-title" className="text-sm font-semibold text-foreground">Délivrabilité des campagnes</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">Distribués</dt><dd className="font-semibold text-foreground">{nonNegativeCount(delivery.delivered)}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">Différés</dt><dd className="font-semibold text-foreground">{nonNegativeCount(delivery.delayed)}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">Erreurs / suppressions</dt><dd className="font-semibold text-foreground">{nonNegativeCount(delivery.failed)}</dd></div>
          </dl>
        </section>
      </div>
    </section>
  );
}
