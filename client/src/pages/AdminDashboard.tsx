import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, MessageSquare, Shield, DollarSign, Eye, CheckCircle, XCircle, Clock, ArrowLeft, Star, Trash2, FileText, CalendarDays, Plus, Edit, Trash, Globe, UserRound, BriefcaseBusiness, Send, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import RecruitmentTab from "@/components/RecruitmentTab";
import EmployerBriefsTab from "@/components/EmployerBriefsTab";
import VivierTab from "@/components/VivierTab";
import MailingTab from "@/components/MailingTab";
import CandidateDocumentsAdminTab from "@/components/CandidateDocumentsAdminTab";
import SecurityOperationsTab from "@/components/SecurityOperationsTab";
import RecruitmentDashboardPanel from "@/components/RecruitmentDashboardPanel";
import { AdminEmptyState, AdminErrorState } from "@/components/AdminStatePanel";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { getActiveAdminTabLabel } from "./adminDashboardMobileTabs";
import { buildAppointmentsAgenda } from "./appointmentsAgenda";

type Tab = "overview" | "appointments" | "contacts" | "gdpr" | "testimonials" | "availability" | "recruitment" | "candidateDocuments" | "security" | "vivier" | "mailing" | "employerBriefs";

export const adminShellCopy = {
  fr: { title: "Administration", site: "Site", section: "Section d’administration", access: { loading: "Chargement de l’accès administrateur", loginRequired: "Connexion administrateur requise", loginDescription: "Connectez-vous avec le compte propriétaire pour accéder aux candidatures et aux missions.", login: "Se connecter", forbidden: "Accès refusé", forbiddenDescription: "Votre session ne possède pas les permissions nécessaires. Si votre rôle vient d’être mis à jour, actualisez l’accès ou reconnectez-vous.", refresh: "Actualiser l’accès", reconnect: "Se reconnecter", home: "Accueil", checking: "Vérification de sécurité", mfaTitle: "Validation de sécurité", mfaDescription: "Une seconde vérification protège les documents et CV sensibles.", mfaInstructions: "Demandez un code à six chiffres sur votre email administrateur, puis saisissez-le ci-dessous.", sendCode: "Envoyer un code de sécurité", sending: "Envoi en cours…", codeLabel: "Code à 6 chiffres", verifying: "Vérification…", verify: "Valider le code", backToSite: "Retour au site", codeSent: "Un code de sécurité a été envoyé à votre email administrateur.", mfaVerified: "Double authentification validée." }, tabs: { overview: "Vue d’ensemble", appointments: "Réservations", contacts: "Messages", gdpr: "RGPD", testimonials: "Témoignages", availability: "Disponibilités", recruitment: "Candidatures", candidateDocuments: "Documents candidats", security: "Sécurité", vivier: "Vivier", mailing: "Mailing", employerBriefs: "Missions" } },
  en: { title: "Administration", site: "Website", section: "Administration section", access: { loading: "Loading administrator access", loginRequired: "Administrator sign-in required", loginDescription: "Sign in with the owner account to access applications and assignments.", login: "Sign in", forbidden: "Access denied", forbiddenDescription: "Your session does not have the required permissions. If your role was updated, refresh access or sign in again.", refresh: "Refresh access", reconnect: "Sign in again", home: "Home", checking: "Security verification", mfaTitle: "Security verification", mfaDescription: "A second check protects sensitive documents and CVs.", mfaInstructions: "Request a six-digit code at your administrator email address, then enter it below.", sendCode: "Send a security code", sending: "Sending…", codeLabel: "6-digit code", verifying: "Verifying…", verify: "Verify code", backToSite: "Back to website", codeSent: "A security code was sent to your administrator email.", mfaVerified: "Two-factor authentication verified." }, tabs: { overview: "Overview", appointments: "Appointments", contacts: "Messages", gdpr: "GDPR", testimonials: "Testimonials", availability: "Availability", recruitment: "Applications", candidateDocuments: "Candidate documents", security: "Security", vivier: "Talent pool", mailing: "Mailing", employerBriefs: "Missions" } },
  de: { title: "Verwaltung", site: "Website", section: "Verwaltungsbereich", access: { loading: "Administratorzugang wird geladen", loginRequired: "Administratoranmeldung erforderlich", loginDescription: "Melden Sie sich mit dem Eigentümerkonto an, um auf Bewerbungen und Aufträge zuzugreifen.", login: "Anmelden", forbidden: "Zugriff verweigert", forbiddenDescription: "Ihre Sitzung besitzt nicht die erforderlichen Berechtigungen. Wenn Ihre Rolle aktualisiert wurde, aktualisieren Sie den Zugang oder melden Sie sich erneut an.", refresh: "Zugang aktualisieren", reconnect: "Erneut anmelden", home: "Startseite", checking: "Sicherheitsüberprüfung", mfaTitle: "Sicherheitsüberprüfung", mfaDescription: "Eine zweite Prüfung schützt sensible Dokumente und Lebensläufe.", mfaInstructions: "Fordern Sie einen sechsstelligen Code über Ihre Administrator-E-Mail an und geben Sie ihn unten ein.", sendCode: "Sicherheitscode senden", sending: "Wird gesendet…", codeLabel: "6-stelliger Code", verifying: "Wird überprüft…", verify: "Code bestätigen", backToSite: "Zur Website zurück", codeSent: "Ein Sicherheitscode wurde an Ihre Administrator-E-Mail gesendet.", mfaVerified: "Zwei-Faktor-Authentifizierung bestätigt." }, tabs: { overview: "Übersicht", appointments: "Termine", contacts: "Nachrichten", gdpr: "DSGVO", testimonials: "Bewertungen", availability: "Verfügbarkeiten", recruitment: "Bewerbungen", candidateDocuments: "Kandidatendokumente", security: "Sicherheit", vivier: "Talentpool", mailing: "Mailing", employerBriefs: "Aufträge" } },
  zh: { title: "管理后台", site: "网站", section: "管理栏目", access: { loading: "正在加载管理员访问权限", loginRequired: "需要管理员登录", loginDescription: "请使用所有者账户登录，以访问申请和任务。", login: "登录", forbidden: "访问被拒绝", forbiddenDescription: "当前会话没有所需权限。若您的角色刚刚更新，请刷新访问权限或重新登录。", refresh: "刷新访问权限", reconnect: "重新登录", home: "首页", checking: "安全验证", mfaTitle: "安全验证", mfaDescription: "第二次验证可保护敏感文件和简历。", mfaInstructions: "请向管理员邮箱申请六码验证码，然后在下方输入。", sendCode: "发送安全验证码", sending: "正在发送…", codeLabel: "6 位验证码", verifying: "正在验证…", verify: "验证代码", backToSite: "返回网站", codeSent: "安全验证码已发送至您的管理员邮箱。", mfaVerified: "双重身份验证已完成。" }, tabs: { overview: "概览", appointments: "预约", contacts: "消息", gdpr: "隐私保护", testimonials: "合作伙伴评价", availability: "可用时间", recruitment: "申请", candidateDocuments: "候选人文件", security: "安全", vivier: "人才库", mailing: "邮件活动", employerBriefs: "任务需求" } },
} as const;

export const adminOverviewCopy = {
  fr: { loading: "Chargement des indicateurs administratifs", error: "Erreur de chargement", bookings: "Réservations", messages: "Messages", gdpr: "Demandes RGPD", revenue: "Revenus", eyebrow: "Accès rapide", title: "Recrutement & Missions", intro: "Accédez directement aux CV déposés et aux besoins transmis par les employeurs.", applications: "Candidatures", applicationsDescription: "Consulter les CV, analyses IA, disponibilités et certifications.", missions: "Missions", missionsDescription: "Gérer les briefs Employeurs et créer des shortlists de candidats." },
  en: { loading: "Loading administration indicators", error: "Loading error", bookings: "Appointments", messages: "Messages", gdpr: "GDPR requests", revenue: "Revenue", eyebrow: "Quick access", title: "Recruitment & missions", intro: "Access submitted CVs and needs shared by employers directly.", applications: "Applications", applicationsDescription: "Review CVs, AI analyses, availability and certifications.", missions: "Missions", missionsDescription: "Manage employer briefs and create candidate shortlists." },
  de: { loading: "Verwaltungsindikatoren werden geladen", error: "Ladefehler", bookings: "Termine", messages: "Nachrichten", gdpr: "DSGVO-Anfragen", revenue: "Umsatz", eyebrow: "Schnellzugriff", title: "Recruiting & Aufträge", intro: "Greifen Sie direkt auf eingereichte Lebensläufe und Arbeitgeberanforderungen zu.", applications: "Bewerbungen", applicationsDescription: "Lebensläufe, KI-Analysen, Verfügbarkeiten und Zertifikate prüfen.", missions: "Aufträge", missionsDescription: "Arbeitgeber-Briefs verwalten und Kandidaten-Shortlists erstellen." },
  zh: { loading: "正在加载管理指标", error: "加载出错", bookings: "预约", messages: "消息", gdpr: "隐私请求", revenue: "收入", eyebrow: "快速入口", title: "招聘与任务", intro: "直接查看已提交的简历和雇主需求。", applications: "申请", applicationsDescription: "查看简历、AI 分析、可入职时间和认证。", missions: "任务", missionsDescription: "管理雇主需求并创建候选人短名单。" },
} as const;

export const adminAppointmentsCopy = {
  fr: { statusUpdated: "Statut mis à jour", refundConfirmed: (amount: string | number) => `Remboursement confirmé : ${amount} €`, loading: "Chargement des rendez-vous", all: "Tous", paymentStatus: { pending: "En attente", completed: "Payé", failed: "Échoué", refunded: "Remboursé" }, appointmentStatus: { confirmed: "Confirmé", cancelled: "Annulé", completed: "Terminé", no_show: "Absent" }, total: (count: number) => `${count} réservation${count > 1 ? "s" : ""}`, agenda: "Prochains rendez-vous", timezone: "Fuseau Europe/Paris", noUpcoming: "Aucun rendez-vous confirmé à venir pour le moment.", complete: "Terminer", refund: "Rembourser", confirmRefund: (amount: string | number, trackingId: string) => `Confirmer le remboursement de ${amount} € pour ${trackingId} ?`, refundReason: "Remboursement demandé par l’administration", emptyTitle: "Aucune réservation", emptyDescription: "Les nouvelles réservations apparaîtront ici dès leur confirmation." },
  en: { statusUpdated: "Status updated", refundConfirmed: (amount: string | number) => `Refund confirmed: €${amount}`, loading: "Loading appointments", all: "All", paymentStatus: { pending: "Pending", completed: "Paid", failed: "Failed", refunded: "Refunded" }, appointmentStatus: { confirmed: "Confirmed", cancelled: "Cancelled", completed: "Completed", no_show: "No-show" }, total: (count: number) => `${count} appointment${count > 1 ? "s" : ""}`, agenda: "Upcoming appointments", timezone: "Europe/Paris time zone", noUpcoming: "There are no confirmed upcoming appointments at the moment.", complete: "Complete", refund: "Refund", confirmRefund: (amount: string | number, trackingId: string) => `Confirm the €${amount} refund for ${trackingId}?`, refundReason: "Refund requested by administration", emptyTitle: "No appointments", emptyDescription: "New appointments will appear here once confirmed." },
  de: { statusUpdated: "Status aktualisiert", refundConfirmed: (amount: string | number) => `Rückerstattung bestätigt: ${amount} €`, loading: "Termine werden geladen", all: "Alle", paymentStatus: { pending: "Ausstehend", completed: "Bezahlt", failed: "Fehlgeschlagen", refunded: "Erstattet" }, appointmentStatus: { confirmed: "Bestätigt", cancelled: "Storniert", completed: "Abgeschlossen", no_show: "Nicht erschienen" }, total: (count: number) => `${count} Termin${count === 1 ? "" : "e"}`, agenda: "Kommende Termine", timezone: "Zeitzone Europa/Paris", noUpcoming: "Derzeit gibt es keine bestätigten kommenden Termine.", complete: "Abschließen", refund: "Erstatten", confirmRefund: (amount: string | number, trackingId: string) => `Rückerstattung von ${amount} € für ${trackingId} bestätigen?`, refundReason: "Rückerstattung von der Verwaltung angefordert", emptyTitle: "Keine Termine", emptyDescription: "Neue Termine werden hier nach der Bestätigung angezeigt." },
  zh: { statusUpdated: "状态已更新", refundConfirmed: (amount: string | number) => `退款已确认：${amount} 欧元`, loading: "正在加载预约", all: "全部", paymentStatus: { pending: "待处理", completed: "已付款", failed: "失败", refunded: "已退款" }, appointmentStatus: { confirmed: "已确认", cancelled: "已取消", completed: "已完成", no_show: "未到场" }, total: (count: number) => `${count} 个预约`, agenda: "即将到来的预约", timezone: "欧洲/巴黎时区", noUpcoming: "目前没有已确认的即将到来的预约。", complete: "完成", refund: "退款", confirmRefund: (amount: string | number, trackingId: string) => `确认向 ${trackingId} 退款 ${amount} 欧元？`, refundReason: "管理端请求退款", emptyTitle: "暂无预约", emptyDescription: "新的预约确认后将显示在这里。" },
} as const;

export const adminContactsCopy = {
  fr: { markedRead: "Marqué comme lu", loading: "Chargement des messages", total: (count: number) => `${count} message${count > 1 ? "s" : ""}`, read: "Lu", emptyTitle: "Aucun message", emptyDescription: "Les demandes de contact reçues sur le site seront affichées dans cette section." },
  en: { markedRead: "Marked as read", loading: "Loading messages", total: (count: number) => `${count} message${count > 1 ? "s" : ""}`, read: "Read", emptyTitle: "No messages", emptyDescription: "Contact requests received through the website will appear in this section." },
  de: { markedRead: "Als gelesen markiert", loading: "Nachrichten werden geladen", total: (count: number) => `${count} Nachricht${count === 1 ? "" : "en"}`, read: "Gelesen", emptyTitle: "Keine Nachrichten", emptyDescription: "Über die Website eingegangene Kontaktanfragen werden in diesem Bereich angezeigt." },
  zh: { markedRead: "已标记为已读", loading: "正在加载消息", total: (count: number) => `${count} 条消息`, read: "已读", emptyTitle: "暂无消息", emptyDescription: "通过网站收到的联系请求将显示在此区域。" },
} as const;

export default function AdminDashboard() {
  const { user, loading, refresh } = useAuth();
  const { language } = useLanguage();
  const shell = adminShellCopy[language as keyof typeof adminShellCopy] ?? adminShellCopy.fr;
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [mailingSelectedIds, setMailingSelectedIds] = useState<number[]>([]);
  const [mfaCode, setMfaCode] = useState("");
  const adminSecurity = trpc.adminSecurity.status.useQuery(undefined, { enabled: Boolean(user?.role === "admin") });
  const requestMfa = trpc.adminSecurity.begin.useMutation({ onSuccess: () => toast.success(shell.access.codeSent), onError: error => toast.error(error.message) });
  const verifyMfa = trpc.adminSecurity.verify.useMutation({ onSuccess: () => { void adminSecurity.refetch(); toast.success(shell.access.mfaVerified); }, onError: error => toast.error(error.message) });

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <PublicContentSkeleton cards={1} label={shell.access.loading} />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">{shell.access.loginRequired}</h1>
          <p className="text-muted-foreground mb-6">{shell.access.loginDescription}</p>
          <Button onClick={startLogin}>
            {shell.access.login}
          </Button>
        </div>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">{shell.access.forbidden}</h1>
          <p className="text-muted-foreground mb-6">{shell.access.forbiddenDescription}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => void refresh()}>
              {shell.access.refresh}
            </Button>
            <Button onClick={startLogin}>{shell.access.reconnect}</Button>
            <Button variant="ghost" onClick={() => setLocation("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {shell.access.home}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (adminSecurity.isLoading) {
    return <div className="min-h-screen bg-background px-4 py-16"><div className="mx-auto max-w-3xl"><PublicContentSkeleton cards={1} label={shell.access.checking} /></div></div>;
  }

  if (!adminSecurity.data?.verified) {
    return <div className="min-h-screen bg-background flex items-center justify-center px-4"><div className="w-full max-w-md rounded-2xl border border-cyan-900/50 bg-card p-7 shadow-2xl"><div className="mb-5 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Shield className="h-6 w-6"/></span><div><h1 className="text-xl font-bold text-foreground">{shell.access.mfaTitle}</h1><p className="text-sm text-muted-foreground">{shell.access.mfaDescription}</p></div></div><p className="mb-4 text-sm text-muted-foreground">{shell.access.mfaInstructions}</p><Button className="mb-5 w-full" onClick={() => requestMfa.mutate()} disabled={requestMfa.isPending}>{requestMfa.isPending ? shell.access.sending : shell.access.sendCode}</Button><div className="space-y-2"><label htmlFor="admin-mfa-code" className="text-sm font-medium text-foreground">{shell.access.codeLabel}</label><Input id="admin-mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, ""))} placeholder="123456"/><Button className="mt-2 w-full" variant="outline" disabled={mfaCode.length !== 6 || verifyMfa.isPending} onClick={() => verifyMfa.mutate({ code: mfaCode })}>{verifyMfa.isPending ? shell.access.verifying : shell.access.verify}</Button></div><Button variant="ghost" className="mt-3 w-full" onClick={() => setLocation("/")}>{shell.access.backToSite}</Button></div></div>;
  }

  const tabs = [
    { id: "overview" as Tab, label: shell.tabs.overview, icon: DollarSign },
    { id: "appointments" as Tab, label: shell.tabs.appointments, icon: Calendar },
    { id: "contacts" as Tab, label: shell.tabs.contacts, icon: MessageSquare },
    { id: "gdpr" as Tab, label: shell.tabs.gdpr, icon: Shield },
    { id: "testimonials" as Tab, label: shell.tabs.testimonials, icon: Star },
    { id: "availability" as Tab, label: shell.tabs.availability, icon: CalendarDays },
    { id: "recruitment" as Tab, label: shell.tabs.recruitment, icon: UserRound },
    { id: "candidateDocuments" as Tab, label: shell.tabs.candidateDocuments, icon: Shield },
    { id: "security" as Tab, label: shell.tabs.security, icon: Shield },
    { id: "vivier" as Tab, label: shell.tabs.vivier, icon: UsersRound },
    { id: "mailing" as Tab, label: shell.tabs.mailing, icon: Send },
    { id: "employerBriefs" as Tab, label: shell.tabs.employerBriefs, icon: BriefcaseBusiness },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {shell.site}
            </Button>
            <h1 className="text-xl font-bold text-foreground">{shell.title}</h1>
          </div>
          <span className="max-w-full truncate text-sm text-muted-foreground">{user.name}</span>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-border bg-card/30">
        <div className="max-w-7xl mx-auto px-4">
          <label className="sr-only" htmlFor="admin-active-tab">{shell.section}</label>
          <div className="py-2 sm:hidden">
            <select
              id="admin-active-tab"
              value={activeTab}
              onChange={event => setActiveTab(event.target.value as Tab)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label={`${shell.section} : ${getActiveAdminTabLabel(tabs, activeTab)}`}
            >
              {tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
            </select>
          </div>
          <div className="hidden gap-1 overflow-x-auto sm:flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
      </main>
    </div>
  );
}

function OverviewTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { language } = useLanguage();
  const copy = adminOverviewCopy[language as keyof typeof adminOverviewCopy] ?? adminOverviewCopy.fr;
  const { data: stats, isLoading, error } = trpc.admin.stats.useQuery();

  if (error) {
    return <div className="text-center py-8 text-red-400">{copy.error} : {error.message}</div>;
  }

  if (isLoading) {
    return <PublicContentSkeleton cards={4} columns={4} label={copy.loading} />;
  }

  const cards = [
    { label: copy.bookings, value: stats?.appointments || 0, icon: Calendar, color: "text-cyan-400" },
    { label: copy.messages, value: stats?.contacts || 0, icon: MessageSquare, color: "text-green-400" },
    { label: copy.gdpr, value: stats?.gdpr || 0, icon: Shield, color: "text-yellow-400" },
    { label: copy.revenue, value: `${stats?.revenue || 0}€`, icon: DollarSign, color: "text-emerald-400" },
  ];

  return (
    <div className="space-y-8">
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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{copy.eyebrow}</p>
          <h2 id="recruitment-shortcuts-title" className="mt-1 text-xl font-semibold text-foreground">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.intro}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onNavigate("recruitment")}
            className="group flex items-center justify-between rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>
              <span className="flex items-center gap-2 font-semibold text-foreground"><UserRound className="h-5 w-5 text-primary" /> {copy.applications}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{copy.applicationsDescription}</span>
            </span>
            <span aria-hidden="true" className="text-lg text-primary transition-transform group-hover:translate-x-0.5">→</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("employerBriefs")}
            className="group flex items-center justify-between rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>
              <span className="flex items-center gap-2 font-semibold text-foreground"><BriefcaseBusiness className="h-5 w-5 text-primary" /> {copy.missions}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{copy.missionsDescription}</span>
            </span>
            <span aria-hidden="true" className="text-lg text-primary transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function AppointmentsTab() {
  const { language } = useLanguage();
  const copy = adminAppointmentsCopy[language as keyof typeof adminAppointmentsCopy] ?? adminAppointmentsCopy.fr;
  const locale = language === "zh" ? "zh-CN" : language === "de" ? "de-DE" : language === "en" ? "en-GB" : "fr-FR";
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.admin.appointments.list.useQuery({
    status: statusFilter as any,
  });
  const updateStatus = trpc.admin.appointments.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(copy.statusUpdated);
      utils.admin.appointments.list.invalidate();
      utils.admin.stats.invalidate();
    },
  });
  const refundAppointment = trpc.admin.appointments.refund.useMutation({
    onSuccess: ({ refundAmount }) => {
      toast.success(copy.refundConfirmed(refundAmount));
      utils.admin.appointments.list.invalidate();
      utils.admin.stats.invalidate();
    },
    onError: (mutationError) => {
      toast.error(mutationError.message);
    },
  });

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
  const agenda = buildAppointmentsAgenda(data?.items ?? []);

  if (isLoading) {
    return <PublicContentSkeleton label={copy.loading} />;
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[undefined, "pending", "completed", "failed", "refunded"].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === undefined ? copy.all : copy.paymentStatus[s as keyof typeof copy.paymentStatus]}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground mb-4">{copy.total(data?.total || 0)}</p>

      <section aria-labelledby="appointments-agenda-title" className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="appointments-agenda-title" className="font-semibold text-foreground">{copy.agenda}</h2>
          </div>
          <span className="text-xs text-muted-foreground">{copy.timezone}</span>
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
                      <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${appointmentStatusColors[apt.appointmentStatus] || "bg-muted text-muted-foreground"}`}>{copy.appointmentStatus[apt.appointmentStatus as keyof typeof copy.appointmentStatus] ?? apt.appointmentStatus}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.noUpcoming}</p>
        )}
      </section>

      {/* Table */}
      <div className="space-y-3">
        {data?.items.map((apt) => (
          <div key={apt.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-foreground">{apt.customerName}</span>
                  <span className="text-xs text-muted-foreground font-mono">{apt.trackingId}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span>{apt.customerEmail}</span>
                  <span>{apt.customerPhone}</span>
                  <span>{new Date(apt.appointmentDate).toLocaleString(locale, { timeZone: "Europe/Paris" })}</span>
                  <span className="font-semibold text-foreground">{apt.finalPrice}€</span>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[apt.paymentStatus] || ""}`}>
                  {copy.paymentStatus[apt.paymentStatus as keyof typeof copy.paymentStatus] ?? apt.paymentStatus}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${appointmentStatusColors[apt.appointmentStatus] || ""}`}>
                  {copy.appointmentStatus[apt.appointmentStatus as keyof typeof copy.appointmentStatus] ?? apt.appointmentStatus}
                </span>
                {apt.appointmentStatus === "confirmed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-10 flex-1 sm:min-h-0 sm:flex-none"
                    onClick={() => updateStatus.mutate({ trackingId: apt.trackingId, appointmentStatus: "completed" })}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {copy.complete}
                  </Button>
                )}
                {apt.paymentStatus === "completed" && apt.appointmentStatus === "confirmed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-10 flex-1 sm:min-h-0 sm:flex-none"
                    disabled={refundAppointment.isPending}
                    onClick={() => {
                      if (!window.confirm(copy.confirmRefund(apt.finalPrice, apt.trackingId))) return;
                      refundAppointment.mutate({
                        trackingId: apt.trackingId,
                        reason: copy.refundReason,
                      });
                    }}
                  >
                    <DollarSign className="w-3 h-3 mr-1" />
                    {copy.refund}
                  </Button>
                )}
              </div>
            </div>
            {apt.requestDetails && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{apt.requestDetails}</p>
            )}
          </div>
        ))}
        {(!data?.items || data.items.length === 0) && (
          <AdminEmptyState icon={CalendarDays} title={copy.emptyTitle} description={copy.emptyDescription} />
        )}
      </div>
    </div>
  );
}

function ContactsTab() {
  const { language } = useLanguage();
  const copy = adminContactsCopy[language as keyof typeof adminContactsCopy] ?? adminContactsCopy.fr;
  const locale = language === "zh" ? "zh-CN" : language === "de" ? "de-DE" : language === "en" ? "en-GB" : "fr-FR";
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.admin.contacts.list.useQuery({});
  const markRead = trpc.admin.contacts.markRead.useMutation({
    onSuccess: () => {
      toast.success(copy.markedRead);
      utils.admin.contacts.list.invalidate();
    },
  });

  if (error) {
    return <AdminErrorState description={error.message} />;
  }

  if (isLoading) {
    return <PublicContentSkeleton label={copy.loading} />;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{copy.total(data?.total || 0)}</p>
      <div className="space-y-3">
        {data?.items.map((msg) => (
          <div key={msg.id} className={`bg-card border rounded-lg p-4 ${msg.read === 0 ? "border-primary/50" : "border-border"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-foreground">{msg.name}</span>
                  {msg.read === 0 && <span className="w-2 h-2 rounded-full bg-primary" />}
                  <span className="text-xs text-muted-foreground font-mono">{msg.trackingId}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground mb-2">
                  <span>{msg.email}</span>
                  {msg.phone && <span>{msg.phone}</span>}
                  <span>{new Date(msg.createdAt).toLocaleString(locale)}</span>
                </div>
                <p className="text-sm text-foreground">{msg.message}</p>
              </div>
              {msg.read === 0 && (
                <Button size="sm" variant="outline" className="min-h-10 self-start sm:min-h-0" onClick={() => markRead.mutate({ id: msg.id })}>
                  <Eye className="w-3 h-3 mr-1" />
                  {copy.read}
                </Button>
              )}
            </div>
          </div>
        ))}
        {(!data?.items || data.items.length === 0) && (
          <AdminEmptyState icon={MessageSquare} title={copy.emptyTitle} description={copy.emptyDescription} />
        )}
      </div>
    </div>
  );
}

function GdprTab() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.admin.gdprRequests.list.useQuery({});
  const updateStatus = trpc.admin.gdprRequests.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Statut mis à jour");
      utils.admin.gdprRequests.list.invalidate();
    },
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

  const typeLabels: Record<string, string> = {
    access: "Accès",
    rectification: "Rectification",
    deletion: "Suppression",
    portability: "Portabilité",
    objection: "Opposition",
  };

  if (isLoading) {
    return <PublicContentSkeleton label="Chargement des demandes RGPD" />;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{data?.total || 0} demande(s) RGPD</p>
      <div className="space-y-3">
        {data?.items.map((req) => (
          <div key={req.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-foreground">{req.name}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-200">
                    {typeLabels[req.requestType] || req.requestType}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[req.status] || ""}`}>
                    {req.status}
                  </span>
                </div>
                <div className="flex gap-3 text-sm text-muted-foreground">
                  <span>{req.email}</span>
                  <span>{new Date(req.createdAt).toLocaleString("fr-FR")}</span>
                </div>
                {req.description && (
                  <p className="text-sm text-foreground mt-2">{req.description}</p>
                )}
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
                {req.status === "pending" && (
                  <Button size="sm" variant="outline" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => updateStatus.mutate({ id: req.id, status: "in_progress" })}>
                    <Clock className="w-3 h-3 mr-1" />
                    En cours
                  </Button>
                )}
                {(req.status === "pending" || req.status === "in_progress") && (
                  <Button size="sm" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => updateStatus.mutate({ id: req.id, status: "completed" })}>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Traité
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
        {(!data?.items || data.items.length === 0) && (
          <AdminEmptyState icon={Shield} title="Aucune demande RGPD" description="Les demandes d’accès, rectification ou suppression apparaîtront ici." />
        )}
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
                <div className="flex items-center gap-3 mb-1">
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
                <p className="text-sm font-medium text-foreground">{t.title}</p>
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
                  className="min-h-10 sm:min-h-0 sm:flex-none"
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
          <AdminEmptyState icon={Star} title="Aucun témoignage" description="Les témoignages partenaires soumis ou importés apparaîtront ici pour validation." />
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
    onSuccess: () => {
      toast.success("Date bloquée");
      utils.admin.availability.listBlockedDates.invalidate();
      setShowBlockForm(false);
      setBlockForm({ date: "", reason: "" });
    },
    onError: (e: any) => toast.error(e.message),
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
                onClick={() => deleteSlot.mutate({ id: slot.id })}
              >
                <Trash className="w-3 h-3 text-red-400" />
              </Button>
            </div>
          ))}
          {(!slots || slots.length === 0) && (
            <div className="col-span-full"><AdminEmptyState icon={CalendarDays} title="Aucun créneau configuré" description="Ajoutez un créneau hebdomadaire pour le rendre disponible à la réservation." /></div>
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
                <label className="text-sm text-muted-foreground block mb-1">Raison (optionnel)</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  placeholder="Congés, formation..."
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
            <AdminEmptyState icon={CalendarDays} title="Aucune date bloquée" description="Les jours bloqués pour congés, formation ou indisponibilité apparaîtront ici." />
          )}
        </div>
      </section>
    </div>
  );
}
