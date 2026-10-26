import { AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { DELIVERY_JOB_LABELS, type AppointmentDeliveryJob } from "./AppointmentDeliveries";

const parisTime = (date: string | Date) => new Date(date).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
const jobLabels = (jobTypes: string[]) => jobTypes.map(jobType => DELIVERY_JOB_LABELS[jobType as AppointmentDeliveryJob] ?? jobType).join(", ");

/** « Facture · nouvel essai automatique au plus tôt le … », or interrupted, waiting for the next scheduled run. */
export function retryingDetail(item: { jobTypes: string[]; nextAttemptAt: string | Date | null }): string {
  return `${jobLabels(item.jobTypes)} · ${item.nextAttemptAt ? `nouvel essai automatique au plus tôt le ${parisTime(item.nextAttemptAt)}` : "envoi interrompu, nouvel essai à la prochaine exécution planifiée"}`;
}

/** « Confirmation, Facture · en attente depuis le …, essai à la prochaine exécution planifiée ». */
export function waitingDetail(item: { jobTypes: string[]; dueSince: string | Date }): string {
  return `${jobLabels(item.jobTypes)} · en attente depuis le ${parisTime(item.dueSince)}, essai à la prochaine exécution planifiée`;
}

type AttentionItem = { trackingId: string; customerName: string; appointmentDate: string | Date; detail?: string };

function AttentionList({ id, title, description, items, total }: { id: string; title: string; description: string; items: AttentionItem[]; total: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 id={id} className="font-semibold text-foreground">{title} ({total})</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <ul aria-labelledby={id} className="mt-3 space-y-2">
        {items.map(item => (
          <li key={item.trackingId} className="text-sm">
            <span className="font-mono text-primary">{item.trackingId}</span> · <span className="text-foreground">{item.customerName}</span> · <span className="text-muted-foreground">{parisTime(item.appointmentDate)}</span>
            {item.detail && <span className="block text-xs text-red-400">{item.detail}</span>}
          </li>
        ))}
      </ul>
      {total > items.length && <p className="mt-2 text-xs text-muted-foreground">et {total - items.length} autre(s)</p>}
    </div>
  );
}

/**
 * « À traiter » at the top of the dashboard (EXPL-02), read from the database:
 * post-payment emails whose attempts ran out, that the email service refused
 * (no new automatic attempt), or that failed and wait for their next
 * automatic attempt (possibly the next day), those still not sent a few
 * minutes after the payment (ABUS-03), and payments received
 * without a confirmed appointment. It no longer depends on an alert email,
 * sent through the very channel that may have failed.
 */
export default function AdminAttentionPanel({ onOpenAppointments }: { onOpenAppointments: () => void }) {
  const { data, isLoading, error } = trpc.admin.attention.useQuery();

  if (isLoading) return <PublicContentSkeleton cards={1} label="Chargement des points à traiter" />;
  if (error) {
    return (
      <section aria-labelledby="admin-attention-title" className="rounded-2xl border border-red-500/40 bg-red-500/5 p-5">
        <h2 id="admin-attention-title" className="text-xl font-semibold text-foreground">À traiter</h2>
        <p className="mt-1 text-sm text-red-400">Les points à traiter n’ont pas pu être chargés : {error.message}</p>
      </section>
    );
  }

  const failed = data?.failedDeliveries ?? { total: 0, items: [] };
  const refused = data?.refusedDeliveries ?? { total: 0, items: [] };
  const retrying = data?.retryingDeliveries ?? { total: 0, items: [] };
  const waiting = data?.waitingDeliveries ?? { total: 0, items: [] };
  const unconfirmed = data?.unconfirmedPayments ?? { total: 0, items: [] };
  if (failed.total === 0 && refused.total === 0 && retrying.total === 0 && waiting.total === 0 && unconfirmed.total === 0) {
    return (
      <section aria-labelledby="admin-attention-title" className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
        <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-400" aria-hidden="true" />
        <div>
          <h2 id="admin-attention-title" className="font-semibold text-foreground">À traiter</h2>
          <p className="text-sm text-muted-foreground">Rien à traiter : aucun envoi après paiement en échec ou en attente, aucun paiement à régulariser.</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="admin-attention-title" className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="admin-attention-title" className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden="true" />
          À traiter
        </h2>
        <Button variant="outline" className="min-h-11 w-full md:w-auto md:min-h-0" onClick={onOpenAppointments}>Ouvrir les réservations</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {failed.total > 0 && (
          <AttentionList
            id="admin-attention-deliveries"
            title="Envois au patient ou au médecin en échec"
            description="Le patient n’a pas reçu sa confirmation, sa facture ou l’email de son remboursement, ou vous n’avez pas reçu la notification ou l’alerte de remboursement. Sur le rendez-vous : « Renvoyer », ou « Télécharger la facture » pour l’envoyer vous-même."
            total={failed.total}
            items={failed.items.map(item => ({ ...item, detail: jobLabels(item.jobTypes) }))}
          />
        )}
        {refused.total > 0 && (
          <AttentionList
            id="admin-attention-refused"
            title="Envois refusés par le service d’envoi"
            description="Le service d’envoi a refusé l’email (adresse email du patient refusée ou invalide, ou contenu de l’email refusé). Ce refus n’est pas passager : aucun nouvel essai automatique n’a lieu. Vérifiez l’adresse du patient et prévenez-le directement ; sur le rendez-vous, « Corriger l’email du patient », puis « Renvoyer » l’envoie à la nouvelle adresse."
            total={refused.total}
            items={refused.items.map(item => ({ ...item, detail: jobLabels(item.jobTypes) }))}
          />
        )}
        {retrying.total > 0 && (
          <AttentionList
            id="admin-attention-retrying"
            title="Envois en échec, nouvel essai prévu"
            description="Une tentative a échoué ou a été interrompue ; l’essai automatique suivant n’a lieu qu’à une exécution planifiée, parfois le lendemain. D’ici là, le patient n’a pas sa confirmation, sa facture ou l’email de son remboursement, ou vous n’avez pas la notification ou l’alerte : « Renvoyer » sur le rendez-vous relance l’envoi tout de suite."
            total={retrying.total}
            items={retrying.items.map(item => ({ ...item, detail: retryingDetail(item) }))}
          />
        )}
        {waiting.total > 0 && (
          <AttentionList
            id="admin-attention-waiting"
            title="Envois pas encore partis"
            description="Ces envois n’ont pas pu partir juste après le paiement (service d’envoi saturé ou indisponible à ce moment-là) ; aucune tentative n’a encore échoué, mais le prochain essai automatique n’a lieu qu’à une exécution planifiée, parfois le lendemain. « Renvoyer » sur le rendez-vous les envoie tout de suite."
            total={waiting.total}
            items={waiting.items.map(item => ({ ...item, detail: waitingDetail(item) }))}
          />
        )}
        {unconfirmed.total > 0 && (
          <AttentionList
            id="admin-attention-payments"
            title="Paiements à régulariser"
            description="Paiement reçu sans rendez-vous confirmé : contactez le patient, puis remboursez-le depuis l’onglet Réservations (« Rembourser ce paiement »), ou convenez avec lui d’un nouveau rendez-vous."
            total={unconfirmed.total}
            items={unconfirmed.items}
          />
        )}
      </div>
    </section>
  );
}
