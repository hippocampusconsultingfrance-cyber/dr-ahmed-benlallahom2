import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { AdminErrorState } from "@/components/AdminStatePanel";
import AdminClampedText from "@/components/AdminClampedText";
import AdminStatusBadge from "@/components/AdminStatusBadge";

export default function TestimonialsTab() {
  const { data: testimonialsList, isLoading, error, refetch, isFetching } = trpc.admin.testimonials.list.useQuery();
  const utils = trpc.useUtils();
  const updateStatus = trpc.admin.testimonials.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Témoignage mis à jour");
      utils.admin.testimonials.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const deleteTestimonial = trpc.admin.testimonials.delete.useMutation({
    onSuccess: () => {
      toast.success("Témoignage supprimé");
      utils.admin.testimonials.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  if (isLoading) {
    return <PublicContentSkeleton label="Chargement des témoignages administratifs" />;
  }

  // ADM-10: a list that could not be loaded is not shown as « Aucun témoignage ».
  if (error) {
    return <AdminErrorState description={error.message} onRetry={() => void refetch()} retrying={isFetching} />;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{testimonialsList?.length || 0} témoignage(s)</p>
      <div className="space-y-3">
        {testimonialsList?.map((t) => (
          <div key={t.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              {/* EXPL-02: what the author typed wraps inside the card, and « Voir tout » shows the whole testimonial before it is approved. */}
              <div className="flex-1 min-w-0 wrap-anywhere">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                  <span className="font-semibold text-foreground">{t.authorName}</span>
                  <div className="flex">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-cyan-400 text-cyan-400" />
                    ))}
                  </div>
                  <AdminStatusBadge kind="testimonial" status={t.status} />
                  {t.featured === 1 && <AdminStatusBadge kind="testimonial" status="featured" />}
                </div>
                <p className="break-words text-sm font-medium text-foreground">{t.title}</p>
                <AdminClampedText text={t.content} about={`témoignage de ${t.authorName}`} className="text-sm text-muted-foreground mt-1" />
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
                {t.status !== "approved" && (
                  <Button size="sm" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => updateStatus.mutate({ id: t.id, status: "approved" })}>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Approuver
                  </Button>
                )}
                {t.status !== "rejected" && (
                  <Button size="sm" variant="outline" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={() => updateStatus.mutate({ id: t.id, status: "rejected" })}>
                    <XCircle className="w-3 h-3 mr-1" />
                    Rejeter
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-10 flex-1 sm:min-h-0 sm:flex-none"
                  onClick={() => updateStatus.mutate({ id: t.id, status: t.status, featured: t.featured === 1 ? 0 : 1 })}
                >
                  {t.featured === 1 ? "Retirer" : "Mettre en avant"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="min-h-10 flex-1 sm:min-h-0 sm:flex-none"
                  // A11Y-12: the icon alone names nothing.
                  aria-label={`Supprimer le témoignage de ${t.authorName}`}
                  onClick={() => {
                    if (confirm("Supprimer ce témoignage ?")) {
                      deleteTestimonial.mutate({ id: t.id });
                    }
                  }}
                >
                  <Trash2 className="w-3 h-3" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {(!testimonialsList || testimonialsList.length === 0) && (
          <p className="text-center text-muted-foreground py-8">Aucun témoignage</p>
        )}
      </div>
    </div>
  );
}
