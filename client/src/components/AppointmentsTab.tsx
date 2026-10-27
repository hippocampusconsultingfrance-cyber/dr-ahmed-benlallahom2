import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, CheckCircle, XCircle, Clock, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { AdminEmptyState, AdminErrorState } from "@/components/AdminStatePanel";
import AdminLoadMore from "@/components/AdminLoadMore";
import AdminSearchField from "@/components/AdminSearchField";
import AppointmentDeliveries, { refundEmailWarning, type AppointmentDeliveryState } from "@/components/AppointmentDeliveries";
import { adminListCount, adminPageOffsets, ADMIN_PAGE_SIZE, mergeAdminPages, useAdminPageCount } from "@/components/adminPagination";
import { adminSearchStatus, useAdminSearch } from "@/components/adminSearch";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { buildAppointmentsAgenda } from "@/pages/appointmentsAgenda";
import { getAppointmentAdminActions, PATIENT_DATA_ERASED_REASON_PROMPT, PATIENT_DATA_ERASED_REFUND_NOTICE } from "@/pages/appointmentAdminActions";
import { formatAdminAmount } from "@/components/adminAmount";
import { APPOINTMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/components/appointmentStatusLabels";

export default function AppointmentsTab() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "completed" | "failed" | "refunded" | undefined>(undefined);
  // ADM-02: patient name, email or booking reference, searched by the server.
  const { text: searchText, search, setText: setSearchText, clear: clearSearch } = useAdminSearch();
  const utils = trpc.useUtils();
  // ADM-01: 50 rows, then « Charger plus » (offset + 50), back to the first page when the filter or the search changes.
  const { pageCount, loadMore } = useAdminPageCount(JSON.stringify({ status: statusFilter, search }));
  const pages = trpc.useQueries(t => adminPageOffsets(pageCount).map(offset => t.admin.appointments.list({ status: statusFilter, search, limit: ADMIN_PAGE_SIZE, offset })));
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
  const notifyRefundResult = ({ refundAmount, patientNotified, patientEmail, patientDataErased }: { refundAmount: string; patientNotified: boolean; patientEmail?: AppointmentDeliveryState | null; patientDataErased?: boolean }) => {
    // « 100,00 € », as in the emails.
    toast.success(`Remboursement confirmé : ${formatAdminAmount(refundAmount)}`);
    if (patientDataErased) toast.warning(PATIENT_DATA_ERASED_REFUND_NOTICE);
    // Its patient email goes through the refund queue (EXPL-02): refused, or waiting for its next automatic attempt.
    else if (!patientNotified) toast.warning(refundEmailWarning(patientEmail), { duration: 10_000 });
    utils.admin.appointments.list.invalidate();
    utils.admin.stats.invalidate();
    // Its post-payment emails waiting for a retry were just closed as not sent (EXPL-02).
    utils.admin.attention.invalidate();
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

  // Filters and search stay on screen (and keep the focus) while the list loads or fails.
  const toolbar = (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex gap-2 flex-wrap">
        {([undefined, "pending", "completed", "failed", "refunded"] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === undefined ? "Tous" : PAYMENT_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <AdminSearchField id="appointments-search" label="Rechercher une réservation" placeholder="Nom, email ou référence APT…" value={searchText} onChange={setSearchText} onClear={clearSearch} status={adminSearchStatus(search, { isLoading, error, shown: items.length, total }, "réservation(s)")} className="w-full md:max-w-sm" />
    </div>
  );

  if (error) {
    return <div>{toolbar}<AdminErrorState description={error.message} /></div>;
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
    return <div>{toolbar}<PublicContentSkeleton label="Chargement des rendez-vous" /></div>;
  }

  return (
    <div>
      {toolbar}

      <p className="text-sm text-muted-foreground mb-4 break-words [overflow-wrap:anywhere]">{adminListCount(items.length, total, "réservation(s)")}{search ? ` pour « ${search} »` : ""}</p>

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
                      <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${appointmentStatusColors[apt.appointmentStatus] || "bg-muted text-muted-foreground"}`}>{APPOINTMENT_STATUS_LABELS[apt.appointmentStatus] ?? apt.appointmentStatus}</span>
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
                  <span className="font-semibold text-foreground">{formatAdminAmount(apt.finalPrice)}</span>
                  {/* Langue de la page de réservation : emails patients en anglais sauf pour FR (EN-01). */}
                  <span title="Langue de la réservation et des emails au patient">Langue : {(apt.language || "fr").toUpperCase()}</span>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[apt.paymentStatus] || ""}`}>
                  {PAYMENT_STATUS_LABELS[apt.paymentStatus] ?? apt.paymentStatus}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${appointmentStatusColors[apt.appointmentStatus] || ""}`}>
                  {APPOINTMENT_STATUS_LABELS[apt.appointmentStatus] ?? apt.appointmentStatus}
                </span>
                {(() => {
                  const actions = getAppointmentAdminActions(apt);
                  const buttonClass = "min-h-10 flex-1 sm:min-h-0 sm:flex-none";
                  return (
                    <>
                      {actions.unconfirmedPayment && (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-400">Paiement à régulariser</span>
                      )}
                      {actions.patientDataErased && (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-slate-500/20 text-slate-300" title="Rendez-vous anonymisé (effacement RGPD ou conservation de 3 ans écoulée) : le patient n’est plus joignable par le site.">Données effacées</span>
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
                          onClick={() => askRefund(apt.trackingId, "practitioner", actions.patientDataErased
                            ? `Annuler ${apt.trackingId} et rembourser intégralement ${formatAdminAmount(apt.finalPrice)}.\n${PATIENT_DATA_ERASED_REFUND_NOTICE}\n${PATIENT_DATA_ERASED_REASON_PROMPT}`
                            : `Annuler ${apt.trackingId} et rembourser intégralement ${formatAdminAmount(apt.finalPrice)} au patient.\nMotif communiqué au patient (obligatoire) :`)}>
                          <XCircle className="w-3 h-3 mr-1" />
                          Annuler (praticien) et rembourser
                        </Button>
                      )}
                      {actions.canPatientRefund && (
                        <Button size="sm" variant="outline" className={buttonClass} disabled={refundAppointment.isPending}
                          onClick={() => askRefund(apt.trackingId, "patient", `Annulation demandée par le patient (plus de 24 h avant) : remboursement de ${formatAdminAmount(apt.finalPrice)}.\nMotif (obligatoire) :`)}>
                          <DollarSign className="w-3 h-3 mr-1" />
                          Annulation patient (remboursement)
                        </Button>
                      )}
                      {(actions.canPractitionerRefund || actions.unconfirmedPayment) && (
                        <Button size="sm" variant="outline" className={buttonClass} disabled={refundAppointment.isPending}
                          onClick={() => askRefund(apt.trackingId, "practitioner", `Rembourser intégralement le paiement de ${apt.trackingId}.${actions.patientDataErased ? `\n${PATIENT_DATA_ERASED_REFUND_NOTICE}\n${PATIENT_DATA_ERASED_REASON_PROMPT}` : "\nMotif (obligatoire) :"}`)}>
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
            <AppointmentDeliveries trackingId={apt.trackingId} paymentStatus={apt.paymentStatus} deliveries={apt.deliveries} invoiceNumber={apt.invoiceNumber} customerEmail={apt.customerEmail} patientDataErased={getAppointmentAdminActions(apt).patientDataErased} />
          </div>
        ))}
        {items.length === 0 && (
          search
            ? <AdminEmptyState icon={CalendarDays} title="Aucun résultat" description={`Aucune réservation ne correspond à « ${search} » avec ce filtre.`} />
            : <AdminEmptyState icon={CalendarDays} title="Aucune réservation" description="Les nouvelles réservations apparaîtront ici dès leur confirmation." />
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
