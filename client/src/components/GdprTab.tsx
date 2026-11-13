import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Shield, Eye, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { AdminEmptyState, AdminErrorState } from "@/components/AdminStatePanel";
import AdminLoadMore from "@/components/AdminLoadMore";
import PersonalDataSearchPanel, { personalDataSearchKey, requestPersonalDataSearch } from "@/components/PersonalDataSearchPanel";
import AdminStatusBadge from "@/components/AdminStatusBadge";
import { formatAdminDateTime } from "@/components/adminDateFormat";
import { formatGdprRequestDate, GDPR_REQUEST_TYPE_LABELS, gdprRequestDeadline, isGdprRequestOpen, isGdprRequestOverdue } from "@/components/gdprRequestAdmin";
import { adminListCount, adminPageOffsets, ADMIN_PAGE_SIZE, mergeAdminPages, useAdminPageCount } from "@/components/adminPagination";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";

/**
 * `reference`: the request the dashboard's address names (ADM-09,
 * /admin?tab=gdpr&ref=G…), set apart, brought on screen and focused once the
 * list shows it.
 */
export default function GdprTab({ reference = "" }: { reference?: string } = {}) {
  const utils = trpc.useUtils();
  const { pageCount, loadMore } = useAdminPageCount("all");
  const pages = trpc.useQueries(t => adminPageOffsets(pageCount).map(offset => t.admin.gdprRequests.list({ limit: ADMIN_PAGE_SIZE, offset })));
  const { items, total, isLoading, isLoadingMore, error, loadMoreError, retryLoadMore, retry, retrying } = mergeAdminPages(pages);
  const linkedRequestRef = useRef<HTMLDivElement | null>(null);
  const linkedRequestShown = Boolean(reference) && items.some(req => req.trackingId === reference);
  useEffect(() => {
    if (!linkedRequestShown || !linkedRequestRef.current) return;
    linkedRequestRef.current.scrollIntoView({ block: "center" });
    linkedRequestRef.current.focus({ preventScroll: true });
  }, [linkedRequestShown]);
  // Note or reason being typed, per request (RGPD-12); the saved note otherwise.
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [personalDataSearch, setPersonalDataSearch] = useState({ email: "", nonce: 0 });
  // The last « Ses données » brought on screen: the panel mounted again after an error state does not move the page.
  const [revealedNonce, setRevealedNonce] = useState(0);
  const updateStatus = trpc.admin.gdprRequests.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Demande mise à jour");
      utils.admin.gdprRequests.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (error) {
    return <AdminErrorState description={error.message} onRetry={retry} retrying={retrying} />;
  }

  if (isLoading) {
    return <PublicContentSkeleton label="Chargement des demandes RGPD" />;
  }

  const now = new Date();

  return (
    <div className="space-y-8">
      {/* « Ses données » mounts the panel again on the request's address, which brings it on screen once and focuses its title. */}
      <PersonalDataSearchPanel key={personalDataSearchKey(personalDataSearch)} requestedEmail={personalDataSearch.email} reveal={personalDataSearch.nonce > revealedNonce} onRevealed={() => setRevealedNonce(personalDataSearch.nonce)} />
      <div>
        <p className="text-sm text-muted-foreground mb-4">{adminListCount(items.length, total, "demande(s) RGPD")} · réponse due un mois après réception, au plus tard à la fin du jour d’échéance (heure de Paris)</p>
        <div className="space-y-3">
          {items.map((req) => {
            const note = notes[req.id] ?? req.notes ?? "";
            const reason = note.trim();
            const open = isGdprRequestOpen(req.status);
            const overdue = isGdprRequestOverdue(req, now);
            const update = (status: "in_progress" | "completed" | "rejected") => updateStatus.mutate({ id: req.id, status, notes: reason || undefined });
            const linked = Boolean(reference) && req.trackingId === reference;
            return (
              <div
                key={req.id}
                ref={linked ? linkedRequestRef : undefined}
                tabIndex={linked ? -1 : undefined}
                aria-current={linked ? "true" : undefined}
                className={`bg-card border rounded-lg p-4 ${linked ? "border-primary ring-2 ring-primary/40 focus:outline-none" : "border-border"}`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* EXPL-02: what the person typed (name, description, with its line breaks) and the note wrap inside the card. */}
                  <div className="flex-1 min-w-0 wrap-anywhere">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                      <span className="font-semibold text-foreground">{req.name}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-200">
                        {GDPR_REQUEST_TYPE_LABELS[req.requestType] || req.requestType}
                      </span>
                      <AdminStatusBadge kind="gdprRequest" status={req.status} />
                      <span className="text-xs text-muted-foreground font-mono">{req.trackingId}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="break-all">{req.email}</span>
                      <span>Reçue le {formatAdminDateTime(req.createdAt)}</span>
                      {open ? (
                        <span className={overdue ? "font-semibold text-red-700 dark:text-red-400" : undefined}>
                          {overdue ? "Échéance dépassée : " : "Échéance : "}{formatGdprRequestDate(gdprRequestDeadline(req.createdAt))}
                        </span>
                      ) : req.responseDate ? (
                        <span>Répondue le {formatGdprRequestDate(req.responseDate)}</span>
                      ) : null}
                      {/* RGPD-13: the link sent with the acknowledgement proves that the person holds the address. */}
                      {req.emailConfirmedAt ? (
                        <span className="text-emerald-700 dark:text-emerald-400">Adresse confirmée le {formatAdminDateTime(req.emailConfirmedAt)}</span>
                      ) : open ? (
                        <span>Adresse non confirmée par le lien de l’accusé de réception</span>
                      ) : null}
                    </div>
                    {req.description && (
                      <p className="whitespace-pre-line text-sm text-foreground mt-2">{req.description}</p>
                    )}
                    {open ? (
                      <label className="mt-3 block text-sm font-medium text-foreground" htmlFor={`gdpr-request-note-${req.id}`}>
                        Note interne et motif d’un refus
                        <textarea
                          id={`gdpr-request-note-${req.id}`}
                          value={note}
                          onChange={event => setNotes(current => ({ ...current, [req.id]: event.target.value }))}
                          rows={2}
                          maxLength={5000}
                          className="form-control mt-1 block w-full"
                          placeholder="Ex. identité vérifiée le…, export envoyé le…, ou motif du refus à communiquer à la personne."
                        />
                      </label>
                    ) : req.notes ? (
                      <p className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">{req.status === "rejected" ? "Motif du refus : " : "Note : "}</span>{req.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
                    <Button size="sm" variant="outline" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => setPersonalDataSearch(current => requestPersonalDataSearch(current, req.email))}>
                      <Eye className="w-3 h-3 mr-1" />
                      Ses données
                    </Button>
                    {req.status === "pending" && (
                      <Button size="sm" variant="outline" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => update("in_progress")}>
                        <Clock className="w-3 h-3 mr-1" />
                        En cours
                      </Button>
                    )}
                    {open && (
                      <Button size="sm" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => update("completed")}>
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Traité
                      </Button>
                    )}
                    {open && (
                      <Button size="sm" variant="outline" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" disabled={!reason} title={reason ? undefined : "Saisissez d’abord le motif du refus dans la note."} onClick={() => {
                        if (window.confirm(`Refuser la demande ${req.trackingId} ? Le motif saisi est enregistré avec la demande : communiquez-le à la personne dans votre réponse.`)) update("rejected");
                      }}>
                        <XCircle className="w-3 h-3 mr-1" />
                        Refuser
                      </Button>
                    )}
                    {open && (
                      <Button size="sm" variant="ghost" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" disabled={reason === (req.notes ?? "")} onClick={() => updateStatus.mutate({ id: req.id, status: req.status, notes: reason })}>
                        Enregistrer la note
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <AdminEmptyState icon={Shield} title="Aucune demande RGPD" description="Les demandes d’accès, rectification ou suppression apparaîtront ici." />
          )}
        </div>
        <AdminLoadMore shown={items.length} total={total} loading={isLoadingMore} onLoadMore={loadMore} error={loadMoreError} onRetry={retryLoadMore} />
      </div>
    </div>
  );
}
