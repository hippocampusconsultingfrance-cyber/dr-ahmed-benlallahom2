import { AlertTriangle, BarChart3, CheckCircle2, Clock3, MailCheck, Send, UserRound, UsersRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { nonNegativeCount, percentageLabel } from "./recruitmentDashboardMetrics";
import PublicContentSkeleton from "./PublicContentSkeleton";

type MetricCardProps = {
  icon: typeof UserRound;
  label: string;
  value: string | number;
  detail: string;
  tone: string;
};

export const recruitmentDashboardCopy = {
  fr: { unavailable: "Les indicateurs recrutement ne sont pas disponibles.", loading: "Chargement des indicateurs recrutement", title: "Pilotage recrutement", intro: "Vue consolidée des candidatures, consentements, analyses assistées et activités de campagnes. Les ratios sont indicatifs et n’automatisent aucune décision.", dueFollowUps: (count: number) => `${count} relance${count > 1 ? "s" : ""} manuelle${count > 1 ? "s" : ""} à examiner`, metrics: { cvs: "CV enregistrés", cvsDetail: "Volume total de candidatures conservées.", consent: "Consentements marketing", consentDetail: (count: number) => `${count} candidat${count > 1 ? "s" : ""} éligible${count > 1 ? "s" : ""} au vivier.`, responseRate: "Taux de réponse", responseDetail: (responses: number, contacted: number) => `${responses} réponse${responses > 1 ? "s" : ""} pour ${contacted} profil${contacted > 1 ? "s" : ""} contacté${contacted > 1 ? "s" : ""}.`, campaigns: "Campagnes", campaignsDetail: (campaigns: number, delivered: number) => `${campaigns} campagne${campaigns > 1 ? "s" : ""} créée${campaigns > 1 ? "s" : ""} · ${delivered} distribution${delivered > 1 ? "s" : ""} confirmée${delivered > 1 ? "s" : ""}.` }, analysis: { title: "État des analyses IA", support: "Aide à la revue humaine", queued: "En attente", inProgress: "En cours", needsReview: "À revue humaine", completed: "Terminées", failed: "En échec" }, delivery: { title: "Délivrabilité des campagnes", delivered: "Distribués", delayed: "Différés", failed: "Erreurs / suppressions" } },
  en: { unavailable: "Recruitment indicators are unavailable.", loading: "Loading recruitment indicators", title: "Recruitment overview", intro: "Consolidated view of applications, consents, assisted analyses and campaign activity. Ratios are indicative and never automate a decision.", dueFollowUps: (count: number) => `${count} manual follow-up${count > 1 ? "s" : ""} to review`, metrics: { cvs: "Stored CVs", cvsDetail: "Total volume of retained applications.", consent: "Marketing consents", consentDetail: (count: number) => `${count} candidate${count > 1 ? "s" : ""} eligible for the talent pool.`, responseRate: "Response rate", responseDetail: (responses: number, contacted: number) => `${responses} response${responses > 1 ? "s" : ""} for ${contacted} contacted profile${contacted > 1 ? "s" : ""}.`, campaigns: "Campaigns", campaignsDetail: (campaigns: number, delivered: number) => `${campaigns} campaign${campaigns > 1 ? "s" : ""} created · ${delivered} confirmed delivery${delivered > 1 ? "ies" : ""}.` }, analysis: { title: "AI analysis status", support: "Support for human review", queued: "Pending", inProgress: "In progress", needsReview: "Human review", completed: "Completed", failed: "Failed" }, delivery: { title: "Campaign deliverability", delivered: "Delivered", delayed: "Delayed", failed: "Errors / suppressions" } },
  de: { unavailable: "Recruiting-Kennzahlen sind nicht verfügbar.", loading: "Recruiting-Kennzahlen werden geladen", title: "Recruiting-Steuerung", intro: "Konsolidierte Ansicht von Bewerbungen, Einwilligungen, unterstützten Analysen und Kampagnenaktivitäten. Die Kennzahlen sind indikativ und automatisieren keine Entscheidung.", dueFollowUps: (count: number) => `${count} manuelle Nachverfolgung${count === 1 ? "" : "en"} zu prüfen`, metrics: { cvs: "Gespeicherte Lebensläufe", cvsDetail: "Gesamtvolumen der aufbewahrten Bewerbungen.", consent: "Marketing-Einwilligungen", consentDetail: (count: number) => `${count} Kandidat${count === 1 ? "" : "en"} für den Talentpool berechtigt.`, responseRate: "Antwortquote", responseDetail: (responses: number, contacted: number) => `${responses} Antwort${responses === 1 ? "" : "en"} auf ${contacted} kontaktierte${contacted === 1 ? "s" : ""} Profil${contacted === 1 ? "" : "e"}.`, campaigns: "Kampagnen", campaignsDetail: (campaigns: number, delivered: number) => `${campaigns} Kampagne${campaigns === 1 ? "" : "n"} erstellt · ${delivered} Zustellung${delivered === 1 ? "" : "en"} bestätigt.` }, analysis: { title: "Status der KI-Analysen", support: "Unterstützung der menschlichen Prüfung", queued: "Ausstehend", inProgress: "In Bearbeitung", needsReview: "Menschliche Prüfung", completed: "Abgeschlossen", failed: "Fehlgeschlagen" }, delivery: { title: "Kampagnenzustellbarkeit", delivered: "Zugestellt", delayed: "Verzögert", failed: "Fehler / Unterdrückungen" } },
  zh: { unavailable: "招聘指标不可用。", loading: "正在加载招聘指标", title: "招聘概览", intro: "汇总查看申请、同意、辅助分析和活动。比率仅供参考，绝不自动作出决定。", dueFollowUps: (count: number) => `${count} 项人工跟进待审核`, metrics: { cvs: "已保存简历", cvsDetail: "已保留申请的总量。", consent: "营销同意", consentDetail: (count: number) => `${count} 名候选人符合人才库资格。`, responseRate: "回复率", responseDetail: (responses: number, contacted: number) => `${contacted} 个已联系档案中有 ${responses} 个回复。`, campaigns: "活动", campaignsDetail: (campaigns: number, delivered: number) => `已创建 ${campaigns} 个活动 · 已确认投递 ${delivered} 次。` }, analysis: { title: "AI 分析状态", support: "辅助人工审核", queued: "等待中", inProgress: "进行中", needsReview: "人工审核", completed: "已完成", failed: "失败" }, delivery: { title: "活动投递", delivered: "已投递", delayed: "已延迟", failed: "错误 / 已抑制" } },
} as const;

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
  const { language } = useLanguage();
  const copy = recruitmentDashboardCopy[language as keyof typeof recruitmentDashboardCopy] ?? recruitmentDashboardCopy.fr;
  const { data, isLoading, error } = trpc.admin.recruitment.dashboard.useQuery();

  if (error) {
    return <section className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive" aria-live="polite">{copy.unavailable}</section>;
  }

  if (isLoading || !data) {
    return <section aria-label={copy.loading}><PublicContentSkeleton cards={4} columns={4} label={copy.loading} /></section>;
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
    { label: copy.analysis.queued, value: nonNegativeCount(candidates.analysesQueued), icon: Clock3, tone: "bg-slate-500/10 text-slate-500" },
    { label: copy.analysis.inProgress, value: nonNegativeCount(candidates.analysesInProgress), icon: BarChart3, tone: "bg-sky-500/10 text-sky-500" },
    { label: copy.analysis.needsReview, value: nonNegativeCount(candidates.analysesNeedsReview), icon: UsersRound, tone: "bg-amber-500/10 text-amber-500" },
    { label: copy.analysis.completed, value: nonNegativeCount(candidates.analysesCompleted), icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-500" },
    { label: copy.analysis.failed, value: nonNegativeCount(candidates.analysesFailed), icon: AlertTriangle, tone: "bg-destructive/10 text-destructive" },
  ];

  return (
    <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6" aria-labelledby="recruitment-dashboard-title">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Hippocampus Consulting</p>
          <h2 id="recruitment-dashboard-title" className="mt-1 text-xl font-semibold text-foreground">{copy.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{copy.intro}</p>
        </div>
        <div className="rounded-full border border-primary/25 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground">{copy.dueFollowUps(nonNegativeCount(data.followUpStats.due))}</div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={UserRound} label={copy.metrics.cvs} value={totalCandidates} detail={copy.metrics.cvsDetail} tone="bg-primary/10 text-primary" />
        <MetricCard icon={UsersRound} label={copy.metrics.consent} value={percentageLabel(marketingEligible, totalCandidates)} detail={copy.metrics.consentDetail(marketingEligible)} tone="bg-violet-500/10 text-violet-500" />
        <MetricCard icon={MailCheck} label={copy.metrics.responseRate} value={percentageLabel(responded, contacted)} detail={copy.metrics.responseDetail(responded, contacted)} tone="bg-cyan-500/10 text-cyan-500" />
        <MetricCard icon={Send} label={copy.metrics.campaigns} value={sentCampaigns} detail={copy.metrics.campaignsDetail(totalCampaigns, nonNegativeCount(delivery.delivered))} tone="bg-emerald-500/10 text-emerald-500" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="analysis-status-title">
          <div className="flex items-center justify-between gap-3"><h3 id="analysis-status-title" className="text-sm font-semibold text-foreground">{copy.analysis.title}</h3><span className="text-xs text-muted-foreground">{copy.analysis.support}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {analysisStates.map(state => { const Icon = state.icon; return <div key={state.label} className="rounded-lg bg-muted/40 p-3"><Icon className={`h-4 w-4 ${state.tone}`} aria-hidden="true" /><p className="mt-3 text-lg font-semibold text-foreground">{state.value}</p><p className="text-xs text-muted-foreground">{state.label}</p></div>; })}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="delivery-status-title">
          <h3 id="delivery-status-title" className="text-sm font-semibold text-foreground">{copy.delivery.title}</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">{copy.delivery.delivered}</dt><dd className="font-semibold text-foreground">{nonNegativeCount(delivery.delivered)}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">{copy.delivery.delayed}</dt><dd className="font-semibold text-foreground">{nonNegativeCount(delivery.delayed)}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">{copy.delivery.failed}</dt><dd className="font-semibold text-foreground">{nonNegativeCount(delivery.failed)}</dd></div>
          </dl>
        </section>
      </div>
    </section>
  );
}
