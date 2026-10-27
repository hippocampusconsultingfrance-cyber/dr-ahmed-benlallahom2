import { useAuth } from "@/_core/hooks/useAuth";
import { SignInButton, UserButton } from "@clerk/react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, MessageSquare, Shield, DollarSign, ArrowLeft, Star, CalendarDays, UserRound, BriefcaseBusiness, Send, UsersRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import RecruitmentTab from "@/components/RecruitmentTab";
import EmployerBriefsTab from "@/components/EmployerBriefsTab";
import VivierTab from "@/components/VivierTab";
import MailingTab from "@/components/MailingTab";
import CandidateDocumentsAdminTab from "@/components/CandidateDocumentsAdminTab";
import SecurityOperationsTab from "@/components/SecurityOperationsTab";
import MedicalQuestionsAdminTab from "@/components/MedicalQuestionsAdminTab";
import OverviewTab from "@/components/OverviewTab";
import AppointmentsTab from "@/components/AppointmentsTab";
import ContactsTab from "@/components/ContactsTab";
import GdprTab from "@/components/GdprTab";
import TestimonialsTab from "@/components/TestimonialsTab";
import AvailabilityTab from "@/components/AvailabilityTab";
import AdminConfigurationBanner from "@/components/AdminConfigurationBanner";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { getActiveAdminTabLabel } from "./adminDashboardMobileTabs";

export type Tab = "overview" | "appointments" | "contacts" | "gdpr" | "testimonials" | "availability" | "recruitment" | "candidateDocuments" | "security" | "vivier" | "mailing" | "employerBriefs" | "medicalQuestions";

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
