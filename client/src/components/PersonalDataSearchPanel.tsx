import { useState, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminErrorState } from "@/components/AdminStatePanel";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { downloadJsonFile } from "./jsonFileDownload";
import { GDPR_REQUEST_STATUS_LABELS, GDPR_REQUEST_TYPE_LABELS } from "./gdprRequestAdmin";

export type PersonalData = inferRouterOutputs<AppRouter>["admin"]["personalData"]["find"];
type ErasureReport = inferRouterOutputs<AppRouter>["admin"]["personalData"]["erase"];

const MEDICAL_QUESTION_STATUS_LABELS: Record<string, string> = { submitted: "Nouvelle", drafting: "Brouillon", answered: "Répondue", published: "Publiée", rejected: "Classée sans suite" };
const APPOINTMENT_STATUS_LABELS: Record<string, string> = { held: "Créneau réservé", confirmed: "Confirmé", cancelled: "Annulé", completed: "Terminé", no_show: "Absent" };
const PAYMENT_STATUS_LABELS: Record<string, string> = { pending: "En attente", completed: "Payé", failed: "Échoué", refunded: "Remboursé" };

export const PERSONAL_DATA_ERASURE_CONFIRMATION = "Effacer les données de cette personne ? Seront supprimés : ses messages de contact et ses questions santé (avec leur journal). Ses rendez-vous passés, annulés ou abandonnés seront anonymisés (identité, email, téléphone et motif effacés ; date, montant, statut et facture conservés). Les rendez-vous à venir encore en cours (confirmés, en attente de paiement ou payés et à rembourser) et les demandes RGPD restent, ainsi que les dossiers de recrutement (à effacer séparément). Action irréversible.";

const candidateErasureConfirmation = (trackingId: string) => `Effacer définitivement le dossier candidat ${trackingId} ? Comme depuis l’onglet « Candidatures » : le CV et ses copies (stockage et Google Drive), les analyses IA, les relances et historiques d’emails, la présence dans les missions, ainsi que l’espace candidat lié, ses sessions et ses documents. Seule une preuve d’effacement anonymisée est conservée. Action irréversible.`;

const formatDate = (value: Date | string) => new Date(value).toLocaleDateString("fr-FR");
const excerpt = (text: string, length = 140) => (text.length > length ? `${text.slice(0, length)}…` : text);

export function describePersonalDataErasure(report: ErasureReport) {
  const parts = [
    `${report.contactMessagesDeleted} message(s) supprimé(s)`,
    `${report.medicalQuestionsDeleted} question(s) santé supprimée(s)`,
    `${report.appointmentsAnonymised} rendez-vous anonymisé(s), factures conservées`,
  ];
  if (report.upcomingAppointments.length) parts.push(`rendez-vous à venir encore en cours conservé(s) : ${report.upcomingAppointments.join(", ")} (annulez ou remboursez-les d’abord, ou attendez la fin d’un paiement en attente, puis relancez l’effacement)`);
  if (report.gdprRequestsKept) parts.push(`${report.gdprRequestsKept} demande(s) RGPD conservée(s) comme preuve du traitement`);
  if (report.recruitmentApplications.length) parts.push(`dossier(s) candidat à effacer séparément : ${report.recruitmentApplications.join(", ")}`);
  return parts.join(" · ");
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground">{title} ({count})</h4>
      {count > 0 ? <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">{children}</ul> : <p className="mt-1 text-sm text-muted-foreground">Aucun.</p>}
    </div>
  );
}

/** What the search found for one address, with the export and the erasure. */
export function PersonalDataResult({ data, onChanged }: { data: PersonalData; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const exportData = trpc.admin.personalData.export.useMutation({
    onSuccess: file => {
      downloadJsonFile(file);
      toast.success("Export JSON téléchargé : transmettez-le à la personne par un canal sûr.");
    },
    onError: error => toast.error(error.message),
  });
  const erase = trpc.admin.personalData.erase.useMutation({
    onSuccess: report => {
      toast.success("Données effacées ou anonymisées ; trace ajoutée au journal de sécurité.", { description: describePersonalDataErasure(report), duration: 15_000 });
      void utils.admin.contacts.list.invalidate();
      void utils.admin.appointments.list.invalidate();
      void utils.admin.stats.invalidate();
      void utils.medicalQuestions.admin.list.invalidate();
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  const eraseApplication = trpc.admin.recruitment.erase.useMutation({
    onSuccess: () => {
      toast.success("Dossier candidat effacé définitivement ; preuve RGPD anonymisée ajoutée au journal.");
      void utils.admin.recruitment.list.invalidate();
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  const total = data.contactMessages.length + data.medicalQuestions.length + data.gdprRequests.length + data.appointments.length;

  return (
    <div className="mt-5 space-y-5">
      <p className="text-sm text-muted-foreground">
        {total === 0 ? `Aucune donnée patient ou contact enregistrée pour ${data.email}.` : `${total} élément(s) enregistré(s) pour ${data.email}.`}
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <Group title="Messages de contact" count={data.contactMessages.length}>
          {data.contactMessages.map(message => <li key={message.id}><span className="font-mono text-xs">{message.trackingId}</span> · {formatDate(message.createdAt)} · {excerpt(message.message)}</li>)}
        </Group>
        <Group title="Questions santé" count={data.medicalQuestions.length}>
          {data.medicalQuestions.map(question => <li key={question.id}><span className="font-mono text-xs">{question.trackingId}</span> · {formatDate(question.createdAt)} · {MEDICAL_QUESTION_STATUS_LABELS[question.status] ?? question.status} · {excerpt(question.question)}</li>)}
        </Group>
        <Group title="Demandes RGPD" count={data.gdprRequests.length}>
          {data.gdprRequests.map(request => <li key={request.id}><span className="font-mono text-xs">{request.trackingId}</span> · {formatDate(request.createdAt)} · {GDPR_REQUEST_TYPE_LABELS[request.requestType] ?? request.requestType} · {GDPR_REQUEST_STATUS_LABELS[request.status] ?? request.status}</li>)}
        </Group>
        <Group title="Rendez-vous" count={data.appointments.length}>
          {data.appointments.map(booking => <li key={booking.id}><span className="font-mono text-xs">{booking.trackingId}</span> · {formatDate(booking.appointmentDate)} · {APPOINTMENT_STATUS_LABELS[booking.appointmentStatus] ?? booking.appointmentStatus} · {PAYMENT_STATUS_LABELS[booking.paymentStatus] ?? booking.paymentStatus} · {booking.finalPrice} €{booking.invoiceNumber ? ` · facture ${booking.invoiceNumber}` : ""}</li>)}
        </Group>
      </div>

      {(data.recruitment.applications.length > 0 || data.recruitment.candidateAccountWithoutApplication) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <h4 className="font-semibold text-foreground">Recrutement</h4>
          <p className="mt-1 text-muted-foreground">Les données de candidature (CV, analyses, espace candidat et documents) s’effacent avec l’effacement candidat existant, qui conserve une preuve anonymisée.</p>
          <ul className="mt-3 space-y-2">
            {data.recruitment.applications.map(application => (
              <li key={application.id} className="flex flex-wrap items-center gap-3">
                <span className="text-muted-foreground"><span className="font-mono text-xs text-foreground">{application.trackingId}</span> · déposée le {formatDate(application.createdAt)}</span>
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={eraseApplication.isPending} onClick={() => { if (window.confirm(candidateErasureConfirmation(application.trackingId))) eraseApplication.mutate({ id: application.id }); }}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Effacer le dossier candidat
                </Button>
              </li>
            ))}
          </ul>
          {data.recruitment.candidateAccountWithoutApplication && (
            <p className="mt-2 text-muted-foreground">Un espace candidat existe sans candidature : il est effacé automatiquement après 2 ans d’inactivité ; pour une demande d’effacement, suivez la procédure (docs/PROCEDURE_DEMANDES_RGPD.md).</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={exportData.isPending} onClick={() => exportData.mutate({ email: data.email })}>
          <Download className="mr-2 h-4 w-4" />
          {exportData.isPending ? "Export…" : "Exporter (JSON)"}
        </Button>
        <Button variant="outline" className="text-destructive hover:text-destructive" disabled={erase.isPending || total === 0} onClick={() => { if (window.confirm(PERSONAL_DATA_ERASURE_CONFIRMATION)) erase.mutate({ email: data.email }); }}>
          <Trash2 className="mr-2 h-4 w-4" />
          {erase.isPending ? "Effacement…" : "Effacer / anonymiser"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">L’export (droit d’accès, portabilité) et l’effacement sont tracés dans le journal de sécurité, sans donnée personnelle. Les factures PDF déjà émises restent dans le stockage (conservation comptable de 10 ans).</p>
    </div>
  );
}

/** Address asked from a GDPR request (« Ses données »); each request gets a new key, so the panel searches it again even after a manual search. */
export type PersonalDataSearchRequest = { email: string; nonce: number };

export const requestPersonalDataSearch = (current: PersonalDataSearchRequest, email: string): PersonalDataSearchRequest => ({ email, nonce: current.nonce + 1 });

export const personalDataSearchKey = (request: PersonalDataSearchRequest) => `${request.nonce}:${request.email}`;

/** « Rechercher une personne par email » (RGPD-12), at the top of the GDPR tab. */
export default function PersonalDataSearchPanel({ requestedEmail = "" }: { requestedEmail?: string }) {
  const [email, setEmail] = useState(requestedEmail);
  const [searchedEmail, setSearchedEmail] = useState(requestedEmail);
  const found = trpc.admin.personalData.find.useQuery({ email: searchedEmail }, { enabled: searchedEmail.length > 0 });

  return (
    <section id="personal-data-search" aria-labelledby="personal-data-search-title" className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6">
      <h3 id="personal-data-search-title" className="text-lg font-semibold text-foreground">Rechercher une personne par email</h3>
      <p className="mt-1 text-sm text-muted-foreground">Messages, questions santé, demandes RGPD et rendez-vous enregistrés sous cette adresse, quelle que soit la casse, ainsi que ses dossiers de recrutement.</p>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={event => {
          event.preventDefault();
          setSearchedEmail(email.trim());
        }}
      >
        <label htmlFor="personal-data-email" className="sr-only">Adresse email de la personne</label>
        <Input id="personal-data-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="prenom.nom@exemple.fr" className="sm:max-w-sm" />
        <Button type="submit" disabled={!email.trim()}>
          <Search className="mr-2 h-4 w-4" />
          Rechercher
        </Button>
      </form>
      {found.error ? <div className="mt-4"><AdminErrorState description={found.error.message} /></div>
        : found.isLoading ? <div className="mt-4"><PublicContentSkeleton cards={1} label="Recherche des données de la personne" /></div>
        : found.data ? <PersonalDataResult data={found.data} onChanged={() => void found.refetch()} />
        : null}
    </section>
  );
}
