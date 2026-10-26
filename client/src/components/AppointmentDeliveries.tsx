import { Download, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { downloadInvoicePdf } from "./invoicePdfDownload";

export type AppointmentDeliveryJob = "confirmation" | "invoice" | "owner" | "refund" | "refund_owner";
export type AppointmentDeliveryState = "sent" | "failed" | "refused" | "retrying" | "pending" | "sending" | "interrupted" | "not_sent";
export type AppointmentDeliveryNotSentReason = "appointment_past" | "not_paid" | "patient_data_erased";
export type AppointmentDeliveryView = { jobType: AppointmentDeliveryJob; state: AppointmentDeliveryState; attempts: number; maxAttempts: number; notSentReason?: AppointmentDeliveryNotSentReason | null };

/** In the order the practitioner reads them (EXPL-02), then the notices of a refund (RES-06). */
const DELIVERY_ORDER: AppointmentDeliveryJob[] = ["confirmation", "invoice", "owner", "refund", "refund_owner"];

function inReadingOrder(deliveries: AppointmentDeliveryView[]) {
  return DELIVERY_ORDER.flatMap(jobType => deliveries.filter(delivery => delivery.jobType === jobType));
}

export const DELIVERY_JOB_LABELS: Record<AppointmentDeliveryJob, string> = {
  confirmation: "Confirmation",
  invoice: "Facture",
  owner: "Notification médecin",
  refund: "Email de remboursement",
  refund_owner: "Alerte remboursement",
};

/** What « Renvoyer » sends again, as the server: post-payment emails of a paid appointment, refund notices of a refunded one. */
const RETRYABLE_JOBS: Record<string, AppointmentDeliveryJob[]> = {
  completed: ["confirmation", "invoice", "owner"],
  refunded: ["refund", "refund_owner"],
};

/**
 * Emails written to the patient's address: never sent again once their data
 * is erased (RGPD-12), as the server; correctable by the dashboard after a
 * refusal (EXPL-02).
 */
export const PATIENT_JOBS: AppointmentDeliveryJob[] = ["confirmation", "invoice", "refund"];

/** « Email de remboursement » is masculine; the other labels are feminine. */
const MASCULINE_JOBS: AppointmentDeliveryJob[] = ["refund"];

/** A participle agreeing with the labels it follows: masculine as soon as one of them is. */
function agree(jobTypes: AppointmentDeliveryJob[], feminine: string, masculine: string) {
  return jobTypes.some(jobType => MASCULINE_JOBS.includes(jobType)) ? masculine : feminine;
}

const DELIVERY_STATE_LABELS: Record<AppointmentDeliveryState, string> = {
  sent: "envoyée",
  failed: "en échec",
  // Same words as the alert email (EXPL-02): not passing, no new automatic attempt.
  refused: "refusée par le service d’envoi, sans nouvel essai automatique",
  retrying: "en échec, nouvel essai prévu",
  pending: "en attente",
  sending: "en cours d’envoi",
  interrupted: "envoi interrompu",
  not_sent: "non envoyée",
};

/** The labels above that agree with a masculine job label. */
const MASCULINE_STATE_LABELS: Partial<Record<AppointmentDeliveryState, string>> = {
  sent: "envoyé",
  refused: "refusé par le service d’envoi, sans nouvel essai automatique",
  not_sent: "non envoyé",
};

function stateLabel(delivery: AppointmentDeliveryView) {
  return agree([delivery.jobType], DELIVERY_STATE_LABELS[delivery.state], MASCULINE_STATE_LABELS[delivery.state] ?? DELIVERY_STATE_LABELS[delivery.state]);
}

const DELIVERY_STATE_TONES: Record<AppointmentDeliveryState, string> = {
  sent: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
  refused: "bg-red-500/20 text-red-400",
  retrying: "bg-amber-500/20 text-amber-400",
  pending: "bg-slate-500/20 text-slate-300",
  sending: "bg-blue-500/20 text-blue-400",
  interrupted: "bg-amber-500/20 text-amber-400",
  not_sent: "bg-muted text-muted-foreground",
};

const NOT_SENT_REASONS: Record<AppointmentDeliveryNotSentReason, string> = {
  appointment_past: "la consultation est déjà passée",
  not_paid: "le rendez-vous n’est plus payé",
  patient_data_erased: "données du patient effacées (RGPD)",
};

/** « Facture : en échec (6/6) », « Confirmation : envoyée », « Email de remboursement : envoyé »… */
export function deliveryLabel(delivery: AppointmentDeliveryView): string {
  const attempts = delivery.state === "failed" || delivery.state === "retrying" ? ` (${delivery.attempts}/${delivery.maxAttempts})` : "";
  return `${DELIVERY_JOB_LABELS[delivery.jobType]} : ${stateLabel(delivery)}${attempts}`;
}

/** States of a job « Renvoyer » sends again: it did not go out, and is not being sent. */
const UNSENT_STATES: AppointmentDeliveryState[] = ["failed", "refused", "retrying", "pending", "interrupted"];

/**
 * « Renvoyer » has something to send now: a job of a paid appointment failed,
 * was refused by the email service (sent again once the address is
 * corrected), was interrupted, or still waits for an attempt
 * (not one being sent). Once the appointment is refunded, only the notices of
 * that refund (RES-06); the server refuses the other payment statuses. Once
 * the patient's data is erased (RGPD-12), only the owner's notices.
 */
export function canRetryDeliveries(deliveries: AppointmentDeliveryView[], paymentStatus: string, patientDataErased = false): boolean {
  const retryable = (RETRYABLE_JOBS[paymentStatus] ?? []).filter(jobType => !patientDataErased || !PATIENT_JOBS.includes(jobType));
  return deliveries.some(delivery => retryable.includes(delivery.jobType) && UNSENT_STATES.includes(delivery.state));
}

/**
 * « Corriger l’email du patient » is offered once the email service refused an
 * email to the patient that « Renvoyer » would send again (EXPL-02), never on a
 * booking whose data was erased (RGPD-12: its address is empty), as the server.
 */
export function canCorrectPatientEmail(deliveries: AppointmentDeliveryView[], paymentStatus: string, customerEmail: string | null | undefined): boolean {
  const retryable = RETRYABLE_JOBS[paymentStatus] ?? [];
  return Boolean(customerEmail?.trim()) && deliveries.some(delivery => PATIENT_JOBS.includes(delivery.jobType) && retryable.includes(delivery.jobType) && delivery.state === "refused");
}

/**
 * Toast after « Corriger l’email du patient »: the patient emails « Renvoyer »
 * now writes to the new address, the ones that did not go out. An invoice
 * already issued keeps its details, the address it was issued to included:
 * the copy stored at its issue is the one downloaded, and emailed again only
 * when its own email did not go out (EXPL-02); an invoice received at the
 * payment is not sent again with a refund email.
 */
export function correctedEmailNotice(invoiceNumber: string | null, deliveries: AppointmentDeliveryView[], paymentStatus: string): string {
  const retryable = RETRYABLE_JOBS[paymentStatus] ?? [];
  const resent = inReadingOrder(deliveries)
    .filter(delivery => PATIENT_JOBS.includes(delivery.jobType) && retryable.includes(delivery.jobType) && UNSENT_STATES.includes(delivery.state))
    .map(delivery => delivery.jobType);
  const invoice = !invoiceNumber ? ""
    : ` La facture ${invoiceNumber} déjà émise garde ses mentions, dont l’adresse d’origine : ${resent.includes("invoice") ? "elle est renvoyée et téléchargée telle qu’émise." : "elle n’est pas renvoyée, et se télécharge telle qu’émise."}`;
  return `Adresse du patient corrigée. « Renvoyer » envoie maintenant à cette adresse : ${resent.map(jobType => DELIVERY_JOB_LABELS[jobType]).join(", ")}.${invoice}`;
}

/**
 * Toast after « Renvoyer », about the jobs it put back in the queue only (not
 * the ones already sent before it): everything went out; some were
 * deliberately not sent (a confirmation after the consultation…), said apart
 * from the ones sent; some were refused again by the email service, with no
 * new automatic attempt; or some failed again and wait for their next
 * automatic attempt.
 */
export function retryOutcome(result: { requeuedJobTypes: AppointmentDeliveryJob[]; deliveries: AppointmentDeliveryView[] }): { tone: "success" | "info" | "warning"; message: string } {
  const deliveries = result.deliveries.filter(delivery => result.requeuedJobTypes.includes(delivery.jobType));
  if (deliveries.some(delivery => delivery.state === "refused")) {
    return { tone: "warning", message: "Le service d’envoi refuse de nouveau l’email (adresse du patient refusée ou invalide, ou contenu de l’email refusé) : ce refus n’est pas passager, aucun nouvel essai automatique n’aura lieu. Vérifiez l’adresse et prévenez le patient directement ; « Corriger l’email du patient » sur le rendez-vous, puis « Renvoyer », l’envoie à la nouvelle adresse." };
  }
  if (!deliveries.every(delivery => delivery.state === "sent" || delivery.state === "not_sent")) {
    return { tone: "warning", message: "Certains envois ont de nouveau échoué ; un nouvel essai automatique est prévu. Vérifiez le service d’envoi d’emails (Resend) ou prévenez le patient directement." };
  }
  const ordered = inReadingOrder(deliveries);
  const skipped = ordered.filter(delivery => delivery.state === "not_sent");
  if (skipped.length === 0) return { tone: "success", message: "Envois relancés et effectués." };
  const sent = ordered.filter(delivery => delivery.state === "sent").map(delivery => delivery.jobType);
  const notSent = skipped.map(delivery => `${DELIVERY_JOB_LABELS[delivery.jobType]} ${agree([delivery.jobType], "non envoyée", "non envoyé")}${delivery.notSentReason ? ` : ${NOT_SENT_REASONS[delivery.notSentReason]}` : ""}.`);
  return { tone: "info", message: [sent.length > 0 ? `${agree(sent, "Envoyées", "Envoyés")} : ${sent.map(jobType => DELIVERY_JOB_LABELS[jobType]).join(", ")}.` : "Rien n’a été envoyé.", ...notSent].join(" ") };
}

/**
 * Post-payment emails of an appointment (EXPL-02): confirmation, invoice and
 * practitioner notification, and the notices of a refund (patient email, and
 * owner alert for a refund made in Stripe, RES-06), sent, failed, refused or
 * pending; « Renvoyer » sends the ones that did not go out right away,
 * « Télécharger la facture » regenerates the invoice already issued,
 * identical to the one emailed. After a refusal, « Corriger l’email du
 * patient » changes the address « Renvoyer » then writes to; the invoice
 * already issued keeps its details.
 */
export default function AppointmentDeliveries({ trackingId, paymentStatus, deliveries, invoiceNumber, customerEmail, patientDataErased = false }: { trackingId: string; paymentStatus: string; deliveries: AppointmentDeliveryView[]; invoiceNumber: string | null; customerEmail?: string | null; patientDataErased?: boolean }) {
  const utils = trpc.useUtils();
  const correctEmail = trpc.admin.appointments.updateCustomerEmail.useMutation({
    onSuccess: result => {
      void utils.admin.appointments.list.invalidate();
      if (result.unchanged) {
        toast.info("Cette adresse est déjà celle du rendez-vous.");
        return;
      }
      toast.success(correctedEmailNotice(invoiceNumber, deliveries, paymentStatus), { duration: 10_000 });
    },
    onError: error => toast.error(error.message),
  });
  const retry = trpc.admin.appointments.retryFulfillment.useMutation({
    onSuccess: result => {
      void utils.admin.appointments.list.invalidate();
      void utils.admin.attention.invalidate();
      if (result.requeued === 0) {
        toast.info("Aucun envoi à relancer pour ce rendez-vous.");
        return;
      }
      const outcome = retryOutcome(result);
      toast[outcome.tone](outcome.message, outcome.tone === "success" ? undefined : { duration: 10_000 });
    },
    onError: error => toast.error(error.message),
  });
  const invoice = trpc.admin.appointments.invoicePdf.useMutation({
    onSuccess: result => downloadInvoicePdf(result),
    onError: error => toast.error(error.message),
  });

  if (deliveries.length === 0 && !invoiceNumber) return null;
  const ordered = inReadingOrder(deliveries);
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
        {canRetryDeliveries(deliveries, paymentStatus, patientDataErased) && (
          <Button size="sm" variant="outline" className={buttonClass} disabled={retry.isPending}
            onClick={() => {
              if (!window.confirm(`Renvoyer maintenant les envois non aboutis du rendez-vous ${trackingId} ? Les envois déjà effectués ne sont pas répétés.`)) return;
              retry.mutate({ trackingId });
            }}>
            <RefreshCw className="w-3 h-3 mr-1" />
            {retry.isPending ? "Envoi…" : "Renvoyer"}
          </Button>
        )}
        {canCorrectPatientEmail(deliveries, paymentStatus, customerEmail) && (
          <Button size="sm" variant="outline" className={buttonClass} disabled={correctEmail.isPending}
            onClick={() => {
              const next = window.prompt(`Adresse email du patient du rendez-vous ${trackingId}, refusée par le service d’envoi. Saisissez l’adresse corrigée ; « Renvoyer » l’utilisera${invoiceNumber ? ` (la facture ${invoiceNumber} déjà émise garde ses mentions, dont l’adresse d’origine)` : ""} :`, customerEmail ?? "")?.trim();
              if (!next || next === customerEmail) return;
              correctEmail.mutate({ trackingId, customerEmail: next });
            }}>
            <Mail className="w-3 h-3 mr-1" />
            {correctEmail.isPending ? "Enregistrement…" : "Corriger l’email du patient"}
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

/**
 * Warning after a refund from the dashboard whose patient email did not go out
 * (EXPL-02): refused by the email service, waiting for its next automatic
 * attempt (that email goes through the queue), or not sent at all (refund of a
 * Checkout session, email that could not be queued).
 */
export function refundEmailWarning(patientEmail: AppointmentDeliveryState | null | undefined): string {
  if (patientEmail === "refused") return "L’email de remboursement au patient a été refusé par le service d’envoi (adresse refusée ou invalide, ou contenu de l’email refusé) : ce refus n’est pas passager, prévenez le patient directement. Sur le rendez-vous, « Corriger l’email du patient », puis « Renvoyer » l’envoie à la nouvelle adresse.";
  if (patientEmail === "retrying" || patientEmail === "pending" || patientEmail === "sending" || patientEmail === "interrupted") {
    return "L’email de remboursement au patient n’est pas encore parti : un nouvel essai automatique est prévu (état sur le rendez-vous et dans « À traiter »). Vous pouvez aussi prévenir le patient directement.";
  }
  return "L’email au patient n’a pas pu être envoyé : prévenez-le directement.";
}
