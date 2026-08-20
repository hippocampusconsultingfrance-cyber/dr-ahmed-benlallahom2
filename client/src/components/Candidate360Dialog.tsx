import { CalendarClock, ClipboardList, FileText, Mail, MessageSquare, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { buildCandidateTimeline, type CandidateTimelineEvent } from "./candidate360Timeline";
import PublicContentSkeleton from "./PublicContentSkeleton";
import { getLocalizedCopy } from "@/lib/getLocalizedCopy";

type Candidate360DialogProps = {
  applicationId: number | null;
  onOpenChange: (open: boolean) => void;
};

function formatDate(value: Date | null | undefined, locale: string) {
  return value ? new Date(value).toLocaleString(locale, { timeZone: "Europe/Paris" }) : "—";
}

export const candidate360Copy = {
  fr: { followUpUpdated: "Relance mise à jour. Aucun email n’a été envoyé automatiquement.", title: "Fiche candidat 360°", description: "Vue administrative sécurisée : historique, emails, notes et actions de suivi. L’analyse IA reste une aide à la revue humaine.", loading: "Chargement de la fiche candidat", status: "Statut", statuses: { new: "Nouvelle", reviewing: "En revue", shortlisted: "Présélectionnée", placed: "Positionnée", rejected: "Refusée", archived: "Archivée" }, applicationReceived: "Candidature reçue", lastResponse: "Dernière réponse candidat", nextFollowUp: "Prochain suivi", noFollowUp: "Aucun suivi programmé", internalNote: "Note interne", noInternalNote: "Aucune note interne pour ce dossier.", requestedDocuments: "Pièces demandées", noRequestedDocuments: "Aucune demande libre de complément archivée pour ce dossier.", suggestedFollowUps: "Relances manuelles suggérées", followUpDescription: "Ces échéances n’envoient aucun email. Utilisez ensuite l’espace Mailing ou la fiche candidat pour choisir une prise de contact.", followUp7: "Relance J+7", followUp14: "Relance J+14", noNote: "Aucune note", followUpStatuses: { suggested: "à examiner", completed: "traitée", dismissed: "ignorée" }, markCompleted: "Marquer traitée", dismiss: "Ignorer", noSuggestedFollowUp: "Aucune relance n’est actuellement suggérée.", timeline: "Chronologie des actions", noTimeline: "Aucune action archivée.", unavailable: "La fiche candidat n’est pas disponible." },
  en: { followUpUpdated: "Follow-up updated. No email was sent automatically.", title: "Candidate 360° profile", description: "Secure administrative view: history, emails, notes and follow-up actions. AI analysis remains support for human review.", loading: "Loading candidate profile", status: "Status", statuses: { new: "New", reviewing: "Under review", shortlisted: "Shortlisted", placed: "Placed", rejected: "Rejected", archived: "Archived" }, applicationReceived: "Application received", lastResponse: "Last candidate response", nextFollowUp: "Next follow-up", noFollowUp: "No follow-up scheduled", internalNote: "Internal note", noInternalNote: "No internal note for this file.", requestedDocuments: "Requested documents", noRequestedDocuments: "No free-form request for additional information is archived for this file.", suggestedFollowUps: "Suggested manual follow-ups", followUpDescription: "These deadlines send no email. Then use Mailing or the candidate profile to choose contact.", followUp7: "Follow-up D+7", followUp14: "Follow-up D+14", noNote: "No note", followUpStatuses: { suggested: "to review", completed: "completed", dismissed: "dismissed" }, markCompleted: "Mark completed", dismiss: "Dismiss", noSuggestedFollowUp: "No follow-up is currently suggested.", timeline: "Action timeline", noTimeline: "No action archived.", unavailable: "The candidate profile is unavailable." },
  de: { followUpUpdated: "Nachverfolgung aktualisiert. Es wurde keine E-Mail automatisch gesendet.", title: "Kandidatenprofil 360°", description: "Geschützte Verwaltungsansicht: Historie, E-Mails, Notizen und Nachverfolgungsaktionen. KI-Analyse bleibt Unterstützung für die menschliche Prüfung.", loading: "Kandidatenprofil wird geladen", status: "Status", statuses: { new: "Neu", reviewing: "In Prüfung", shortlisted: "Vorausgewählt", placed: "Vermittelt", rejected: "Abgelehnt", archived: "Archiviert" }, applicationReceived: "Bewerbung eingegangen", lastResponse: "Letzte Kandidatenantwort", nextFollowUp: "Nächste Nachverfolgung", noFollowUp: "Keine Nachverfolgung geplant", internalNote: "Interne Notiz", noInternalNote: "Keine interne Notiz für diese Akte.", requestedDocuments: "Angeforderte Unterlagen", noRequestedDocuments: "Für diese Akte ist keine freie Ergänzungsanfrage archiviert.", suggestedFollowUps: "Vorgeschlagene manuelle Nachverfolgungen", followUpDescription: "Diese Fristen versenden keine E-Mail. Nutzen Sie danach Mailing oder das Kandidatenprofil, um einen Kontakt zu wählen.", followUp7: "Nachverfolgung T+7", followUp14: "Nachverfolgung T+14", noNote: "Keine Notiz", followUpStatuses: { suggested: "zu prüfen", completed: "erledigt", dismissed: "ignoriert" }, markCompleted: "Als erledigt markieren", dismiss: "Ignorieren", noSuggestedFollowUp: "Derzeit ist keine Nachverfolgung vorgeschlagen.", timeline: "Aktionschronologie", noTimeline: "Keine Aktion archiviert.", unavailable: "Das Kandidatenprofil ist nicht verfügbar." },
  zh: { followUpUpdated: "跟进已更新。未自动发送电子邮件。", title: "候选人 360° 档案", description: "安全的管理视图：历史、邮件、备注和跟进操作。AI 分析仍仅辅助人工审核。", loading: "正在加载候选人档案", status: "状态", statuses: { new: "新申请", reviewing: "审核中", shortlisted: "已入围", placed: "已推荐", rejected: "已拒绝", archived: "已归档" }, applicationReceived: "收到申请", lastResponse: "候选人最近回复", nextFollowUp: "下一次跟进", noFollowUp: "未安排跟进", internalNote: "内部备注", noInternalNote: "该档案没有内部备注。", requestedDocuments: "请求的文件", noRequestedDocuments: "该档案没有已存档的自由补充信息请求。", suggestedFollowUps: "建议的人工跟进", followUpDescription: "这些截止日期不会发送电子邮件。请随后使用邮件活动或候选人档案选择联系方式。", followUp7: "第 7 天跟进", followUp14: "第 14 天跟进", noNote: "无备注", followUpStatuses: { suggested: "待审核", completed: "已处理", dismissed: "已忽略" }, markCompleted: "标记为已处理", dismiss: "忽略", noSuggestedFollowUp: "目前没有建议的跟进。", timeline: "操作时间线", noTimeline: "没有已存档的操作。", unavailable: "候选人档案不可用。" },
} as const;

function eventIcon(kind: CandidateTimelineEvent["kind"]) {
  if (kind === "email" || kind === "campaign") return <Mail className="h-4 w-4" />;
  if (kind === "follow_up") return <CalendarClock className="h-4 w-4" />;
  if (kind === "application") return <UserRound className="h-4 w-4" />;
  return <ClipboardList className="h-4 w-4" />;
}

export default function Candidate360Dialog({ applicationId, onOpenChange }: Candidate360DialogProps) {
  const { language } = useLanguage();
  const copy = getLocalizedCopy(candidate360Copy, language, "fr");
  const locale = language === "zh" ? "zh-CN" : language === "de" ? "de-DE" : language === "en" ? "en-GB" : "fr-FR";
  const utils = trpc.useUtils();
  const detailQuery = trpc.admin.recruitment.candidate.detail.useQuery(
    { id: applicationId || 1 },
    { enabled: applicationId !== null },
  );
  const detail = detailQuery.data;
  const timeline = detail ? buildCandidateTimeline({ createdAt: detail.candidate.createdAt, audits: detail.audits, campaignRecipients: detail.campaignRecipients, followUps: detail.followUps }) : [];
  const upcomingFollowUp = detail?.followUps.find(task => task.status === "suggested");
  const followUpUpdate = trpc.admin.recruitment.followUps.update.useMutation({
    onSuccess: () => {
      toast.success(copy.followUpUpdated);
      if (applicationId) utils.admin.recruitment.candidate.detail.invalidate({ id: applicationId });
    },
    onError: updateError => toast.error(updateError.message),
  });
  const requestedDocuments = timeline.filter(event => event.detail?.startsWith("Pièces ou informations demandées :"));

  return (
    <Dialog open={applicationId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {detailQuery.isLoading ? <PublicContentSkeleton cards={2} columns={2} label={copy.loading} /> : detail ? (
          <div className="space-y-6 py-2">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h3 className="break-words text-lg font-semibold text-foreground">{detail.candidate.firstName} {detail.candidate.lastName}</h3><p className="break-words text-sm text-muted-foreground">{detail.candidate.specialty} · <span className="break-all">{detail.candidate.trackingId}</span></p></div><span className="max-w-full break-words rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">{copy.status} : {copy.statuses[detail.candidate.status as keyof typeof copy.statuses] ?? detail.candidate.status}</span></div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div className="min-w-0"><p className="break-words text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.applicationReceived}</p><p className="mt-1 break-words text-foreground">{formatDate(detail.candidate.createdAt, locale)}</p></div><div className="min-w-0"><p className="break-words text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.lastResponse}</p><p className="mt-1 break-words text-foreground">{formatDate(detail.candidate.lastCandidateResponseAt, locale)}</p></div><div className="min-w-0"><p className="break-words text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.nextFollowUp}</p><p className="mt-1 break-words text-foreground">{upcomingFollowUp ? formatDate(upcomingFollowUp.dueAt, locale) : copy.noFollowUp}</p></div></div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-border p-4"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 shrink-0 text-primary" /><h3 className="break-words font-semibold text-foreground">{copy.internalNote}</h3></div><p className="mt-3 break-words whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detail.candidate.adminNotes || copy.noInternalNote}</p></section>
              <section className="rounded-xl border border-border p-4"><div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-primary" /><h3 className="break-words font-semibold text-foreground">{copy.requestedDocuments}</h3></div>{requestedDocuments.length ? <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{requestedDocuments.map(event => <li key={event.id} className="break-words rounded-lg bg-muted/40 p-2">{event.detail?.replace("Pièces ou informations demandées : ", "")}</li>)}</ul> : <p className="mt-3 break-words text-sm text-muted-foreground">{copy.noRequestedDocuments}</p>}</section>
            </div>

            <section className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /><h3 className="font-semibold text-foreground">{copy.suggestedFollowUps}</h3></div>
              <p className="mt-2 break-words text-sm text-muted-foreground">{copy.followUpDescription}</p>
              {detail.followUps.length ? <ul className="mt-4 space-y-3">{detail.followUps.map(task => <li key={task.id} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words font-medium text-foreground">{task.kind === "follow_up_7" ? copy.followUp7 : copy.followUp14} <span className="font-normal text-muted-foreground">· {formatDate(task.dueAt, locale)}</span></p><p className="mt-1 break-words text-xs text-muted-foreground">{task.notes || copy.noNote}</p><p className="mt-1 break-words text-xs text-muted-foreground">{copy.status} : {copy.followUpStatuses[task.status as keyof typeof copy.followUpStatuses] ?? task.status}</p></div>{task.status === "suggested" && <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"><Button className="min-h-10 w-full sm:w-auto sm:min-h-0" size="sm" disabled={followUpUpdate.isPending} onClick={() => followUpUpdate.mutate({ id: task.id, status: "completed" })}>{copy.markCompleted}</Button><Button className="min-h-10 w-full sm:w-auto sm:min-h-0" size="sm" variant="outline" disabled={followUpUpdate.isPending} onClick={() => followUpUpdate.mutate({ id: task.id, status: "dismissed" })}>{copy.dismiss}</Button></div>}</li>)}</ul> : <p className="mt-4 break-words text-sm text-muted-foreground">{copy.noSuggestedFollowUp}</p>}
            </section>

            <section className="rounded-xl border border-border p-4"><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 shrink-0 text-primary" /><h3 className="break-words font-semibold text-foreground">{copy.timeline}</h3></div>{timeline.length ? <ol className="mt-4 space-y-3 border-l border-border pl-4">{timeline.map(event => <li key={event.id} className="relative min-w-0"><span className="absolute -left-[1.6rem] top-0.5 rounded-full border border-primary/20 bg-primary/10 p-1 text-primary">{eventIcon(event.kind)}</span><p className="break-words font-medium text-foreground">{event.title}</p>{event.detail && <p className="mt-0.5 break-words whitespace-pre-wrap text-sm text-muted-foreground">{event.detail}</p>}<p className="mt-1 break-words text-xs text-muted-foreground">{formatDate(event.date, locale)}</p></li>)}</ol> : <p className="mt-4 break-words text-sm text-muted-foreground">{copy.noTimeline}</p>}</section>
          </div>
        ) : <p className="py-12 text-center text-sm text-muted-foreground">{copy.unavailable}</p>}
      </DialogContent>
    </Dialog>
  );
}
