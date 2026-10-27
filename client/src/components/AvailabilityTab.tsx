import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { XCircle, Plus, Trash } from "lucide-react";
import { toast } from "sonner";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";

export default function AvailabilityTab() {
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
    onSuccess: ({ paidAppointments }) => {
      toast.success("Date bloquée");
      if (paidAppointments.length > 0) toast.warning(`Rendez-vous payés à traiter ce jour-là : ${paidAppointments.join(", ")}.`);
      utils.admin.availability.listBlockedDates.invalidate();
      setShowBlockForm(false);
      setBlockForm({ date: "", reason: "" });
    },
    onError: (e, variables) => {
      // Rendez-vous payés ce jour-là : avertir, puis bloquer seulement après confirmation.
      if (e.data?.code === "PRECONDITION_FAILED" && !variables.acknowledgePaidAppointments) {
        if (window.confirm(`${e.message}\n\nBloquer quand même cette date ?`)) blockDate.mutate({ ...variables, acknowledgePaidAppointments: true });
        return;
      }
      toast.error(e.message);
    },
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
                aria-label={`Supprimer le créneau ${dayNames[slot.dayOfWeek]} ${slot.startTime} - ${slot.endTime}`}
                onClick={() => {
                  if (!window.confirm(`Supprimer le créneau ${dayNames[slot.dayOfWeek]} ${slot.startTime} - ${slot.endTime} ?`)) return;
                  deleteSlot.mutate({ id: slot.id });
                }}
              >
                <Trash className="w-3 h-3 text-red-400" />
              </Button>
            </div>
          ))}
          {(!slots || slots.length === 0) && (
            <p className="text-muted-foreground col-span-full text-center py-4">Aucun créneau configuré</p>
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
                <label className="text-sm text-muted-foreground block mb-1">Motif interne (optionnel, jamais affiché sur le site)</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  placeholder="Note pour vous uniquement"
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
            <p className="text-muted-foreground text-center py-4">Aucune date bloquée</p>
          )}
        </div>
      </section>
    </div>
  );
}
