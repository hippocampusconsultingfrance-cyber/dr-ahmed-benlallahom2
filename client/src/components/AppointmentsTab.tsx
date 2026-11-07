import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, CheckCircle, XCircle, Clock, CalendarDays, Printer } from "lucide-react";
import { toast } from "sonner";
import { AdminEmptyState, AdminErrorState } from "@/components/AdminStatePanel";
import AdminLoadMore from "@/components/AdminLoadMore";
import AdminSearchField from "@/components/AdminSearchField";
import AdminClampedText from "@/components/AdminClampedText";
import AppointmentDeliveries, { refundEmailWarning, type AppointmentDeliveryState } from "@/components/AppointmentDeliveries";
import { adminListCount, adminPageOffsets, ADMIN_PAGE_SIZE, mergeAdminPages, useAdminPageCount } from "@/components/adminPagination";
import { adminSearchStatus, useAdminSearch } from "@/components/adminSearch";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { agendaDays, buildAppointmentsAgenda, type AgendaRange } from "@/pages/appointmentsAgenda";
import { getAppointmentAdminActions, PATIENT_DATA_ERASED_REASON_PROMPT, PATIENT_DATA_ERASED_REFUND_NOTICE } from "@/pages/appointmentAdminActions";
import { formatAdminAmount } from "@/components/adminAmount";
import { APPOINTMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/components/appointmentStatusLabels";

/**
 * The list's filters (ADM-18): by default without the bookings that never
 * became one (slot held without payment, failed payment, payment never
 * started), « Tout afficher » for every one, or a payment status.
 */
type AppointmentListFilter = "useful" | "all" | "pending" | "completed" | "failed" | "refunded";

const LIST_FILTERS: AppointmentListFilter[] = ["useful", "all", "pending", "completed", "failed", "refunded"];
const LIST_FILTER_LABELS: Partial<Record<AppointmentListFilter, string>> = { useful: "Sans les abandons", all: "Tout afficher" };

function listFilterInput(filter: AppointmentListFilter) {
  return filter === "useful" ? { excludeAbandoned: true } : filter === "all" ? {} : { status: filter };
}

/** « 31/10/2026 10:00 », Paris time, without the seconds (ADM-18). */
const parisDateTime = (date: string | Date) => new Date(date).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
/** « 12 octobre 2026 », a Paris calendar day (YYYY-MM-DD). */
const parisLongDay = (day: string) => new Date(`${day}T12:00:00.000Z`).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" });

const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-500/20 text-blue-400",
  cancelled: "bg-red-500/20 text-red-400",
  completed: "bg-green-500/20 text-green-400",
  no_show: "bg-gray-500/20 text-gray-400",
};

const AGENDA_RANGES: Array<{ id: AgendaRange; label: string }> = [
  { id: "today", label: "Aujourd’hui" },
  { id: "week", label: "7 jours" },
  { id: "month", label: "30 jours" },
];

/**
 * Agenda of the consultations (ADM-18), read by the server by consultation
 * date over whole Paris days, whatever the list below shows: today, the next
 * 7 or 30 days, paid appointments only. « Imprimer » prints it alone.
 */
function AppointmentsAgenda() {
  const [range, setRange] = useState<AgendaRange>("week");
  const days = agendaDays(range);
  const { data, isLoading, error } = trpc.admin.appointments.agenda.useQuery(days);
  const agenda = buildAppointmentsAgenda(data?.items ?? []);
  const period = days.from === days.to ? `le ${parisLongDay(days.from)}` : `du ${parisLongDay(days.from)} au ${parisLongDay(days.to)}`;

  return (
    <section aria-labelledby="appointments-agenda-title" className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5 print:border-0 print:bg-transparent print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary print:hidden" aria-hidden="true" />
          <h2 id="appointments-agenda-title" className="font-semibold text-foreground">Agenda des consultations</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div role="group" aria-label="Période de l’agenda" className="flex gap-2">
            {AGENDA_RANGES.map(option => (
              <button
                key={option.id}
                type="button"
                aria-pressed={range === option.id}
                onClick={() => setRange(option.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${range === option.id ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => window.print()} disabled={isLoading || Boolean(error)}>
            <Printer className="w-3 h-3 mr-1" />
            Imprimer
          </Button>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Consultations payées {period} · heure de Paris</p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement de l’agenda…</p>
      ) : error ? (
        <p className="text-sm text-red-400">L’agenda n’a pas pu être chargé : {error.message}</p>
      ) : agenda.length > 0 ? (
        <div className="space-y-3">
          {agenda.map(day => (
            <article key={day.key} aria-labelledby={`agenda-day-${day.key}`} className="rounded-lg border border-border bg-card p-3 break-inside-avoid">
              <h3 id={`agenda-day-${day.key}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">{day.label}</h3>
              <ul className="space-y-2">
                {day.items.map(apt => (
                  <li key={apt.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="min-w-0 text-foreground wrap-anywhere">
                      <span className="font-mono text-primary">{apt.time}</span> · {apt.customerName}
                      {apt.customerPhone && <span className="text-muted-foreground"> · {apt.customerPhone}</span>}
                      <span className="font-mono text-xs text-muted-foreground"> · {apt.trackingId}</span>
                    </span>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${APPOINTMENT_STATUS_COLORS[apt.appointmentStatus] || "bg-muted text-muted-foreground"} print:bg-transparent print:px-0 print:text-foreground`}>{APPOINTMENT_STATUS_LABELS[apt.appointmentStatus] ?? apt.appointmentStatus}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {data?.truncated && <p className="text-xs text-muted-foreground">Agenda limité aux {data.limit} premières consultations de la période : choisissez une période plus courte.</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune consultation payée {period}.</p>
      )}
    </section>
  );
}

/**
 * What became of a cancelled or refunded booking (ADM-18): when and why it
 * was cancelled, how much was refunded and when.
 */
function cancellationDetails(apt: { cancellationReason?: string | null; cancelledAt?: string | Date | null; refundAmount?: string | null; refundedAt?: string | Date | null }) {
  return [
    apt.refundAmount || apt.refundedAt ? `Remboursé${apt.refundAmount ? ` ${formatAdminAmount(apt.refundAmount)}` : ""}${apt.refundedAt ? ` le ${parisDateTime(apt.refundedAt)}` : ""}` : "",
    apt.cancelledAt ? `Annulé le ${parisDateTime(apt.cancelledAt)}` : "",
    apt.cancellationReason ? `Motif : ${apt.cancellationReason}` : "",
  ].filter(Boolean);
}

/** `initialSearch`: the reference the dashboard's address names (ADM-09), searched at once. */
export default function AppointmentsTab({ initialSearch = "" }: { initialSearch?: string } = {}) {
  const [statusFilter, setStatusFilter] = useState<AppointmentListFilter>("useful");
  // ADM-02: patient name, email or booking reference, searched by the server.
  const { text: searchText, search, setText: setSearchText, clear: clearSearch } = useAdminSearch(initialSearch);
  const utils = trpc.useUtils();
  // ADM-01: 50 rows, then « Charger plus » (offset + 50), back to the first page when the filter or the search changes.
  const { pageCount, loadMore } = useAdminPageCount(JSON.stringify({ status: statusFilter, search }));
  const pages = trpc.useQueries(t => adminPageOffsets(pageCount).map(offset => t.admin.appointments.list({ ...listFilterInput(statusFilter), search, limit: ADMIN_PAGE_SIZE, offset })));
  const { items, total, isLoading, isLoadingMore, error, loadMoreError, retryLoadMore, retry, retrying } = mergeAdminPages(pages);
  const [unconfirmedSessionId, setUnconfirmedSessionId] = useState("");
  const updateStatus = trpc.admin.appointments.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Statut mis à jour");
      utils.admin.appointments.list.invalidate();
      // Done, missed, back to confirmed or cancelled: the agenda above says it too (ADM-18).
      utils.admin.appointments.agenda.invalidate();
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
    // A refunded consultation leaves the agenda (ADM-18).
    utils.admin.appointments.agenda.invalidate();
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
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
      <div>
        <div role="group" aria-label="Filtrer les réservations" className="flex gap-2 flex-wrap">
          {LIST_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={statusFilter === filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === filter ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {LIST_FILTER_LABELS[filter] ?? PAYMENT_STATUS_LABELS[filter]}
            </button>
          ))}
        </div>
        {statusFilter === "useful" && <p className="mt-2 text-xs text-muted-foreground">Réservations abandonnées masquées : créneau tenu sans paiement, paiement échoué ou jamais commencé. « Tout afficher » les montre.</p>}
      </div>
      <AdminSearchField id="appointments-search" label="Rechercher une réservation" placeholder="Nom, email ou référence APT…" value={searchText} onChange={setSearchText} onClear={clearSearch} status={adminSearchStatus(search, { isLoading, error, shown: items.length, total }, "réservation(s)")} className="w-full md:max-w-sm" />
    </div>
  );

  // The agenda is read on its own, whatever the list shows or whether it loaded (ADM-18).
  const agenda = <AppointmentsAgenda />;

  if (error) {
    return <div>{agenda}{toolbar}<AdminErrorState description={error.message} onRetry={retry} retrying={retrying} /></div>;
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
    refunded: "bg-purple-500/20 text-purple-400",
  };

  if (isLoading) {
    return <div>{agenda}{toolbar}<PublicContentSkeleton label="Chargement des rendez-vous" /></div>;
  }

  return (
    <div>
      {agenda}

      {toolbar}

      <p className="text-sm text-muted-foreground mb-4 wrap-anywhere print:hidden">{adminListCount(items.length, total, "réservation(s)")}{search ? ` pour « ${search} »` : ""}</p>

      {/* Table */}
      <div className="space-y-3 print:hidden">
        {items.map((apt) => (
          <div key={apt.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* EXPL-02: what the patient typed (name, phone) wraps inside the card. */}
              <div className="flex-1 min-w-0 wrap-anywhere">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                  <span className="font-semibold text-foreground">{apt.customerName}</span>
                  <span className="max-w-full break-all text-xs text-muted-foreground font-mono">{apt.trackingId}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="break-all">{apt.customerEmail}</span>
                  <span>{apt.customerPhone}</span>
                  <span>{parisDateTime(apt.appointmentDate)}</span>
                  <span className="font-semibold text-foreground">{formatAdminAmount(apt.finalPrice)}</span>
                  {/* Langue de la page de réservation : emails patients en anglais sauf pour FR (EN-01). */}
                  <span title="Langue de la réservation et des emails au patient">Langue : {(apt.language || "fr").toUpperCase()}</span>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[apt.paymentStatus] || ""}`}>
                  {PAYMENT_STATUS_LABELS[apt.paymentStatus] ?? apt.paymentStatus}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${APPOINTMENT_STATUS_COLORS[apt.appointmentStatus] || ""}`}>
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
            {/* A long link wraps; « Voir tout » shows the whole request (EXPL-02). */}
            {apt.requestDetails && (
              <AdminClampedText text={apt.requestDetails} about={`demande de ${apt.customerName}`} className="text-sm text-muted-foreground mt-2" />
            )}
            {cancellationDetails(apt).length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground wrap-anywhere">{cancellationDetails(apt).join(" · ")}</p>
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
      <div className="print:hidden">
        <AdminLoadMore shown={items.length} total={total} loading={isLoadingMore} onLoadMore={loadMore} error={loadMoreError} onRetry={retryLoadMore} />
      </div>

      <section aria-labelledby="unconfirmed-refund-title" className="mt-6 rounded-xl border border-border bg-card p-4 print:hidden">
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
