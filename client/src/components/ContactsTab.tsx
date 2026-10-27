import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminEmptyState, AdminErrorState } from "@/components/AdminStatePanel";
import AdminLoadMore from "@/components/AdminLoadMore";
import AdminSearchField from "@/components/AdminSearchField";
import { adminListCount, adminPageOffsets, ADMIN_PAGE_SIZE, mergeAdminPages, useAdminPageCount } from "@/components/adminPagination";
import { adminSearchStatus, useAdminSearch } from "@/components/adminSearch";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";

export default function ContactsTab() {
  const utils = trpc.useUtils();
  const [unreadOnly, setUnreadOnly] = useState(false);
  // ADM-02: sender name, email or message reference, searched by the server.
  const { text: searchText, search, setText: setSearchText, clear: clearSearch } = useAdminSearch();
  const { pageCount, loadMore } = useAdminPageCount(JSON.stringify({ unreadOnly, search }));
  const pages = trpc.useQueries(t => adminPageOffsets(pageCount).map(offset => t.admin.contacts.list({ unreadOnly, search, limit: ADMIN_PAGE_SIZE, offset })));
  const { items, total, isLoading, isLoadingMore, error, loadMoreError, retryLoadMore } = mergeAdminPages(pages);
  const markRead = trpc.admin.contacts.markRead.useMutation({
    onSuccess: () => {
      toast.success("Marqué comme lu");
      utils.admin.contacts.list.invalidate();
    },
  });
  // RGPD-12: erasure request or withdrawn consent; the trace names no one.
  const deleteMessage = trpc.admin.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success("Message supprimé");
      utils.admin.contacts.list.invalidate();
      utils.admin.stats.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  // Filters and search stay on screen (and keep the focus) while the list loads or fails.
  const toolbar = (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex gap-2 flex-wrap">
        {[false, true].map((unread) => (
          <button
            key={String(unread)}
            type="button"
            onClick={() => setUnreadOnly(unread)}
            aria-pressed={unreadOnly === unread}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              unreadOnly === unread ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {unread ? "Non lus" : "Tous"}
          </button>
        ))}
      </div>
      <AdminSearchField id="contacts-search" label="Rechercher un message" placeholder="Nom, email ou référence" value={searchText} onChange={setSearchText} onClear={clearSearch} status={adminSearchStatus(search, { isLoading, error, shown: items.length, total }, unreadOnly ? "message(s) non lu(s)" : "message(s)")} className="w-full md:max-w-sm" />
    </div>
  );

  if (error) {
    return <div>{toolbar}<AdminErrorState description={error.message} /></div>;
  }

  if (isLoading) {
    return <div>{toolbar}<PublicContentSkeleton label="Chargement des messages" /></div>;
  }

  return (
    <div>
      {toolbar}
      <p className="text-sm text-muted-foreground mb-4 break-words [overflow-wrap:anywhere]">{adminListCount(items.length, total, unreadOnly ? "message(s) non lu(s)" : "message(s)")}{search ? ` pour « ${search} »` : ""}</p>
      <div className="space-y-3">
        {items.map((msg) => (
          <div key={msg.id} className={`bg-card border rounded-lg p-4 ${msg.read === 0 ? "border-primary/50" : "border-border"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                  <span className="font-semibold text-foreground">{msg.name}</span>
                  {msg.read === 0 && <span className="w-2 h-2 rounded-full bg-primary" />}
                  <span className="text-xs text-muted-foreground font-mono">{msg.trackingId}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground mb-2">
                  <span className="break-all">{msg.email}</span>
                  {msg.phone && <span>{msg.phone}</span>}
                  <span>{new Date(msg.createdAt).toLocaleString("fr-FR")}</span>
                </div>
                <p className="text-sm text-foreground">{msg.message}</p>
              </div>
              <div className="flex flex-wrap gap-2 self-start">
                {msg.read === 0 && (
                  <Button size="sm" variant="outline" className="min-h-10 sm:min-h-0" onClick={() => markRead.mutate({ id: msg.id })}>
                    <Eye className="w-3 h-3 mr-1" />
                    Lu
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-10 text-destructive hover:text-destructive sm:min-h-0"
                  disabled={deleteMessage.isPending}
                  onClick={() => {
                    if (window.confirm(`Supprimer définitivement le message ${msg.trackingId} de ${msg.name} ? Action irréversible.`)) deleteMessage.mutate({ id: msg.id });
                  }}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Supprimer
                </Button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          search
            ? <AdminEmptyState icon={MessageSquare} title="Aucun résultat" description={`Aucun message ne correspond à « ${search} »${unreadOnly ? " parmi les non lus" : ""}.`} />
            : unreadOnly
            ? <AdminEmptyState icon={MessageSquare} title="Aucun message non lu" description="Tous les messages reçus ont été lus." />
            : <AdminEmptyState icon={MessageSquare} title="Aucun message" description="Les demandes de contact reçues sur le site seront affichées dans cette section." />
        )}
      </div>
      <AdminLoadMore shown={items.length} total={total} loading={isLoadingMore} onLoadMore={loadMore} error={loadMoreError} onRetry={retryLoadMore} />
    </div>
  );
}
