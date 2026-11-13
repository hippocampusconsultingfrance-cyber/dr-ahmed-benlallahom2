import { useAuth } from "@/_core/hooks/useAuth";
import { SignInButton, UserButton } from "@clerk/react";
import { trpc } from "@/lib/trpc";
import { Suspense, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, MessageSquare, Shield, DollarSign, ArrowLeft, Star, CalendarDays, UserRound, BriefcaseBusiness, Send, UsersRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link, useLocation, useSearch } from "wouter";
import { adminLocationOf, adminPath, type AdminTab } from "@shared/adminTabs";
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
import { CandidateDocumentsAdminTab, EmployerBriefsTab, MailingTab, RecruitmentTab, VivierTab } from "./adminLazyTabs";

export type Tab = AdminTab;

/**
 * A11Y-13: the dashboard is written in French whatever the site's language, which the page's html
 * lang carries, so each of its screens says lang="fr". These tabs are translated (ADM-07): they
 * follow the site's language, and say it.
 */
function InSiteLanguage({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  return <div lang={language}>{children}</div>;
}

export default function AdminDashboard() {
  const { user, loading, refresh, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const signOut = () => {
    setSigningOut(true);
    void logout().finally(() => setSigningOut(false));
  };
  const [, setLocation] = useLocation();
  // ADM-09: the section and the element live in the address
  // (/admin?tab=…&ref=…, shared/adminTabs.ts): a reload, the Clerk sign-in
  // and the security code keep them, a notification's link opens them, and
  // Back returns to the previous section. Another section, or the open one
  // chosen again, leaves the element.
  const { tab: activeTab, reference } = adminLocationOf(useSearch());
  const setActiveTab = (tab: Tab) => {
    if (tab !== activeTab || reference) setLocation(adminPath(tab));
  };
  const [mailingSelectedIds, setMailingSelectedIds] = useState<number[]>([]);
  const [mfaCode, setMfaCode] = useState("");
  const adminSecurity = trpc.adminSecurity.status.useQuery(undefined, { enabled: Boolean(user?.role === "admin") });
  const requestMfa = trpc.adminSecurity.begin.useMutation({ onSuccess: () => toast.success("Un code de sécurité a été envoyé à votre email administrateur."), onError: error => toast.error(error.message) });
  const verifyMfa = trpc.adminSecurity.verify.useMutation({ onSuccess: () => { void adminSecurity.refetch(); toast.success("Double authentification validée."); }, onError: error => toast.error(error.message) });
  // A11Y-12: the code is a form's, which Entrée sends as « Valider le code » does.
  const submitMfaCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mfaCode.length === 6 && !verifyMfa.isPending) verifyMfa.mutate({ code: mfaCode });
  };
  // ADM-14: a backup code noted from the Sécurité tab, for a mailbox lost or an email that does not arrive.
  const [showBackupCode, setShowBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const verifyBackupCode = trpc.adminSecurity.verifyBackupCode.useMutation({ onSuccess: ({ remaining }) => { void adminSecurity.refetch(); toast.success(`Code de secours accepté ; il ne servira plus. Codes restants : ${remaining}, à renouveler dans l’onglet « Sécurité ».`); }, onError: error => toast.error(error.message) });
  const submitBackupCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (backupCode.trim() && !verifyBackupCode.isPending) verifyBackupCode.mutate({ code: backupCode });
  };

  if (loading) {
    return (
      <div lang="fr" className="min-h-screen bg-background px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <PublicContentSkeleton cards={1} label="Chargement de l’accès administrateur" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div lang="fr" className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Connexion administrateur requise</h1>
          <p className="text-muted-foreground mb-6">Connectez-vous avec le compte propriétaire pour accéder aux candidatures et aux missions.</p>
          <SignInButton mode="modal" forceRedirectUrl={adminPath(activeTab, reference)}>
            <Button>Se connecter</Button>
          </SignInButton>
        </div>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div lang="fr" className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Accès refusé</h1>
          <p className="text-muted-foreground mb-6">Votre session ne possède pas les permissions nécessaires. Si votre rôle vient d’être mis à jour, actualisez l’accès ou reconnectez-vous.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => void refresh()}>
              Actualiser l’accès
            </Button>
            <UserButton showName />
            <Button asChild variant="ghost">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Accueil
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (adminSecurity.isLoading) {
    return <div lang="fr" className="min-h-screen bg-background px-4 py-16"><div className="mx-auto max-w-3xl"><PublicContentSkeleton cards={1} label="Vérification de sécurité" /></div></div>;
  }

  if (!adminSecurity.data?.verified) {
    // The page's main region, which « Aller au contenu principal » reaches (A11Y-12).
    return <main lang="fr" className="min-h-screen bg-background flex items-center justify-center px-4"><div className="w-full max-w-md rounded-2xl border border-cyan-900/50 bg-card p-7 shadow-2xl"><div className="mb-5 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Shield className="h-6 w-6"/></span><div><h1 className="text-xl font-bold text-foreground">Validation de sécurité</h1><p className="text-sm text-muted-foreground">Une seconde vérification protège les documents et CV sensibles.</p></div></div><p className="mb-4 text-sm text-muted-foreground">Demandez un code à six chiffres sur votre email administrateur, puis saisissez-le ci-dessous.</p><Button className="mb-5 w-full" onClick={() => requestMfa.mutate()} disabled={requestMfa.isPending}>{requestMfa.isPending ? "Envoi en cours…" : "Envoyer un code de sécurité"}</Button><form className="space-y-2" onSubmit={submitMfaCode}><label htmlFor="admin-mfa-code" className="text-sm font-medium text-foreground">Code à 6 chiffres</label><Input id="admin-mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, ""))} placeholder="123456"/><Button type="submit" className="mt-2 w-full" variant="outline" disabled={mfaCode.length !== 6 || verifyMfa.isPending}>{verifyMfa.isPending ? "Vérification…" : "Valider le code"}</Button></form>{showBackupCode ? <form className="mt-5 space-y-2 border-t border-border pt-4" onSubmit={submitBackupCode}><label htmlFor="admin-mfa-backup-code" className="text-sm font-medium text-foreground">Code de secours</label><p id="admin-mfa-backup-code-help" className="text-xs text-muted-foreground">L’un des dix codes notés depuis l’onglet « Sécurité », si l’email n’arrive pas. Chacun ne sert qu’une fois.</p><Input id="admin-mfa-backup-code" aria-describedby="admin-mfa-backup-code-help" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={32} value={backupCode} onChange={event => setBackupCode(event.target.value)} placeholder="ABCDE-FGHJK"/><Button type="submit" className="mt-2 w-full" variant="outline" disabled={!backupCode.trim() || verifyBackupCode.isPending}>{verifyBackupCode.isPending ? "Vérification…" : "Valider le code de secours"}</Button></form> : <Button variant="link" className="mt-2 w-full" onClick={() => setShowBackupCode(true)}>Utiliser un code de secours</Button>}<Button asChild variant="ghost" className="mt-3 w-full"><Link href="/">Retour au site</Link></Button><Button variant="ghost" className="mt-1 w-full" onClick={signOut} disabled={signingOut}><LogOut className="mr-2 h-4 w-4"/>{signingOut ? "Déconnexion…" : "Se déconnecter"}</Button></div></main>;
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
    <div lang="fr" className="min-h-screen bg-background print-paper">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* Le site est un vrai lien, comme les autres retours vers le site de cette page (A11Y-17). */}
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Site
              </Link>
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
      <nav aria-label="Sections" className="border-b border-border bg-card/30">
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
          {/* ADM-08: the tabs wrap onto a second line rather than run off screen. */}
          <div
            className="hidden max-w-full flex-wrap gap-x-3 gap-y-1 px-1 py-2 sm:flex"
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
        {/* A list opens on the element the address names (searched, selected or set apart); another reference mounts it again. */}
        {activeTab === "appointments" && <AppointmentsTab key={reference} initialSearch={reference} />}
        {activeTab === "contacts" && <ContactsTab key={reference} initialSearch={reference} />}
        {activeTab === "gdpr" && <GdprTab key={reference} reference={reference} />}
        {activeTab === "testimonials" && <TestimonialsTab />}
        {activeTab === "availability" && <AvailabilityTab />}
        {/* The recruitment tabs load when first opened (adminLazyTabs.ts). */}
        <Suspense fallback={<PublicContentSkeleton label="Chargement de la section" />}>
          {activeTab === "recruitment" && <RecruitmentTab key={reference} initialSearch={reference} />}
          {activeTab === "candidateDocuments" && <InSiteLanguage><CandidateDocumentsAdminTab /></InSiteLanguage>}
          {activeTab === "vivier" && <InSiteLanguage><VivierTab onCompose={candidateIds => { setMailingSelectedIds(candidateIds); setActiveTab("mailing"); }} /></InSiteLanguage>}
          {activeTab === "mailing" && <InSiteLanguage><MailingTab initialSelectedIds={mailingSelectedIds} /></InSiteLanguage>}
          {activeTab === "employerBriefs" && <InSiteLanguage><EmployerBriefsTab key={reference} reference={reference} /></InSiteLanguage>}
        </Suspense>
        {activeTab === "security" && <InSiteLanguage><SecurityOperationsTab /></InSiteLanguage>}
        {activeTab === "medicalQuestions" && <MedicalQuestionsAdminTab key={reference} initialSearch={reference} />}
      </main>
    </div>
  );
}
