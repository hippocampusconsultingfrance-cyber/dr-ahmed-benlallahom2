import { Button } from "@/components/ui/button";
import { ADMIN_PAGE_SIZE } from "./adminPagination";

/** End of an admin list (ADM-01): how many rows are shown, and « Charger plus » while some remain. */
export default function AdminLoadMore({ shown, total, loading, onLoadMore }: { shown: number; total: number; loading: boolean; onLoadMore: () => void }) {
  if (shown >= total) return null;
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <p className="text-sm text-muted-foreground">{shown} sur {total} affichés</p>
      <Button variant="outline" className="min-h-11 w-full sm:min-h-0 sm:w-auto" onClick={onLoadMore} disabled={loading}>
        {loading ? "Chargement…" : `Charger plus (${Math.min(ADMIN_PAGE_SIZE, total - shown)})`}
      </Button>
    </div>
  );
}
