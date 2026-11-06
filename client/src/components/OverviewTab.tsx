import { trpc } from "@/lib/trpc";
import { Calendar, MessageSquare, Shield, DollarSign, UserRound, BriefcaseBusiness } from "lucide-react";
import RecruitmentDashboardPanel from "@/components/RecruitmentDashboardPanel";
import AdminAttentionPanel from "@/components/AdminAttentionPanel";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { formatAdminAmount } from "@/components/adminAmount";
import type { Tab } from "@/pages/AdminDashboard";

export default function OverviewTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { data: stats, isLoading, error } = trpc.admin.stats.useQuery();

  if (error) {
    return <div className="text-center py-8 text-red-400">Erreur de chargement : {error.message}</div>;
  }

  if (isLoading) {
    return <PublicContentSkeleton cards={4} columns={4} label="Chargement des indicateurs administratifs" />;
  }

  const cards = [
    { label: "Réservations", value: stats?.appointments || 0, icon: Calendar, color: "text-cyan-400" },
    { label: "Messages", value: stats?.contacts || 0, icon: MessageSquare, color: "text-green-400" },
    { label: "Demandes RGPD", value: stats?.gdpr || 0, icon: Shield, color: "text-yellow-400" },
    { label: "Revenus", value: formatAdminAmount(stats?.revenue), icon: DollarSign, color: "text-emerald-400" },
  ];

  return (
    <div className="space-y-8">
      <AdminAttentionPanel onOpenAppointments={() => onNavigate("appointments")} />

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <Icon className={`w-6 h-6 ${card.color}`} />
              </div>
              <p className="text-3xl font-bold text-foreground">{card.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{card.label}</p>
            </div>
          );
        })}
      </section>

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
