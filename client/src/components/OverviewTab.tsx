import { trpc } from "@/lib/trpc";
import { Calendar, CalendarClock, CalendarRange, MessageSquare, MessageSquareText, Shield, FileCheck, DollarSign, Percent, Timer, UserRound, UserRoundPlus, Users, BriefcaseBusiness } from "lucide-react";
import RecruitmentDashboardPanel from "@/components/RecruitmentDashboardPanel";
import AdminAttentionPanel from "@/components/AdminAttentionPanel";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { formatAdminAmount } from "@/components/adminAmount";
import { formatGdprRequestDate } from "@/components/gdprRequestAdmin";
import { percentageLabel } from "@/components/recruitmentDashboardMetrics";
import type { Tab } from "@/pages/AdminDashboard";

const HOUR_MS = 60 * 60 * 1000;
/** A GDPR answer deadline within a week is near. */
const GDPR_DEADLINE_SOON_MS = 7 * 24 * HOUR_MS;

/** « 05/11/2026 », a day in Paris. */
const parisDay = (date: Date | string) => new Date(date).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

/** « 13/11/2026 » for the Paris day « 2026-11-13 ». */
const dayLabel = (dateKey: string) => dateKey.split("-").reverse().join("/");

const plural = (count: number) => (count > 1 ? "s" : "");

/** « moins d’1 h », « 5 h », « 2,5 jours ». */
function responseTimeLabel(averageMs: number | null) {
  if (averageMs === null) return "—";
  if (averageMs < HOUR_MS) return "moins d’1 h";
  if (averageMs < 48 * HOUR_MS) return `${Math.round(averageMs / HOUR_MS)} h`;
  return `${(averageMs / (24 * HOUR_MS)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} jours`;
}

/** « novembre 2026 » for « 2026-11 ». */
const monthLabel = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber! - 1, 15)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
};

/** The nearest GDPR deadline (that of the oldest open request), said overdue or near before the day ends. */
function gdprDeadline(nextDeadline: Date | string | null, now: Date) {
  if (!nextDeadline) return { detail: "Aucune demande en attente", tone: "text-muted-foreground" };
  const remainingMs = new Date(nextDeadline).getTime() - now.getTime();
  if (remainingMs < 0) return { detail: `Échéance dépassée : ${formatGdprRequestDate(nextDeadline)}`, tone: "text-red-600 dark:text-red-400" };
  if (remainingMs <= GDPR_DEADLINE_SOON_MS) return { detail: `Échéance proche : ${formatGdprRequestDate(nextDeadline)}`, tone: "text-amber-700 dark:text-amber-300" };
  return { detail: `Prochaine échéance : ${formatGdprRequestDate(nextDeadline)}`, tone: "text-muted-foreground" };
}

const CARD_CLASS = "group flex h-full flex-col rounded-lg border border-border bg-card p-6 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

type OverviewCard = { label: string; value: number | string; detail: string; tone?: string; icon: typeof Calendar; color: string; tab: Tab };

/** Cards that each open their tab; the detail line, muted unless its tone says otherwise. */
const cardButtons = (cards: OverviewCard[], onNavigate: (tab: Tab) => void) => cards.map(card => {
  const Icon = card.icon;
  return (
    <button key={card.label} type="button" onClick={() => onNavigate(card.tab)} className={CARD_CLASS}>
      <span className="mb-4 flex items-center justify-between">
        <Icon className={`h-6 w-6 ${card.color}`} aria-hidden="true" />
        <span aria-hidden="true" className="text-lg text-primary transition-transform group-hover:translate-x-0.5">→</span>
      </span>
      <span className="text-3xl font-bold text-foreground">{card.value}</span>
      <span className="mt-1 text-sm font-medium text-foreground">{card.label}</span>
      <span className={`mt-1 text-xs ${card.tone ?? "text-muted-foreground"}`}>{card.detail}</span>
    </button>
  );
});

/**
 * Overview of the dashboard (ADM-06): « À traiter » first (failed emails,
 * payments to settle), then what waits for an action today, each card opening
 * its tab, then the indicators: revenue of this month and the previous one,
 * consultations of the coming week, booking conversion, applications per week
 * and answer time to questions. Days and months are those of Paris.
 */
export default function OverviewTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { data: stats, isLoading, error } = trpc.admin.stats.useQuery();

  const gdpr = gdprDeadline(stats?.gdprRequests.nextDeadline ?? null, new Date());
  const oldestQuestion = stats?.medicalQuestions.oldestReceivedAt;
  const followUps: OverviewCard[] = stats ? [
    { label: "Rendez-vous aujourd’hui", value: stats.appointments.today, detail: "Consultations confirmées", tone: "text-muted-foreground", icon: Calendar, color: "text-cyan-400", tab: "appointments" },
    { label: "Rendez-vous demain", value: stats.appointments.tomorrow, detail: "Consultations confirmées", tone: "text-muted-foreground", icon: CalendarClock, color: "text-cyan-400", tab: "appointments" },
    { label: "Questions santé à répondre", value: stats.medicalQuestions.open, detail: oldestQuestion ? `La plus ancienne reçue le ${parisDay(oldestQuestion)}` : "Aucune en attente", tone: "text-muted-foreground", icon: MessageSquareText, color: "text-violet-400", tab: "medicalQuestions" },
    { label: "Messages non lus", value: stats.unreadMessages, detail: "Formulaire de contact", tone: "text-muted-foreground", icon: MessageSquare, color: "text-green-400", tab: "contacts" },
    { label: "Demandes RGPD ouvertes", value: stats.gdprRequests.open, detail: gdpr.detail, tone: gdpr.tone, icon: Shield, color: "text-yellow-400", tab: "gdpr" },
    { label: "Documents candidats à revoir", value: stats.documentsToReview, detail: "En attente de votre revue", tone: "text-muted-foreground", icon: FileCheck, color: "text-primary", tab: "candidateDocuments" },
    { label: "Nouvelles candidatures", value: stats.applications.new, detail: "Pas encore examinées", icon: UserRoundPlus, color: "text-primary", tab: "recruitment" },
  ] : [];
  const { paid, started } = stats?.bookingConversion ?? { paid: 0, started: 0 };
  const answers = stats?.medicalQuestions.recentAnswers ?? { count: 0, averageResponseMs: null };
  const indicators: OverviewCard[] = stats ? [
    { label: `Chiffre d’affaires · ${monthLabel(stats.revenue.currentMonth.month)}`, value: formatAdminAmount(stats.revenue.currentMonth.amount), detail: "Mois en cours", icon: DollarSign, color: "text-emerald-400", tab: "appointments" },
    { label: `Chiffre d’affaires · ${monthLabel(stats.revenue.previousMonth.month)}`, value: formatAdminAmount(stats.revenue.previousMonth.amount), detail: "Mois précédent", icon: DollarSign, color: "text-emerald-400", tab: "appointments" },
    { label: "Consultations à venir · 7 jours", value: stats.appointments.upcomingWeek.count, detail: `Confirmées, jusqu’au ${dayLabel(stats.appointments.upcomingWeek.lastDay)} inclus`, icon: CalendarRange, color: "text-cyan-400", tab: "appointments" },
    { label: "Conversion des réservations · 30 jours", value: percentageLabel(paid, started), detail: started ? `${paid} payée${plural(paid)} sur ${started} réservation${plural(started)} commencée${plural(started)}` : "Aucune réservation commencée", icon: Percent, color: "text-cyan-400", tab: "appointments" },
    { label: "Candidatures reçues · 7 jours", value: stats.applications.lastWeek, detail: `En moyenne ${(stats.applications.lastFourWeeks / 4).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} par semaine sur 4 semaines`, icon: Users, color: "text-primary", tab: "recruitment" },
    { label: "Délai moyen de réponse aux questions · 30 jours", value: responseTimeLabel(answers.averageResponseMs), detail: answers.count ? `Sur ${answers.count} réponse${plural(answers.count)} envoyée${plural(answers.count)}` : "Aucune réponse envoyée", icon: Timer, color: "text-violet-400", tab: "medicalQuestions" },
  ] : [];

  return (
    <div className="space-y-8">
      <AdminAttentionPanel onOpenAppointments={() => onNavigate("appointments")} />

      {error ? (
        <div className="text-center py-8 text-red-400">Erreur de chargement : {error.message}</div>
      ) : isLoading || !stats ? (
        <PublicContentSkeleton cards={4} columns={4} label="Chargement des indicateurs administratifs" />
      ) : (
        <>
          <section aria-labelledby="overview-follow-ups-title">
            <h2 id="overview-follow-ups-title" className="text-xl font-semibold text-foreground">Au quotidien</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ce qui attend une action ; chaque carte ouvre l’onglet concerné.</p>
            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{cardButtons(followUps, onNavigate)}</div>
          </section>

          <section aria-labelledby="overview-indicators-title">
            <h2 id="overview-indicators-title" className="text-xl font-semibold text-foreground">Indicateurs</h2>
            <p className="mt-1 text-sm text-muted-foreground">Chiffre d’affaires : consultations payées du mois, à la date de la consultation (heure de Paris), remboursements déduits. Conversion : réservations payées parmi celles commencées, hors paiement en cours.</p>
            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{cardButtons(indicators, onNavigate)}</div>
          </section>
        </>
      )}

      <RecruitmentDashboardPanel />

      <section aria-labelledby="recruitment-shortcuts-title" className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Accès rapide</p>
          <h2 id="recruitment-shortcuts-title" className="mt-1 text-xl font-semibold text-foreground">Recrutement & Missions</h2>
          <p className="mt-1 text-sm text-muted-foreground">Accédez directement aux CV déposés et aux besoins transmis par les employeurs.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onNavigate("recruitment")}
            className="group flex items-center justify-between rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>
              <span className="flex items-center gap-2 font-semibold text-foreground"><UserRound className="h-5 w-5 text-primary" /> Candidatures</span>
              <span className="mt-1 block text-sm text-muted-foreground">Consulter les CV, analyses IA, disponibilités et certifications.</span>
            </span>
            <span aria-hidden="true" className="text-lg text-primary transition-transform group-hover:translate-x-0.5">→</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("employerBriefs")}
            className="group flex items-center justify-between rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>
              <span className="flex items-center gap-2 font-semibold text-foreground"><BriefcaseBusiness className="h-5 w-5 text-primary" /> Missions</span>
              <span className="mt-1 block text-sm text-muted-foreground">Gérer les briefs Employeurs et créer des shortlists de candidats.</span>
            </span>
            <span aria-hidden="true" className="text-lg text-primary transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}
