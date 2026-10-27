import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";

export default function TestimonialsTab() {
  const { data: testimonialsList, isLoading } = trpc.admin.testimonials.list.useQuery();
  const utils = trpc.useUtils();
  const updateStatus = trpc.admin.testimonials.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Témoignage mis à jour");
      utils.admin.testimonials.list.invalidate();
    },
  });
  const deleteTestimonial = trpc.admin.testimonials.delete.useMutation({
    onSuccess: () => {
      toast.success("Témoignage supprimé");
      utils.admin.testimonials.list.invalidate();
    },
  });

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    approved: "bg-green-500/20 text-green-400",
    rejected: "bg-red-500/20 text-red-400",
  };

  if (isLoading) {
    return <PublicContentSkeleton label="Chargement des témoignages administratifs" />;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{testimonialsList?.length || 0} témoignage(s)</p>
      <div className="space-y-3">
        {testimonialsList?.map((t) => (
          <div key={t.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                  <span className="font-semibold text-foreground">{t.authorName}</span>
                  <div className="flex">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-cyan-400 text-cyan-400" />
                    ))}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[t.status] || ""}`}>
                    {t.status}
                  </span>
                  {t.featured === 1 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400">Featured</span>}
                </div>
                <p className="break-words text-sm font-medium text-foreground">{t.title}</p>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.content}</p>
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
                  onClick={() => {
                    if (confirm("Supprimer ce témoignage ?")) {
                      deleteTestimonial.mutate({ id: t.id });
                    }
                  }}
                >
                  <Trash2 className="w-3 h-3" />
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
