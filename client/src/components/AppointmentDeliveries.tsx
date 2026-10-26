import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { downloadInvoicePdf } from "./invoicePdfDownload";

export type AppointmentDeliveryJob = "confirmation" | "invoice" | "owner";
export type AppointmentDeliveryState = "sent" | "failed" | "retrying" | "pending" | "sending" | "interrupted" | "not_sent";
export type AppointmentDeliveryView = { jobType: AppointmentDeliveryJob; state: AppointmentDeliveryState; attempts: number; maxAttempts: number };

/** In the order the practitioner reads them (EXPL-02). */
const DELIVERY_ORDER: AppointmentDeliveryJob[] = ["confirmation", "invoice", "owner"];

export const DELIVERY_JOB_LABELS: Record<AppointmentDeliveryJob, string> = {
  confirmation: "Confirmation",
  invoice: "Facture",
  owner: "Notification médecin",
};

const DELIVERY_STATE_LABELS: Record<AppointmentDeliveryState, string> = {
  sent: "envoyée",
  failed: "en échec",
  retrying: "en échec, nouvel essai prévu",
  pending: "en attente",
  sending: "en cours d’envoi",
  interrupted: "envoi interrompu",
  not_sent: "non envoyée",
};

const DELIVERY_STATE_TONES: Record<AppointmentDeliveryState, string> = {
  sent: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
  retrying: "bg-amber-500/20 text-amber-400",
  pending: "bg-slate-500/20 text-slate-300",
  sending: "bg-blue-500/20 text-blue-400",
  interrupted: "bg-amber-500/20 text-amber-400",
  not_sent: "bg-muted text-muted-foreground",
};

/** « Facture : en échec (6/6) », « Confirmation : envoyée »… */
export function deliveryLabel(delivery: AppointmentDeliveryView): string {
  const attempts = delivery.state === "failed" || delivery.state === "retrying" ? ` (${delivery.attempts}/${delivery.maxAttempts})` : "";
  return `${DELIVERY_JOB_LABELS[delivery.jobType]} : ${DELIVERY_STATE_LABELS[delivery.state]}${attempts}`;
}

/**
 * « Renvoyer » has something to send now: a job of a paid appointment failed,
 * was interrupted, or still waits for an attempt (not one being sent). The
 * server refuses it once the appointment is no longer paid (refunded…).
 */
export function canRetryDeliveries(deliveries: AppointmentDeliveryView[], paid: boolean): boolean {
  return paid && deliveries.some(delivery => ["failed", "retrying", "pending", "interrupted"].includes(delivery.state));
}

/**
 * Post-payment emails of an appointment (EXPL-02): confirmation, invoice and
 * practitioner notification, sent, failed or pending; « Renvoyer » sends the
 * ones that did not go out right away, « Télécharger la facture » regenerates
 * the invoice already issued, identical to the one emailed.
 */
export default function AppointmentDeliveries({ trackingId, paid, deliveries, invoiceNumber }: { trackingId: string; paid: boolean; deliveries: AppointmentDeliveryView[]; invoiceNumber: string | null }) {
  const utils = trpc.useUtils();
  const retry = trpc.admin.appointments.retryFulfillment.useMutation({
    onSuccess: result => {
      void utils.admin.appointments.list.invalidate();
      void utils.admin.attention.invalidate();
      if (result.requeued === 0) toast.info("Aucun envoi à relancer pour ce rendez-vous.");
      else if (result.deliveries.every(delivery => delivery.state === "sent" || delivery.state === "not_sent")) toast.success("Envois relancés et effectués.");
      else toast.warning("Certains envois ont de nouveau échoué ; un nouvel essai automatique est prévu. Vérifiez le service d’envoi d’emails (Resend) ou prévenez le patient directement.", { duration: 10_000 });
    },
    onError: error => toast.error(error.message),
  });
  const invoice = trpc.admin.appointments.invoicePdf.useMutation({
    onSuccess: result => downloadInvoicePdf(result),
    onError: error => toast.error(error.message),
  });

  if (deliveries.length === 0 && !invoiceNumber) return null;
  const ordered = DELIVERY_ORDER.flatMap(jobType => deliveries.filter(delivery => delivery.jobType === jobType));
  const buttonClass = "min-h-10 flex-1 sm:min-h-0 sm:flex-none";

  return (
    <div role="group" aria-label={`Envois après paiement de ${trackingId}`} className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <ul className="flex flex-wrap gap-2">
        {ordered.map(delivery => (
          <li key={delivery.jobType} className={`rounded px-2 py-1 text-xs font-medium ${DELIVERY_STATE_TONES[delivery.state]}`}>{deliveryLabel(delivery)}</li>
        ))}
        {invoiceNumber && <li className="rounded px-2 py-1 font-mono text-xs text-muted-foreground">{invoiceNumber}</li>}
      </ul>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        {canRetryDeliveries(deliveries, paid) && (
          <Button size="sm" variant="outline" className={buttonClass} disabled={retry.isPending}
            onClick={() => {
              if (!window.confirm(`Renvoyer maintenant les envois non aboutis du rendez-vous ${trackingId} ? Les envois déjà effectués ne sont pas répétés.`)) return;
              retry.mutate({ trackingId });
            }}>
            <RefreshCw className="w-3 h-3 mr-1" />
            {retry.isPending ? "Envoi…" : "Renvoyer"}
          </Button>
        )}
        {invoiceNumber && (
          <Button size="sm" variant="outline" className={buttonClass} disabled={invoice.isPending} onClick={() => invoice.mutate({ trackingId })}>
            <Download className="w-3 h-3 mr-1" />
            {invoice.isPending ? "Préparation…" : "Télécharger la facture"}
          </Button>
        )}
      </div>
    </div>
  );
}
