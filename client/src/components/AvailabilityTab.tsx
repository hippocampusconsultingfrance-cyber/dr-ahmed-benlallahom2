import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { XCircle, Plus, Trash, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { AdminErrorState } from "@/components/AdminStatePanel";
import { ADMIN_BADGE_TONES } from "@/components/AdminStatusBadge";

const EMPTY_BLOCK_FORM = { date: "", to: "", reason: "" };

/** ADM-21: the days of the week from Monday, as the booking page and the slots list order them. */
const WEEK_FROM_MONDAY = [1, 2, 3, 4, 5, 6, 0];

export default function AvailabilityTab() {
  const utils = trpc.useUtils();
  const {
    data: slots,
    isLoading: slotsLoading,
    error: slotsError,
    refetch: refetchSlots,
    isFetching: slotsFetching,
  } = trpc.admin.availability.listSlots.useQuery();
  const {
    data: blockedDates,
    isLoading: blockedLoading,
    error: blockedError,
    refetch: refetchBlockedDates,
    isFetching: blockedFetching,
  } = trpc.admin.availability.listBlockedDates.useQuery();

  const [showSlotForm, setShowSlotForm] = useState(false);
  const [slotForm, setSlotForm] = useState({
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:00",
  });
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockForm, setBlockForm] = useState(EMPTY_BLOCK_FORM);
  const closeBlockForm = () => {
    setShowBlockForm(false);
    setBlockForm(EMPTY_BLOCK_FORM);
  };

  const createSlot = trpc.admin.availability.addSlot.useMutation({
    onSuccess: () => {
      toast.success("Créneau ajouté");
      utils.admin.availability.listSlots.invalidate();
      setShowSlotForm(false);
      setSlotForm({ dayOfWeek: 1, startTime: "09:00", endTime: "10:00" });
    },
    onError: e => toast.error(e.message),
  });

  const deleteSlot = trpc.admin.availability.deleteSlot.useMutation({
    onSuccess: () => {
      toast.success("Créneau supprimé");
      utils.admin.availability.listSlots.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const blockDate = trpc.admin.availability.addBlockedDate.useMutation({
    onSuccess: ({ paidAppointments }) => {
      toast.success("Date bloquée");
      if (paidAppointments.length > 0)
        toast.warning(
          `Rendez-vous payés à traiter ce jour-là : ${paidAppointments.join(", ")}.`
        );
      utils.admin.availability.listBlockedDates.invalidate();
      closeBlockForm();
    },
    onError: (e, variables) => {
      // Rendez-vous payés ce jour-là : avertir, puis bloquer seulement après confirmation.
      if (
        e.data?.code === "PRECONDITION_FAILED" &&
        !variables.acknowledgePaidAppointments
      ) {
        if (window.confirm(`${e.message}\n\nBloquer quand même cette date ?`))
          blockDate.mutate({ ...variables, acknowledgePaidAppointments: true });
        return;
      }
      toast.error(e.message);
    },
  });

  // ADM-21: every day of a period at once, after one warning that lists its paid appointments.
  const blockPeriod = trpc.admin.availability.addBlockedPeriod.useMutation({
    onSuccess: ({ blocked, alreadyBlocked, paidAppointments }) => {
      toast.success(
        `Période bloquée : ${blocked} date(s)${alreadyBlocked > 0 ? ` ; ${alreadyBlocked} date(s) déjà bloquée(s) laissée(s) telle(s) quelle(s)` : ""}.`
      );
      if (paidAppointments.length > 0)
        toast.warning(
          `Rendez-vous payés à traiter sur cette période : ${paidAppointments.join(", ")}.`
        );
      utils.admin.availability.listBlockedDates.invalidate();
      closeBlockForm();
    },
    onError: (e, variables) => {
      if (
        e.data?.code === "PRECONDITION_FAILED" &&
        !variables.acknowledgePaidAppointments
      ) {
        if (
          window.confirm(`${e.message}\n\nBloquer quand même cette période ?`)
        )
          blockPeriod.mutate({
            ...variables,
            acknowledgePaidAppointments: true,
          });
        return;
      }
      toast.error(e.message);
    },
  });

  /** One date, or a period when « Au » names a later day. */
  const submitBlockForm = () => {
    const reason = blockForm.reason;
    if (blockForm.to && blockForm.to !== blockForm.date)
      blockPeriod.mutate({ from: blockForm.date, to: blockForm.to, reason });
    else blockDate.mutate({ date: blockForm.date, reason });
  };

  // ADM-21: every weekly slot closed, or reopened, at once.
  const bookingsSuspended =
    !!slots && slots.length > 0 && slots.every(slot => slot.isActive === 0);
  const setBookingsSuspended =
    trpc.admin.availability.setBookingsSuspended.useMutation({
      onSuccess: ({ suspended }) => {
        toast.success(
          suspended
            ? "Réservations suspendues : le site ne propose plus aucun créneau."
            : "Réservations reprises : les créneaux hebdomadaires sont de nouveau proposés."
        );
        utils.admin.availability.listSlots.invalidate();
      },
      onError: e => toast.error(e.message),
    });
  const toggleBookings = () => {
    const question = bookingsSuspended
      ? "Reprendre les réservations en ligne ? Les créneaux hebdomadaires pourront de nouveau être réservés par les patients, hors dates bloquées."
      : "Suspendre les réservations en ligne ? Le site ne proposera plus aucun créneau jusqu’à leur reprise. Les rendez-vous déjà pris, ou en attente de paiement, sont conservés : annulez-les depuis l’onglet Réservations si besoin.";
    if (!window.confirm(question)) return;
    setBookingsSuspended.mutate({ suspended: !bookingsSuspended });
  };

  const unblockDate = trpc.admin.availability.removeBlockedDate.useMutation({
    onSuccess: () => {
      toast.success("Date débloquée");
      utils.admin.availability.listBlockedDates.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const dayNames = [
    "Dimanche",
    "Lundi",
    "Mardi",
    "Mercredi",
    "Jeudi",
    "Vendredi",
    "Samedi",
  ];

  if (slotsLoading || blockedLoading) {
    return <PublicContentSkeleton label="Chargement des disponibilités" />;
  }

  return (
    <div className="space-y-8">
      {/* Créneaux hebdomadaires */}
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            Créneaux hebdomadaires
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            {/* ADM-21: closes or reopens every slot at once; a slot added meanwhile waits for the resumption. */}
            {!slotsError && slots && slots.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="min-h-10 w-full sm:w-auto sm:min-h-0"
                onClick={toggleBookings}
                disabled={setBookingsSuspended.isPending}
              >
                {bookingsSuspended ? (
                  <PlayCircle className="w-4 h-4 mr-2" aria-hidden="true" />
                ) : (
                  <PauseCircle className="w-4 h-4 mr-2" aria-hidden="true" />
                )}
                {bookingsSuspended
                  ? "Reprendre les réservations"
                  : "Suspendre les réservations"}
              </Button>
            )}
            <Button
              size="sm"
              className="min-h-10 w-full sm:w-auto sm:min-h-0"
              onClick={() => setShowSlotForm(!showSlotForm)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un créneau
            </Button>
          </div>
        </div>

        {bookingsSuspended && (
          <p
            className={`mb-4 rounded-lg border p-3 text-sm ${ADMIN_BADGE_TONES.warning}`}
          >
            Réservations en ligne suspendues : le site ne propose aucun créneau,
            y compris ceux ajoutés depuis. Les rendez-vous déjà pris sont
            conservés.
          </p>
        )}

        {showSlotForm && (
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Jour
                </label>
                <select
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={slotForm.dayOfWeek}
                  onChange={e =>
                    setSlotForm({
                      ...slotForm,
                      dayOfWeek: parseInt(e.target.value),
                    })
                  }
                >
                  {WEEK_FROM_MONDAY.map(day => (
                    <option key={day} value={day}>
                      {dayNames[day]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Début
                </label>
                <input
                  type="time"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={slotForm.startTime}
                  onChange={e =>
                    setSlotForm({ ...slotForm, startTime: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Fin
                </label>
                <input
                  type="time"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={slotForm.endTime}
                  onChange={e =>
                    setSlotForm({ ...slotForm, endTime: e.target.value })
                  }
                />
              </div>
              <Button
                className="min-h-11 w-full md:w-auto md:min-h-0"
                onClick={() => createSlot.mutate(slotForm)}
                disabled={createSlot.isPending}
              >
                Ajouter
              </Button>
            </div>
          </div>
        )}

        {/* ADM-10: a list that could not be loaded is not shown as an empty one. */}
        {slotsError ? (
          <AdminErrorState
            description={slotsError.message}
            onRetry={() => void refetchSlots()}
            retrying={slotsFetching}
            headingLevel={4}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {slots?.map(slot => (
              <div
                key={slot.id}
                className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                  <span className="font-medium text-foreground">
                    {dayNames[slot.dayOfWeek]}
                  </span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {slot.startTime} - {slot.endTime}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-10 self-start sm:min-h-0"
                  aria-label={`Supprimer le créneau ${dayNames[slot.dayOfWeek]} ${slot.startTime} - ${slot.endTime}`}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Supprimer le créneau ${dayNames[slot.dayOfWeek]} ${slot.startTime} - ${slot.endTime} ?`
                      )
                    )
                      return;
                    deleteSlot.mutate({ id: slot.id });
                  }}
                >
                  <Trash className="w-3 h-3 text-red-400" aria-hidden="true" />
                </Button>
              </div>
            ))}
            {(!slots || slots.length === 0) && (
              <p className="text-muted-foreground col-span-full text-center py-4">
                Aucun créneau configuré
              </p>
            )}
          </div>
        )}
      </section>

      {/* Dates bloquées */}
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            Dates bloquées
          </h3>
          <Button
            size="sm"
            className="min-h-10 w-full sm:w-auto sm:min-h-0"
            onClick={() => setShowBlockForm(!showBlockForm)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Bloquer une date ou une période
          </Button>
        </div>

        {showBlockForm && (
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label
                  htmlFor="blocked-date-from"
                  className="text-sm text-muted-foreground block mb-1"
                >
                  Du
                </label>
                <input
                  id="blocked-date-from"
                  type="date"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={blockForm.date}
                  onChange={e =>
                    setBlockForm({ ...blockForm, date: e.target.value })
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="blocked-date-to"
                  className="text-sm text-muted-foreground block mb-1"
                >
                  Au (inclus, facultatif)
                </label>
                <input
                  id="blocked-date-to"
                  type="date"
                  min={blockForm.date || undefined}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={blockForm.to}
                  onChange={e =>
                    setBlockForm({ ...blockForm, to: e.target.value })
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="blocked-date-reason"
                  className="text-sm text-muted-foreground block mb-1"
                >
                  Motif interne (optionnel, jamais affiché sur le site)
                </label>
                <input
                  id="blocked-date-reason"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={blockForm.reason}
                  onChange={e =>
                    setBlockForm({ ...blockForm, reason: e.target.value })
                  }
                  placeholder="Note pour vous uniquement"
                />
              </div>
              <Button
                className="min-h-11 w-full md:w-auto md:min-h-0"
                onClick={submitBlockForm}
                disabled={
                  blockDate.isPending ||
                  blockPeriod.isPending ||
                  !blockForm.date
                }
              >
                Bloquer
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Pour une seule date, laissez « Au » vide. Une période compte 366
              jours au plus ; ses dates déjà bloquées restent telles quelles.
            </p>
          </div>
        )}

        {blockedError ? (
          <AdminErrorState
            description={blockedError.message}
            onRetry={() => void refetchBlockedDates()}
            retrying={blockedFetching}
            headingLevel={4}
          />
        ) : (
          <div className="space-y-2">
            {blockedDates?.map(bd => {
              const dateLabel = new Date(
                bd.date + "T00:00:00"
              ).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              });
              return (
                <div
                  key={bd.id}
                  className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                    <span className="font-medium text-foreground">
                      {dateLabel}
                    </span>
                    {bd.reason && (
                      <span className="text-sm text-muted-foreground ml-3">
                        {bd.reason}
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-10 self-start sm:min-h-0"
                    // A11Y-12: the icon alone names nothing.
                    aria-label={`Débloquer le ${dateLabel}`}
                    onClick={() => {
                      // ADM-11: unblocking reopens the day's weekly slots to booking.
                      if (
                        !window.confirm(
                          `Débloquer le ${dateLabel} ? Les créneaux hebdomadaires de ce jour pourront de nouveau être réservés par les patients.`
                        )
                      )
                        return;
                      unblockDate.mutate({ id: bd.id });
                    }}
                  >
                    <XCircle
                      className="w-4 h-4 text-red-400"
                      aria-hidden="true"
                    />
                  </Button>
                </div>
              );
            })}
            {(!blockedDates || blockedDates.length === 0) && (
              <p className="text-muted-foreground text-center py-4">
                Aucune date bloquée
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
