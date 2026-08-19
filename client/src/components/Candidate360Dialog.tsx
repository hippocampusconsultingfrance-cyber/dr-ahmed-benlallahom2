import { CalendarClock, ClipboardList, FileText, Mail, MessageSquare, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { buildCandidateTimeline, type CandidateTimelineEvent } from "./candidate360Timeline";
import PublicContentSkeleton from "./PublicContentSkeleton";

type Candidate360DialogProps = {
  applicationId: number | null;
  onOpenChange: (open: boolean) => void;
};

function formatDate(value: Date | null | undefined) {
  return value ? new Date(value).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "—";
}

function eventIcon(kind: CandidateTimelineEvent["kind"]) {
  if (kind === "email" || kind === "campaign") return <Mail className="h-4 w-4" />;
  if (kind === "follow_up") return <CalendarClock className="h-4 w-4" />;
  if (kind === "application") return <UserRound className="h-4 w-4" />;
  return <ClipboardList className="h-4 w-4" />;
}

export default function Candidate360Dialog({ applicationId, onOpenChange }: Candidate360DialogProps) {
  const detailQuery = trpc.admin.recruitment.candidate.detail.useQuery(
    { id: applicationId || 1 },
    { enabled: applicationId !== null },
  );
  const detail = detailQuery.data;
  const timeline = detail ? buildCandidateTimeline({ createdAt: detail.candidate.createdAt, audits: detail.audits, campaignRecipients: detail.campaignRecipients, followUps: detail.followUps }) : [];
  const upcomingFollowUp = detail?.followUps.find(task => task.status === "suggested");
  const requestedDocuments = timeline.filter(event => event.detail?.startsWith("Pièces ou informations demandées :"));

  return (
    <Dialog open={applicationId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Fiche candidat 360°</DialogTitle>
          <DialogDescription>Vue administrative sécurisée : historique, emails, notes et actions de suivi. L’analyse IA reste une aide à la revue humaine.</DialogDescription>
        </DialogHeader>
        {detailQuery.isLoading ? <PublicContentSkeleton cards={2} columns={2} label="Chargement de la fiche candidat" /> : detail ? (
          <div className="space-y-6 py-2">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-lg font-semibold text-foreground">{detail.candidate.firstName} {detail.candidate.lastName}</h3><p className="text-sm text-muted-foreground">{detail.candidate.specialty} · {detail.candidate.trackingId}</p></div><span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">Statut : {detail.candidate.status}</span></div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Candidature reçue</p><p className="mt-1 text-foreground">{formatDate(detail.candidate.createdAt)}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dernière réponse candidat</p><p className="mt-1 text-foreground">{formatDate(detail.candidate.lastCandidateResponseAt)}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prochain suivi</p><p className="mt-1 text-foreground">{upcomingFollowUp ? formatDate(upcomingFollowUp.dueAt) : "Aucun suivi programmé"}</p></div></div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-border p-4"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /><h3 className="font-semibold text-foreground">Note interne</h3></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detail.candidate.adminNotes || "Aucune note interne pour ce dossier."}</p></section>
              <section className="rounded-xl border border-border p-4"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h3 className="font-semibold text-foreground">Pièces demandées</h3></div>{requestedDocuments.length ? <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{requestedDocuments.map(event => <li key={event.id} className="rounded-lg bg-muted/40 p-2">{event.detail?.replace("Pièces ou informations demandées : ", "")}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Aucune demande libre de complément archivée pour ce dossier.</p>}</section>
            </div>

            <section className="rounded-xl border border-border p-4"><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /><h3 className="font-semibold text-foreground">Chronologie des actions</h3></div>{timeline.length ? <ol className="mt-4 space-y-3 border-l border-border pl-4">{timeline.map(event => <li key={event.id} className="relative"><span className="absolute -left-[1.6rem] top-0.5 rounded-full border border-primary/20 bg-primary/10 p-1 text-primary">{eventIcon(event.kind)}</span><p className="font-medium text-foreground">{event.title}</p>{event.detail && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{event.detail}</p>}<p className="mt-1 text-xs text-muted-foreground">{formatDate(event.date)}</p></li>)}</ol> : <p className="mt-4 text-sm text-muted-foreground">Aucune action archivée.</p>}</section>
          </div>
        ) : <p className="py-12 text-center text-sm text-muted-foreground">La fiche candidat n’est pas disponible.</p>}
      </DialogContent>
    </Dialog>
  );
}
