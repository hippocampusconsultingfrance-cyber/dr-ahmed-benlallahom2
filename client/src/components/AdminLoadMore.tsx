import { Button } from "@/components/ui/button";
import { ADMIN_PAGE_SIZE } from "./adminPagination";

/**
 * End of an admin list (ADM-01): how many rows are shown, and « Charger plus »
 * while some remain; when a later page failed, its error and « Réessayer »,
 * the rows already shown staying on screen.
 */
export default function AdminLoadMore({ shown, total, loading, onLoadMore, error, onRetry }: { shown: number; total: number; loading: boolean; onLoadMore: () => void; error?: { message: string } | null; onRetry?: () => void }) {
  if (shown >= total) return null;
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <p className="text-sm text-muted-foreground">{shown} sur {total} affichés</p>
      {error && <p role="alert" className="text-sm text-destructive">La suite de la liste n’a pas pu être chargée : {error.message}</p>}
      {error && onRetry ? (
        <Button variant="outline" className="min-h-11 w-full sm:min-h-0 sm:w-auto" onClick={onRetry}>Réessayer</Button>
      ) : (
        <Button variant="outline" className="min-h-11 w-full sm:min-h-0 sm:w-auto" onClick={onLoadMore} disabled={loading}>
          {loading ? "Chargement…" : `Charger plus (${Math.min(ADMIN_PAGE_SIZE, total - shown)})`}
        </Button>
      )}
    </div>
  );
}
