import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  MailCheck,
  Send,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AdminErrorState } from "@/components/AdminStatePanel";
import {
  nonNegativeCount,
  percentageLabel,
} from "./recruitmentDashboardMetrics";
import PublicContentSkeleton from "./PublicContentSkeleton";
import { PARIS_TIME_ZONE } from "@shared/parisTime";

type MetricCardProps = {
  icon: typeof UserRound;
  label: string;
  value: string | number;
  detail: string;
  tone: string;
};

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: MetricCardProps) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </span>
      </div>
      <h3 className="mt-4 text-sm font-medium text-foreground">{label}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

/**
 * ADM-13: « Relances à faire », the manual follow-ups suggested after a
 * campaign, nearest due date first, marked handled or dismissed several at a
 * time. Neither sends an email. pending: how many there are in all, the list
 * reading the first ones only; due: how many of them are past their due date,
 * the number the banner gives.
 */
function RecruitmentFollowUpsList({
  pending,
  due,
}: {
  pending: number;
  due: number;
}) {
  const utils = trpc.useUtils();
  const followUps = trpc.admin.recruitment.followUps.list.useQuery({
    status: "suggested",
  });
  const [selected, setSelected] = useState<number[]>([]);
  const updateMany = trpc.admin.recruitment.followUps.updateMany.useMutation({
    onSuccess: (result, input) => {
      const plural = result.updated > 1 ? "s" : "";
      toast.success(
        `${result.updated} relance${plural} ${input.status === "completed" ? `marquée${plural} traitée${plural}` : `ignorée${plural}`}. Aucun email n’a été envoyé.`
      );
      setSelected([]);
      void utils.admin.recruitment.followUps.list.invalidate();
      void utils.admin.recruitment.dashboard.invalidate();
      void utils.admin.recruitment.candidate.detail.invalidate();
    },
    onError: updateError => toast.error(updateError.message),
  });
  const tasks = followUps.data ?? [];
  // Only the tasks still listed, once a refetch has taken some away.
  const chosen = selected.filter(id => tasks.some(task => task.id === id));
  const allChosen = tasks.length > 0 && chosen.length === tasks.length;
  const now = Date.now();
  const markChosen = (status: "completed" | "dismissed") =>
    updateMany.mutate({ ids: chosen, status });

  return (
    <section
      id="recruitment-follow-ups"
      className="mt-5 rounded-xl border border-border bg-card p-4"
      aria-labelledby="recruitment-follow-ups-title"
    >
      <h3
        id="recruitment-follow-ups-title"
        className="text-sm font-semibold text-foreground"
      >
        Relances à faire
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {pending
          ? `${pending} relance${pending > 1 ? "s" : ""} à faire, dont ${due} échue${due > 1 ? "s" : ""}. `
          : null}
        L’échéance la plus proche en premier. « Marquer traitée » et « Ignorer »
        n’envoient aucun email : contactez le candidat depuis sa fiche ou
        l’espace Mailing.
      </p>
      {followUps.error ? (
        <div className="mt-3">
          <AdminErrorState
            title="Impossible de charger les relances"
            description={followUps.error.message}
            onRetry={() => void followUps.refetch()}
            retrying={followUps.isFetching}
            headingLevel={4}
          />
        </div>
      ) : followUps.isLoading ? (
        <div className="mt-3">
          <PublicContentSkeleton
            cards={2}
            columns={2}
            label="Chargement des relances"
          />
        </div>
      ) : tasks.length ? (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={allChosen}
                onChange={() =>
                  setSelected(allChosen ? [] : tasks.map(task => task.id))
                }
              />
              Tout sélectionner ({tasks.length})
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!chosen.length || updateMany.isPending}
                onClick={() => markChosen("completed")}
              >
                Marquer traitée{chosen.length > 1 ? "s" : ""} ({chosen.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!chosen.length || updateMany.isPending}
                onClick={() => markChosen("dismissed")}
              >
                Ignorer ({chosen.length})
              </Button>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {tasks.map(task => {
              const overdue = new Date(task.dueAt).getTime() <= now;
              return (
                <li
                  key={task.id}
                  className="rounded-lg border border-border bg-background p-3 text-sm"
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={chosen.includes(task.id)}
                      onChange={event =>
                        setSelected(current =>
                          event.target.checked
                            ? [...current, task.id]
                            : current.filter(id => id !== task.id)
                        )
                      }
                    />
                    <span className="min-w-0 wrap-anywhere">
                      <span className="font-medium text-foreground">
                        {task.firstName} {task.lastName}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {task.specialty}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {task.kind === "follow_up_7"
                          ? "Relance J+7"
                          : "Relance J+14"}{" "}
                        · échéance{" "}
                        {new Date(task.dueAt).toLocaleString("fr-FR", {
                          timeZone: PARIS_TIME_ZONE,
                        })}
                        {overdue ? (
                          <strong className="ml-1 font-medium text-amber-700 dark:text-amber-300">
                            · échue
                          </strong>
                        ) : null}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {pending > tasks.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Les {tasks.length} premières des {pending} relances à faire :
              traitez-les pour afficher les suivantes.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Aucune relance à faire.
        </p>
      )}
    </section>
  );
}

export default function RecruitmentDashboardPanel() {
  const { data, isLoading, error } =
    trpc.admin.recruitment.dashboard.useQuery();
  const [followUpsOpen, setFollowUpsOpen] = useState(false);

  if (error) {
    return (
      <section
        className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive"
        aria-live="polite"
      >
        Les indicateurs recrutement ne sont pas disponibles : {error.message}
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section aria-label="Chargement des indicateurs recrutement">
        <PublicContentSkeleton
          cards={4}
          columns={4}
          label="Chargement des indicateurs recrutement"
        />
      </section>
    );
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
    {
      label: "En attente",
      value: nonNegativeCount(candidates.analysesQueued),
      icon: Clock3,
      tone: "bg-slate-500/10 text-slate-500",
    },
    {
      label: "En cours",
      value: nonNegativeCount(candidates.analysesInProgress),
      icon: BarChart3,
      tone: "bg-sky-500/10 text-sky-500",
    },
    {
      label: "À revue humaine",
      value: nonNegativeCount(candidates.analysesNeedsReview),
      icon: UsersRound,
      tone: "bg-amber-500/10 text-amber-500",
    },
    {
      label: "Terminées",
      value: nonNegativeCount(candidates.analysesCompleted),
      icon: CheckCircle2,
      tone: "bg-emerald-500/10 text-emerald-500",
    },
    {
      label: "En échec",
      value: nonNegativeCount(candidates.analysesFailed),
      icon: AlertTriangle,
      tone: "bg-destructive/10 text-destructive",
    },
  ];

  return (
    <section
      className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6"
      aria-labelledby="recruitment-dashboard-title"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Hippocampus Consulting
          </p>
          <h2
            id="recruitment-dashboard-title"
            className="mt-1 text-xl font-semibold text-foreground"
          >
            Pilotage recrutement
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Vue consolidée des candidatures, consentements, analyses assistées
            et activités de campagnes. Les ratios sont indicatifs et
            n’automatisent aucune décision.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={followUpsOpen}
          aria-controls="recruitment-follow-ups"
          onClick={() => setFollowUpsOpen(open => !open)}
          className="rounded-full border border-primary/25 bg-background/70 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-primary/10"
        >
          <span className="font-semibold text-foreground">
            {nonNegativeCount(data.followUpStats.due)}
          </span>{" "}
          relance{nonNegativeCount(data.followUpStats.due) > 1 ? "s" : ""}{" "}
          manuelle{nonNegativeCount(data.followUpStats.due) > 1 ? "s" : ""} à
          examiner
        </button>
      </div>

      {followUpsOpen ? (
        <RecruitmentFollowUpsList
          pending={nonNegativeCount(data.followUpStats.pending)}
          due={nonNegativeCount(data.followUpStats.due)}
        />
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={UserRound}
          label="CV enregistrés"
          value={totalCandidates}
          detail="Volume total de candidatures conservées."
          tone="bg-primary/10 text-primary"
        />
        <MetricCard
          icon={UsersRound}
          label="Consentements marketing"
          value={percentageLabel(marketingEligible, totalCandidates)}
          detail={`${marketingEligible} candidat${marketingEligible > 1 ? "s" : ""} éligible${marketingEligible > 1 ? "s" : ""} au vivier.`}
          tone="bg-violet-500/10 text-violet-500"
        />
        <MetricCard
          icon={MailCheck}
          label="Taux de réponse"
          value={percentageLabel(responded, contacted)}
          detail={`${responded} réponse${responded > 1 ? "s" : ""} pour ${contacted} profil${contacted > 1 ? "s" : ""} contacté${contacted > 1 ? "s" : ""}.`}
          tone="bg-cyan-500/10 text-cyan-500"
        />
        <MetricCard
          icon={Send}
          label="Campagnes"
          value={sentCampaigns}
          detail={`${totalCampaigns} campagne${totalCampaigns > 1 ? "s" : ""} créée${totalCampaigns > 1 ? "s" : ""} · ${nonNegativeCount(delivery.delivered)} distribution${nonNegativeCount(delivery.delivered) > 1 ? "s" : ""} confirmée${nonNegativeCount(delivery.delivered) > 1 ? "s" : ""}.`}
          tone="bg-emerald-500/10 text-emerald-500"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section
          className="rounded-xl border border-border bg-card p-4"
          aria-labelledby="analysis-status-title"
        >
          <div className="flex items-center justify-between gap-3">
            <h3
              id="analysis-status-title"
              className="text-sm font-semibold text-foreground"
            >
              État des analyses IA
            </h3>
            <span className="text-xs text-muted-foreground">
              Aide à la revue humaine
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {analysisStates.map(state => {
              const Icon = state.icon;
              return (
                <div key={state.label} className="rounded-lg bg-muted/40 p-3">
                  <Icon
                    className={`h-4 w-4 ${state.tone}`}
                    aria-hidden="true"
                  />
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {state.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{state.label}</p>
                </div>
              );
            })}
          </div>
        </section>
        <section
          className="rounded-xl border border-border bg-card p-4"
          aria-labelledby="delivery-status-title"
        >
          <h3
            id="delivery-status-title"
            className="text-sm font-semibold text-foreground"
          >
            Délivrabilité des campagnes
          </h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Distribués</dt>
              <dd className="font-semibold text-foreground">
                {nonNegativeCount(delivery.delivered)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Différés</dt>
              <dd className="font-semibold text-foreground">
                {nonNegativeCount(delivery.delayed)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Erreurs / suppressions</dt>
              <dd className="font-semibold text-foreground">
                {nonNegativeCount(delivery.failed)}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
