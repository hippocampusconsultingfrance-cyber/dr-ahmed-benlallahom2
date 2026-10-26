import { useAuth } from "@/_core/hooks/useAuth";
import { SignInButton, UserButton } from "@clerk/react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, MessageSquare, Shield, DollarSign, Eye, CheckCircle, XCircle, Clock, ArrowLeft, Star, Trash2, FileText, CalendarDays, Plus, Edit, Trash, Globe, UserRound, BriefcaseBusiness, Send, UsersRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import RecruitmentTab from "@/components/RecruitmentTab";
import EmployerBriefsTab from "@/components/EmployerBriefsTab";
import VivierTab from "@/components/VivierTab";
import MailingTab from "@/components/MailingTab";
import CandidateDocumentsAdminTab from "@/components/CandidateDocumentsAdminTab";
import SecurityOperationsTab from "@/components/SecurityOperationsTab";
import RecruitmentDashboardPanel from "@/components/RecruitmentDashboardPanel";
import MedicalQuestionsAdminTab from "@/components/MedicalQuestionsAdminTab";
import { AdminEmptyState, AdminErrorState } from "@/components/AdminStatePanel";
import AdminConfigurationBanner from "@/components/AdminConfigurationBanner";
import AdminAttentionPanel from "@/components/AdminAttentionPanel";
import AdminLoadMore from "@/components/AdminLoadMore";
import AppointmentDeliveries from "@/components/AppointmentDeliveries";
import PersonalDataSearchPanel from "@/components/PersonalDataSearchPanel";
import { GDPR_REQUEST_STATUS_LABELS, GDPR_REQUEST_TYPE_LABELS, gdprRequestDeadline, isGdprRequestOpen, isGdprRequestOverdue } from "@/components/gdprRequestAdmin";
import { adminListCount, adminPageOffsets, ADMIN_PAGE_SIZE, mergeAdminPages, useAdminPageCount } from "@/components/adminPagination";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { getActiveAdminTabLabel } from "./adminDashboardMobileTabs";
import { buildAppointmentsAgenda } from "./appointmentsAgenda";
import { getAppointmentAdminActions } from "./appointmentAdminActions";

type Tab = "overview" | "appointments" | "contacts" | "gdpr" | "testimonials" | "availability" | "recruitment" | "candidateDocuments" | "security" | "vivier" | "mailing" | "employerBriefs" | "medicalQuestions";

export default function AdminDashboard() {
  const { user, loading, refresh, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const signOut = () => {
    setSigningOut(true);
    void logout().finally(() => setSigningOut(false));
  };
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [mailingSelectedIds, setMailingSelectedIds] = useState<number[]>([]);
  const [mfaCode, setMfaCode] = useState("");
  const adminSecurity = trpc.adminSecurity.status.useQuery(undefined, { enabled: Boolean(user?.role === "admin") });
  const requestMfa = trpc.adminSecurity.begin.useMutation({ onSuccess: () => toast.success("Un code de sécurité a été envoyé à votre email administrateur."), onError: error => toast.error(error.message) });
  const verifyMfa = trpc.adminSecurity.verify.useMutation({ onSuccess: () => { void adminSecurity.refetch(); toast.success("Double authentification validée."); }, onError: error => toast.error(error.message) });

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <PublicContentSkeleton cards={1} label="Chargement de l’accès administrateur" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Connexion administrateur requise</h1>
          <p className="text-muted-foreground mb-6">Connectez-vous avec le compte propriétaire pour accéder aux candidatures et aux missions.</p>
          <SignInButton mode="modal" forceRedirectUrl="/admin">
            <Button>Se connecter</Button>
          </SignInButton>
        </div>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Accès refusé</h1>
          <p className="text-muted-foreground mb-6">Votre session ne possède pas les permissions nécessaires. Si votre rôle vient d’être mis à jour, actualisez l’accès ou reconnectez-vous.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => void refresh()}>
              Actualiser l’accès
            </Button>
            <UserButton showName />
            <Button variant="ghost" onClick={() => setLocation("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Accueil
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (adminSecurity.isLoading) {
    return <div className="min-h-screen bg-background px-4 py-16"><div className="mx-auto max-w-3xl"><PublicContentSkeleton cards={1} label="Vérification de sécurité" /></div></div>;
  }

  if (!adminSecurity.data?.verified) {
    return <div className="min-h-screen bg-background flex items-center justify-center px-4"><div className="w-full max-w-md rounded-2xl border border-cyan-900/50 bg-card p-7 shadow-2xl"><div className="mb-5 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Shield className="h-6 w-6"/></span><div><h1 className="text-xl font-bold text-foreground">Validation de sécurité</h1><p className="text-sm text-muted-foreground">Une seconde vérification protège les documents et CV sensibles.</p></div></div><p className="mb-4 text-sm text-muted-foreground">Demandez un code à six chiffres sur votre email administrateur, puis saisissez-le ci-dessous.</p><Button className="mb-5 w-full" onClick={() => requestMfa.mutate()} disabled={requestMfa.isPending}>{requestMfa.isPending ? "Envoi en cours…" : "Envoyer un code de sécurité"}</Button><div className="space-y-2"><label htmlFor="admin-mfa-code" className="text-sm font-medium text-foreground">Code à 6 chiffres</label><Input id="admin-mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, ""))} placeholder="123456"/><Button className="mt-2 w-full" variant="outline" disabled={mfaCode.length !== 6 || verifyMfa.isPending} onClick={() => verifyMfa.mutate({ code: mfaCode })}>{verifyMfa.isPending ? "Vérification…" : "Valider le code"}</Button></div><Button variant="ghost" className="mt-3 w-full" onClick={() => setLocation("/")}>Retour au site</Button><Button variant="ghost" className="mt-1 w-full" onClick={signOut} disabled={signingOut}><LogOut className="mr-2 h-4 w-4"/>{signingOut ? "Déconnexion…" : "Se déconnecter"}</Button></div></div>;
  }

  const tabs = [
    { id: "overview" as Tab, label: "Vue d'ensemble", icon: DollarSign },
    { id: "appointments" as Tab, label: "Réservations", icon: Calendar },
    { id: "contacts" as Tab, label: "Messages", icon: MessageSquare },
    { id: "medicalQuestions" as Tab, label: "Questions santé", icon: MessageSquare },
    { id: "gdpr" as Tab, label: "RGPD", icon: Shield },
    { id: "testimonials" as Tab, label: "Témoignages", icon: Star },
    { id: "availability" as Tab, label: "Disponibilités", icon: CalendarDays },
    { id: "recruitment" as Tab, label: "Candidatures", icon: UserRound },
    { id: "candidateDocuments" as Tab, label: "Documents candidats", icon: Shield },
    { id: "security" as Tab, label: "Sécurité", icon: Shield },
    { id: "vivier" as Tab, label: "Vivier", icon: UsersRound },
    { id: "mailing" as Tab, label: "Mailing", icon: Send },
    { id: "employerBriefs" as Tab, label: "Missions", icon: BriefcaseBusiness },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Site
            </Button>
            <h1 className="text-xl font-bold text-foreground">Administration</h1>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-full truncate text-sm text-muted-foreground">{user.name}</span>
            <Button variant="outline" size="sm" onClick={signOut} disabled={signingOut}>
              <LogOut className="w-4 h-4 mr-2" />
              {signingOut ? "Déconnexion…" : "Se déconnecter"}
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-border bg-card/30">
        <div className="max-w-7xl mx-auto px-4">
          <label className="sr-only" htmlFor="admin-active-tab">Section d’administration</label>
          <div className="py-2 sm:hidden">
            <select
              id="admin-active-tab"
              value={activeTab}
              onChange={event => setActiveTab(event.target.value as Tab)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label={`Section d’administration : ${getActiveAdminTabLabel(tabs, activeTab)}`}
            >
              {tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
            </select>
          </div>
          <div
            className="hidden max-w-full gap-3 overflow-x-auto overscroll-x-contain px-1 py-2 [scrollbar-width:thin] sm:flex"
            aria-label="Navigation des sections d’administration"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={activeTab === tab.id ? "page" : undefined}
                  className={`shrink-0 flex items-center gap-2 rounded-t-md border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-5 sm:py-8">
        <AdminConfigurationBanner />
        {activeTab === "overview" && <OverviewTab onNavigate={setActiveTab} />}
        {activeTab === "appointments" && <AppointmentsTab />}
        {activeTab === "contacts" && <ContactsTab />}
        {activeTab === "gdpr" && <GdprTab />}
        {activeTab === "testimonials" && <TestimonialsTab />}
        {activeTab === "availability" && <AvailabilityTab />}
        {activeTab === "recruitment" && <RecruitmentTab />}
        {activeTab === "candidateDocuments" && <CandidateDocumentsAdminTab />}
        {activeTab === "security" && <SecurityOperationsTab />}
        {activeTab === "vivier" && <VivierTab onCompose={candidateIds => { setMailingSelectedIds(candidateIds); setActiveTab("mailing"); }} />}
        {activeTab === "mailing" && <MailingTab initialSelectedIds={mailingSelectedIds} />}
        {activeTab === "employerBriefs" && <EmployerBriefsTab />}
        {activeTab === "medicalQuestions" && <MedicalQuestionsAdminTab />}
      </main>
    </div>
  );
}

function OverviewTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
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
    { label: "Revenus", value: `${stats?.revenue || 0}€`, icon: DollarSign, color: "text-emerald-400" },
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

function AppointmentsTab() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "completed" | "failed" | "refunded" | undefined>(undefined);
  const utils = trpc.useUtils();
  // ADM-01: 50 rows, then « Charger plus » (offset + 50).
  const { pageCount, loadMore } = useAdminPageCount(statusFilter ?? "all");
  const pages = trpc.useQueries(t => adminPageOffsets(pageCount).map(offset => t.admin.appointments.list({ status: statusFilter, limit: ADMIN_PAGE_SIZE, offset })));
  const { items, total, isLoading, isLoadingMore, error, loadMoreError, retryLoadMore } = mergeAdminPages(pages);
  const [unconfirmedSessionId, setUnconfirmedSessionId] = useState("");
  const updateStatus = trpc.admin.appointments.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Statut mis à jour");
      utils.admin.appointments.list.invalidate();
      utils.admin.stats.invalidate();
    },
    onError: (mutationError) => {
      toast.error(mutationError.message);
    },
  });
  const notifyRefundResult = ({ refundAmount, patientNotified }: { refundAmount: string; patientNotified: boolean }) => {
    toast.success(`Remboursement confirmé : ${refundAmount} €`);
    if (!patientNotified) toast.warning("L’email au patient n’a pas pu être envoyé : prévenez-le directement.");
    utils.admin.appointments.list.invalidate();
    utils.admin.stats.invalidate();
  };
  const refundAppointment = trpc.admin.appointments.refund.useMutation({
    onSuccess: notifyRefundResult,
    onError: (mutationError) => {
      toast.error(mutationError.message);
    },
  });
  const refundUnconfirmedSession = trpc.admin.appointments.refundUnconfirmedSession.useMutation({
    onSuccess: (result) => {
      notifyRefundResult(result);
      setUnconfirmedSessionId("");
    },
    onError: (mutationError) => {
      toast.error(mutationError.message);
    },
  });
  /** Motif obligatoire, communiqué au patient pour une annulation par le praticien. */
  const askRefund = (trackingId: string, initiator: "patient" | "practitioner", question: string) => {
    const reason = window.prompt(question)?.trim();
    if (!reason) return;
    if (reason.length < 3) {
      toast.error("Indiquez un motif d’au moins 3 caractères.");
      return;
    }
    refundAppointment.mutate({ trackingId, reason, initiator });
  };

  if (error) {
    return <AdminErrorState description={error.message} />;
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
    refunded: "bg-purple-500/20 text-purple-400",
  };

  const appointmentStatusColors: Record<string, string> = {
    confirmed: "bg-blue-500/20 text-blue-400",
    cancelled: "bg-red-500/20 text-red-400",
    completed: "bg-green-500/20 text-green-400",
    no_show: "bg-gray-500/20 text-gray-400",
  };
  const agenda = buildAppointmentsAgenda(items);

  if (isLoading) {
    return <PublicContentSkeleton label="Chargement des rendez-vous" />;
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([undefined, "pending", "completed", "failed", "refunded"] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === undefined ? "Tous" : s === "pending" ? "En attente" : s === "completed" ? "Payé" : s === "failed" ? "Échoué" : "Remboursé"}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground mb-4">{adminListCount(items.length, total, "réservation(s)")}</p>

      <section aria-labelledby="appointments-agenda-title" className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="appointments-agenda-title" className="font-semibold text-foreground">Prochains rendez-vous</h2>
          </div>
          <span className="text-xs text-muted-foreground">Fuseau Europe/Paris</span>
        </div>
        {agenda.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {agenda.map((day) => (
              <article key={day.key} className="rounded-lg border border-border bg-card p-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">{day.label}</p>
                <div className="space-y-2">
                  {day.items.map((apt) => (
                    <div key={apt.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-foreground"><span className="font-mono text-primary">{apt.time}</span> · {apt.customerName}</span>
                      <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${appointmentStatusColors[apt.appointmentStatus] || "bg-muted text-muted-foreground"}`}>{apt.appointmentStatus}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun rendez-vous à venir confirmé pour le moment.</p>
        )}
      </section>

      {/* Table */}
      <div className="space-y-3">
        {items.map((apt) => (
          <div key={apt.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                  <span className="font-semibold text-foreground">{apt.customerName}</span>
                  <span className="max-w-full break-all text-xs text-muted-foreground font-mono">{apt.trackingId}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="break-all">{apt.customerEmail}</span>
                  <span>{apt.customerPhone}</span>
                  <span>{new Date(apt.appointmentDate).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</span>
                  <span className="font-semibold text-foreground">{apt.finalPrice}€</span>
                  {/* Langue de la page de réservation : emails patients en anglais sauf pour FR (EN-01). */}
                  <span title="Langue de la réservation et des emails au patient">Langue : {(apt.language || "fr").toUpperCase()}</span>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[apt.paymentStatus] || ""}`}>
                  {apt.paymentStatus}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${appointmentStatusColors[apt.appointmentStatus] || ""}`}>
                  {apt.appointmentStatus}
                </span>
                {(() => {
                  const actions = getAppointmentAdminActions(apt);
                  const buttonClass = "min-h-10 flex-1 sm:min-h-0 sm:flex-none";
                  return (
                    <>
                      {actions.unconfirmedPayment && (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-400">Paiement à régulariser</span>
                      )}
                      {actions.canComplete && (
                        <Button size="sm" variant="outline" className={buttonClass} disabled={updateStatus.isPending}
                          onClick={() => {
                            if (!window.confirm(`Marquer le rendez-vous ${apt.trackingId} comme terminé ?`)) return;
                            updateStatus.mutate({ trackingId: apt.trackingId, appointmentStatus: "completed" });
                          }}>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Terminer
                        </Button>
                      )}
                      {actions.canMarkNoShow && (
                        <Button size="sm" variant="outline" className={buttonClass} disabled={updateStatus.isPending}
                          onClick={() => {
                            if (!window.confirm(`Marquer le patient du rendez-vous ${apt.trackingId} comme absent ?`)) return;
                            updateStatus.mutate({ trackingId: apt.trackingId, appointmentStatus: "no_show" });
                          }}>
                          <XCircle className="w-3 h-3 mr-1" />
                          Absent
                        </Button>
                      )}
                      {actions.canReconfirm && (
                        <Button size="sm" variant="outline" className={buttonClass} disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ trackingId: apt.trackingId, appointmentStatus: "confirmed" })}>
                          <Clock className="w-3 h-3 mr-1" />
                          Remettre en confirmé
                        </Button>
                      )}
                      {actions.canPractitionerCancel && (
                        <Button size="sm" variant="outline" className={buttonClass} disabled={refundAppointment.isPending}
                          onClick={() => askRefund(apt.trackingId, "practitioner", `Annuler ${apt.trackingId} et rembourser intégralement ${apt.finalPrice} € au patient.\nMotif communiqué au patient (obligatoire) :`)}>
                          <XCircle className="w-3 h-3 mr-1" />
                          Annuler (praticien) et rembourser
                        </Button>
                      )}
                      {actions.canPatientRefund && (
                        <Button size="sm" variant="outline" className={buttonClass} disabled={refundAppointment.isPending}
                          onClick={() => askRefund(apt.trackingId, "patient", `Annulation demandée par le patient (plus de 24 h avant) : remboursement de ${apt.finalPrice} €.\nMotif (obligatoire) :`)}>
                          <DollarSign className="w-3 h-3 mr-1" />
                          Annulation patient (remboursement)
                        </Button>
                      )}
                      {(actions.canPractitionerRefund || actions.unconfirmedPayment) && (
                        <Button size="sm" variant="outline" className={buttonClass} disabled={refundAppointment.isPending}
                          onClick={() => askRefund(apt.trackingId, "practitioner", `Rembourser intégralement le paiement de ${apt.trackingId}.\nMotif (obligatoire) :`)}>
                          <DollarSign className="w-3 h-3 mr-1" />
                          {actions.unconfirmedPayment ? "Rembourser ce paiement" : "Rembourser"}
                        </Button>
                      )}
                      {actions.canCancelUnpaid && (
                        <Button size="sm" variant="outline" className={buttonClass} disabled={updateStatus.isPending}
                          onClick={() => {
                            if (!window.confirm(`Annuler le rendez-vous non payé ${apt.trackingId} ?`)) return;
                            updateStatus.mutate({ trackingId: apt.trackingId, appointmentStatus: "cancelled" });
                          }}>
                          <XCircle className="w-3 h-3 mr-1" />
                          Annuler
                        </Button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            {apt.requestDetails && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{apt.requestDetails}</p>
            )}
            <AppointmentDeliveries trackingId={apt.trackingId} paid={apt.paymentStatus === "completed"} deliveries={apt.deliveries} invoiceNumber={apt.invoiceNumber} />
          </div>
        ))}
        {items.length === 0 && (
          <AdminEmptyState icon={CalendarDays} title="Aucune réservation" description="Les nouvelles réservations apparaîtront ici dès leur confirmation." />
        )}
      </div>
      <AdminLoadMore shown={items.length} total={total} loading={isLoadingMore} onLoadMore={loadMore} error={loadMoreError} onRetry={retryLoadMore} />

      <section aria-labelledby="unconfirmed-refund-title" className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 id="unconfirmed-refund-title" className="font-semibold text-foreground">Rembourser un paiement non confirmé</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pour un paiement signalé par l’alerte « Paiement reçu pour un rendez-vous non confirmable » (double paiement, session différente) : collez la session Stripe indiquée (cs_…). Le patient est remboursé intégralement et prévenu par email.</p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const sessionId = unconfirmedSessionId.trim();
            if (!sessionId) return;
            if (!window.confirm(`Rembourser intégralement le paiement de la session ${sessionId} ?`)) return;
            refundUnconfirmedSession.mutate({ sessionId });
          }}
        >
          <label htmlFor="unconfirmed-session-id" className="sr-only">Session Stripe</label>
          <Input id="unconfirmed-session-id" value={unconfirmedSessionId} onChange={(event) => setUnconfirmedSessionId(event.target.value)} placeholder="cs_live_…" className="sm:max-w-md" />
          <Button type="submit" variant="outline" disabled={refundUnconfirmedSession.isPending || !unconfirmedSessionId.trim()}>
            <DollarSign className="w-3 h-3 mr-1" />
            Rembourser
          </Button>
        </form>
      </section>
    </div>
  );
}

export function ContactsTab() {
  const utils = trpc.useUtils();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { pageCount, loadMore } = useAdminPageCount(unreadOnly ? "unread" : "all");
  const pages = trpc.useQueries(t => adminPageOffsets(pageCount).map(offset => t.admin.contacts.list({ unreadOnly, limit: ADMIN_PAGE_SIZE, offset })));
  const { items, total, isLoading, isLoadingMore, error, loadMoreError, retryLoadMore } = mergeAdminPages(pages);
  const markRead = trpc.admin.contacts.markRead.useMutation({
    onSuccess: () => {
      toast.success("Marqué comme lu");
      utils.admin.contacts.list.invalidate();
    },
  });
  // RGPD-12: erasure request or withdrawn consent; the trace names no one.
  const deleteMessage = trpc.admin.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success("Message supprimé");
      utils.admin.contacts.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (error) {
    return <AdminErrorState description={error.message} />;
  }

  if (isLoading) {
    return <PublicContentSkeleton label="Chargement des messages" />;
  }

  return (
    <div>
      <div className="flex gap-2 mb-6 flex-wrap">
        {[false, true].map((unread) => (
          <button
            key={String(unread)}
            type="button"
            onClick={() => setUnreadOnly(unread)}
            aria-pressed={unreadOnly === unread}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              unreadOnly === unread ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {unread ? "Non lus" : "Tous"}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground mb-4">{adminListCount(items.length, total, unreadOnly ? "message(s) non lu(s)" : "message(s)")}</p>
      <div className="space-y-3">
        {items.map((msg) => (
          <div key={msg.id} className={`bg-card border rounded-lg p-4 ${msg.read === 0 ? "border-primary/50" : "border-border"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                  <span className="font-semibold text-foreground">{msg.name}</span>
                  {msg.read === 0 && <span className="w-2 h-2 rounded-full bg-primary" />}
                  <span className="text-xs text-muted-foreground font-mono">{msg.trackingId}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground mb-2">
                  <span className="break-all">{msg.email}</span>
                  {msg.phone && <span>{msg.phone}</span>}
                  <span>{new Date(msg.createdAt).toLocaleString("fr-FR")}</span>
                </div>
                <p className="text-sm text-foreground">{msg.message}</p>
              </div>
              <div className="flex flex-wrap gap-2 self-start">
                {msg.read === 0 && (
                  <Button size="sm" variant="outline" className="min-h-10 sm:min-h-0" onClick={() => markRead.mutate({ id: msg.id })}>
                    <Eye className="w-3 h-3 mr-1" />
                    Lu
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-10 text-destructive hover:text-destructive sm:min-h-0"
                  disabled={deleteMessage.isPending}
                  onClick={() => {
                    if (window.confirm(`Supprimer définitivement le message ${msg.trackingId} de ${msg.name} ? Action irréversible.`)) deleteMessage.mutate({ id: msg.id });
                  }}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Supprimer
                </Button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          unreadOnly
            ? <AdminEmptyState icon={MessageSquare} title="Aucun message non lu" description="Tous les messages reçus ont été lus." />
            : <AdminEmptyState icon={MessageSquare} title="Aucun message" description="Les demandes de contact reçues sur le site seront affichées dans cette section." />
        )}
      </div>
      <AdminLoadMore shown={items.length} total={total} loading={isLoadingMore} onLoadMore={loadMore} error={loadMoreError} onRetry={retryLoadMore} />
    </div>
  );
}

export function GdprTab() {
  const utils = trpc.useUtils();
  const { pageCount, loadMore } = useAdminPageCount("all");
  const pages = trpc.useQueries(t => adminPageOffsets(pageCount).map(offset => t.admin.gdprRequests.list({ limit: ADMIN_PAGE_SIZE, offset })));
  const { items, total, isLoading, isLoadingMore, error, loadMoreError, retryLoadMore } = mergeAdminPages(pages);
  // Note or reason being typed, per request (RGPD-12); the saved note otherwise.
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [searchedEmail, setSearchedEmail] = useState("");
  const updateStatus = trpc.admin.gdprRequests.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Demande mise à jour");
      utils.admin.gdprRequests.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (error) {
    return <AdminErrorState description={error.message} />;
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    in_progress: "bg-blue-500/20 text-blue-400",
    completed: "bg-green-500/20 text-green-400",
    rejected: "bg-red-500/20 text-red-400",
  };

  if (isLoading) {
    return <PublicContentSkeleton label="Chargement des demandes RGPD" />;
  }

  const now = new Date();

  return (
    <div className="space-y-8">
      <PersonalDataSearchPanel key={searchedEmail} requestedEmail={searchedEmail} />
      <div>
        <p className="text-sm text-muted-foreground mb-4">{adminListCount(items.length, total, "demande(s) RGPD")} · réponse due un mois après réception</p>
        <div className="space-y-3">
          {items.map((req) => {
            const note = notes[req.id] ?? req.notes ?? "";
            const reason = note.trim();
            const open = isGdprRequestOpen(req.status);
            const overdue = isGdprRequestOverdue(req, now);
            const update = (status: "in_progress" | "completed" | "rejected") => updateStatus.mutate({ id: req.id, status, notes: reason || undefined });
            return (
              <div key={req.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                      <span className="font-semibold text-foreground">{req.name}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-200">
                        {GDPR_REQUEST_TYPE_LABELS[req.requestType] || req.requestType}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[req.status] || ""}`}>
                        {GDPR_REQUEST_STATUS_LABELS[req.status] || req.status}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">{req.trackingId}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="break-all">{req.email}</span>
                      <span>Reçue le {new Date(req.createdAt).toLocaleString("fr-FR")}</span>
                      {open ? (
                        <span className={overdue ? "font-semibold text-red-400" : undefined}>
                          {overdue ? "Échéance dépassée : " : "Échéance : "}{gdprRequestDeadline(req.createdAt).toLocaleDateString("fr-FR")}
                        </span>
                      ) : req.responseDate ? (
                        <span>Répondue le {new Date(req.responseDate).toLocaleDateString("fr-FR")}</span>
                      ) : null}
                    </div>
                    {req.description && (
                      <p className="text-sm text-foreground mt-2">{req.description}</p>
                    )}
                    {open ? (
                      <label className="mt-3 block text-sm font-medium text-foreground" htmlFor={`gdpr-request-note-${req.id}`}>
                        Note interne et motif d’un refus
                        <textarea
                          id={`gdpr-request-note-${req.id}`}
                          value={note}
                          onChange={event => setNotes(current => ({ ...current, [req.id]: event.target.value }))}
                          rows={2}
                          maxLength={5000}
                          className="form-control mt-1 block w-full"
                          placeholder="Ex. identité vérifiée le…, export envoyé le…, ou motif du refus à communiquer à la personne."
                        />
                      </label>
                    ) : req.notes ? (
                      <p className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">{req.status === "rejected" ? "Motif du refus : " : "Note : "}</span>{req.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
                    <Button size="sm" variant="outline" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => {
                      setSearchedEmail(req.email);
                      document.getElementById("personal-data-search")?.scrollIntoView({ block: "start" });
                    }}>
                      <Eye className="w-3 h-3 mr-1" />
                      Ses données
                    </Button>
                    {req.status === "pending" && (
                      <Button size="sm" variant="outline" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => update("in_progress")}>
                        <Clock className="w-3 h-3 mr-1" />
                        En cours
                      </Button>
                    )}
                    {open && (
                      <Button size="sm" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => update("completed")}>
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Traité
                      </Button>
                    )}
                    {open && (
                      <Button size="sm" variant="outline" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" disabled={!reason} title={reason ? undefined : "Saisissez d’abord le motif du refus dans la note."} onClick={() => {
                        if (window.confirm(`Refuser la demande ${req.trackingId} ? Le motif saisi est enregistré avec la demande : communiquez-le à la personne dans votre réponse.`)) update("rejected");
                      }}>
                        <XCircle className="w-3 h-3 mr-1" />
                        Refuser
                      </Button>
                    )}
                    {open && (
                      <Button size="sm" variant="ghost" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" disabled={!reason || reason === (req.notes ?? "")} onClick={() => updateStatus.mutate({ id: req.id, status: req.status, notes: reason })}>
                        Enregistrer la note
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <AdminEmptyState icon={Shield} title="Aucune demande RGPD" description="Les demandes d’accès, rectification ou suppression apparaîtront ici." />
          )}
        </div>
        <AdminLoadMore shown={items.length} total={total} loading={isLoadingMore} onLoadMore={loadMore} error={loadMoreError} onRetry={retryLoadMore} />
      </div>
    </div>
  );
}

function TestimonialsTab() {
  const { data: testimonialsList, isLoading } = trpc.admin.testimonials.list.useQuery();
  const utils = trpc.useUtils();
  const updateStatus = trpc.admin.testimonials.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Témoignage mis à jour");
      utils.admin.testimonials.list.invalidate();
    },
  });
  const deleteTestimonial = trpc.admin.testimonials.delete.useMutation({
    onSuccess: () => {
      toast.success("Témoignage supprimé");
      utils.admin.testimonials.list.invalidate();
    },
  });

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    approved: "bg-green-500/20 text-green-400",
    rejected: "bg-red-500/20 text-red-400",
  };

  if (isLoading) {
    return <PublicContentSkeleton label="Chargement des témoignages administratifs" />;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{testimonialsList?.length || 0} témoignage(s)</p>
      <div className="space-y-3">
        {testimonialsList?.map((t) => (
          <div key={t.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                  <span className="font-semibold text-foreground">{t.authorName}</span>
                  <div className="flex">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-cyan-400 text-cyan-400" />
                    ))}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[t.status] || ""}`}>
                    {t.status}
                  </span>
                  {t.featured === 1 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400">Featured</span>}
                </div>
                <p className="break-words text-sm font-medium text-foreground">{t.title}</p>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.content}</p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
                {t.status !== "approved" && (
                  <Button size="sm" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => updateStatus.mutate({ id: t.id, status: "approved" })}>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Approuver
                  </Button>
                )}
                {t.status !== "rejected" && (
                  <Button size="sm" variant="outline" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => updateStatus.mutate({ id: t.id, status: "rejected" })}>
                    <XCircle className="w-3 h-3 mr-1" />
                    Rejeter
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-10 flex-1 sm:min-h-0 sm:flex-none"
                  onClick={() => updateStatus.mutate({ id: t.id, status: t.status, featured: t.featured === 1 ? 0 : 1 })}
                >
                  {t.featured === 1 ? "Retirer" : "Mettre en avant"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="min-h-10 flex-1 sm:min-h-0 sm:flex-none"
                  onClick={() => {
                    if (confirm("Supprimer ce témoignage ?")) {
                      deleteTestimonial.mutate({ id: t.id });
                    }
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {(!testimonialsList || testimonialsList.length === 0) && (
          <p className="text-center text-muted-foreground py-8">Aucun témoignage</p>
        )}
      </div>
    </div>
  );
}

function BlogTab() {
  const utils = trpc.useUtils();
  const { data: posts, isLoading, error } = trpc.admin.blog.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [form, setForm] = useState({ title: "", slug: "", excerpt: "", content: "", category: "anesthesie", language: "fr", source: "", coverImage: "", published: true });

  const createPost = trpc.admin.blog.create.useMutation({
    onSuccess: () => {
      toast.success("Article créé");
      utils.admin.blog.list.invalidate();
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePost = trpc.admin.blog.update.useMutation({
    onSuccess: () => {
      toast.success("Article mis à jour");
      utils.admin.blog.list.invalidate();
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePost = trpc.admin.blog.delete.useMutation({
    onSuccess: () => {
      toast.success("Article supprimé");
      utils.admin.blog.list.invalidate();
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingPost(null);
    setForm({ title: "", slug: "", excerpt: "", content: "", category: "anesthesie", language: "fr", source: "", coverImage: "", published: true });
  };

  const handleEdit = (post: any) => {
    setEditingPost(post);
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || "",
      content: post.content,
      category: post.category,
      language: post.language || "fr",
      source: post.source || "",
      coverImage: post.coverImage || "",
      published: post.published === 1,
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.title || !form.slug || !form.content) {
      toast.error("Titre, slug et contenu sont obligatoires");
      return;
    }
    if (editingPost) {
      updatePost.mutate({ id: editingPost.id, ...form, published: form.published ? 1 : 0 });
    } else {
      createPost.mutate({ ...form, published: form.published ? 1 : 0 });
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  if (error) {
    return <div className="text-center py-8 text-red-400">Erreur : {error.message}</div>;
  }

  if (isLoading) {
    return <PublicContentSkeleton label="Chargement des contenus éditoriaux" />;
  }

  return (
      <div>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{posts?.length || 0} article(s)</p>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvel article
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 sm:p-6 mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {editingPost ? "Modifier l'article" : "Nouvel article"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Titre *</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.title}
                onChange={(e) => {
                  setForm({ ...form, title: e.target.value, slug: editingPost ? form.slug : generateSlug(e.target.value) });
                }}
                placeholder="Titre de l'article"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Slug *</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="url-de-larticle"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Catégorie</label>
              <select
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="anesthesie">Anesthésie</option>
                <option value="reanimation">Réanimation</option>
                <option value="innovation">Innovation</option>
                <option value="recherche">Recherche</option>
                <option value="general">Général</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Langue</label>
              <select
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="zh">中文</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Source (URL)</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Image de couverture (URL)</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                value={form.coverImage}
                onChange={(e) => setForm({ ...form, coverImage: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-sm text-muted-foreground block mb-1">Résumé</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground h-20 resize-y"
              value={form.excerpt}
              onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              placeholder="Résumé court de l'article..."
            />
          </div>
          <div className="mb-4">
            <label className="text-sm text-muted-foreground block mb-1">Contenu * (Markdown)</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground h-48 resize-y font-mono text-sm"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Contenu de l'article en Markdown..."
            />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
                className="rounded"
              />
              Publié
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button className="min-h-11 w-full sm:w-auto sm:min-h-0" variant="outline" onClick={resetForm}>Annuler</Button>
              <Button className="min-h-11 w-full sm:w-auto sm:min-h-0" onClick={handleSubmit} disabled={createPost.isPending || updatePost.isPending}>
                {editingPost ? "Mettre à jour" : "Créer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {posts?.map((post) => (
          <div key={post.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-foreground">{post.title}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${post.published === 1 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                    {post.published === 1 ? "Publié" : "Brouillon"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-200 capitalize">{post.category}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Globe className="w-3 h-3" />{post.language?.toUpperCase() || "FR"}
                  </span>
                </div>
                <div className="flex gap-3 text-sm text-muted-foreground">
                  <span>/blog/{post.slug}</span>
                  <span>{new Date(post.createdAt).toLocaleDateString("fr-FR")}</span>
                </div>
                {post.excerpt && <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{post.excerpt}</p>}
              </div>
              <div className="flex w-full gap-2 shrink-0 sm:w-auto">
                <Button size="sm" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" variant="outline" onClick={() => handleEdit(post)}>
                  <Edit className="w-3 h-3 mr-1" />
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="min-h-10 sm:min-h-0"
                  onClick={() => {
                    if (confirm("Supprimer cet article ?")) {
                      deletePost.mutate({ id: post.id });
                    }
                  }}
                >
                  <Trash className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {(!posts || posts.length === 0) && (
          <p className="text-center text-muted-foreground py-8">Aucun article. Cliquez sur "Nouvel article" pour commencer.</p>
        )}
      </div>
    </div>
  );
}

function AvailabilityTab() {
  const utils = trpc.useUtils();
  const { data: slots, isLoading: slotsLoading } = trpc.admin.availability.listSlots.useQuery();
  const { data: blockedDates, isLoading: blockedLoading } = trpc.admin.availability.listBlockedDates.useQuery();

  const [showSlotForm, setShowSlotForm] = useState(false);
  const [slotForm, setSlotForm] = useState({ dayOfWeek: 1, startTime: "09:00", endTime: "10:00" });
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockForm, setBlockForm] = useState({ date: "", reason: "" });

  const createSlot = trpc.admin.availability.addSlot.useMutation({
    onSuccess: () => {
      toast.success("Créneau ajouté");
      utils.admin.availability.listSlots.invalidate();
      setShowSlotForm(false);
      setSlotForm({ dayOfWeek: 1, startTime: "09:00", endTime: "10:00" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSlot = trpc.admin.availability.deleteSlot.useMutation({
    onSuccess: () => {
      toast.success("Créneau supprimé");
      utils.admin.availability.listSlots.invalidate();
    },
  });

  const blockDate = trpc.admin.availability.addBlockedDate.useMutation({
    onSuccess: ({ paidAppointments }) => {
      toast.success("Date bloquée");
      if (paidAppointments.length > 0) toast.warning(`Rendez-vous payés à traiter ce jour-là : ${paidAppointments.join(", ")}.`);
      utils.admin.availability.listBlockedDates.invalidate();
      setShowBlockForm(false);
      setBlockForm({ date: "", reason: "" });
    },
    onError: (e, variables) => {
      // Rendez-vous payés ce jour-là : avertir, puis bloquer seulement après confirmation.
      if (e.data?.code === "PRECONDITION_FAILED" && !variables.acknowledgePaidAppointments) {
        if (window.confirm(`${e.message}\n\nBloquer quand même cette date ?`)) blockDate.mutate({ ...variables, acknowledgePaidAppointments: true });
        return;
      }
      toast.error(e.message);
    },
  });

  const unblockDate = trpc.admin.availability.removeBlockedDate.useMutation({
    onSuccess: () => {
      toast.success("Date débloquée");
      utils.admin.availability.listBlockedDates.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

  if (slotsLoading || blockedLoading) {
    return <PublicContentSkeleton label="Chargement des disponibilités" />;
  }

  return (
    <div className="space-y-8">
      {/* Créneaux hebdomadaires */}
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-foreground">Créneaux hebdomadaires</h3>
          <Button size="sm" className="min-h-10 w-full sm:w-auto sm:min-h-0" onClick={() => setShowSlotForm(!showSlotForm)}>
            <Plus className="w-4 h-4 mr-2" />
            Ajouter un créneau
          </Button>
        </div>

        {showSlotForm && (
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Jour</label>
                <select
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={slotForm.dayOfWeek}
                  onChange={(e) => setSlotForm({ ...slotForm, dayOfWeek: parseInt(e.target.value) })}
                >
                  {dayNames.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Début</label>
                <input
                  type="time"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={slotForm.startTime}
                  onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Fin</label>
                <input
                  type="time"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={slotForm.endTime}
                  onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })}
                />
              </div>
              <Button className="min-h-11 w-full md:w-auto md:min-h-0" onClick={() => createSlot.mutate(slotForm)} disabled={createSlot.isPending}>
                Ajouter
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {slots?.map((slot) => (
            <div key={slot.id} className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                <span className="font-medium text-foreground">{dayNames[slot.dayOfWeek]}</span>
                <span className="text-sm text-muted-foreground ml-2">{slot.startTime} - {slot.endTime}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-10 self-start sm:min-h-0"
                aria-label={`Supprimer le créneau ${dayNames[slot.dayOfWeek]} ${slot.startTime} - ${slot.endTime}`}
                onClick={() => {
                  if (!window.confirm(`Supprimer le créneau ${dayNames[slot.dayOfWeek]} ${slot.startTime} - ${slot.endTime} ?`)) return;
                  deleteSlot.mutate({ id: slot.id });
                }}
              >
                <Trash className="w-3 h-3 text-red-400" />
              </Button>
            </div>
          ))}
          {(!slots || slots.length === 0) && (
            <p className="text-muted-foreground col-span-full text-center py-4">Aucun créneau configuré</p>
          )}
        </div>
      </section>

      {/* Dates bloquées */}
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-foreground">Dates bloquées</h3>
          <Button size="sm" className="min-h-10 w-full sm:w-auto sm:min-h-0" onClick={() => setShowBlockForm(!showBlockForm)}>
            <Plus className="w-4 h-4 mr-2" />
            Bloquer une date
          </Button>
        </div>

        {showBlockForm && (
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={blockForm.date}
                  onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Motif interne (optionnel, jamais affiché sur le site)</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  placeholder="Note pour vous uniquement"
                />
              </div>
              <Button className="min-h-11 w-full md:w-auto md:min-h-0" onClick={() => blockDate.mutate(blockForm)} disabled={blockDate.isPending || !blockForm.date}>
                Bloquer
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {blockedDates?.map((bd) => (
            <div key={bd.id} className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                <span className="font-medium text-foreground">{new Date(bd.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
                {bd.reason && <span className="text-sm text-muted-foreground ml-3">{bd.reason}</span>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-10 self-start sm:min-h-0"
                onClick={() => unblockDate.mutate({ id: bd.id })}
              >
                <XCircle className="w-4 h-4 text-red-400" />
              </Button>
            </div>
          ))}
          {(!blockedDates || blockedDates.length === 0) && (
            <p className="text-muted-foreground text-center py-4">Aucune date bloquée</p>
          )}
        </div>
      </section>
    </div>
  );
}
