import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { RECRUITMENT_FACT_ORIGIN_LABELS, RECRUITMENT_FACT_ORIGINS, type RecruitmentFact } from "@shared/recruitmentFactOrigins";

type CertificationReviewProps = {
  applicationId: number;
  certifications: Array<RecruitmentFact & { expiresAt?: string | null }>;
};

function originTone(origin: RecruitmentFact["origins"][number]) {
  if (origin === "confirmed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (origin === "extracted") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted/40 text-muted-foreground";
}

/**
 * A candidate's certifications with their origin, and « Confirmer » or
 * « Annuler la confirmation » for each (IA-02): only a certification an admin
 * confirmed earns points in a mission's matching, declared or read in the CV.
 */
export default function CertificationReview({ applicationId, certifications }: CertificationReviewProps) {
  const utils = trpc.useUtils();
  const confirm = trpc.admin.recruitment.candidate.confirmCertification.useMutation({
    onSuccess: (_result, variables) => {
      toast.success(variables.confirmed ? `Certification confirmée : ${variables.name}` : `Confirmation retirée : ${variables.name}`);
      void utils.admin.recruitment.list.invalidate();
      void utils.admin.recruitment.candidate.detail.invalidate({ id: applicationId });
      void utils.admin.clientBriefs.candidates.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  if (!certifications.length) return <p className="text-sm text-muted-foreground">Aucune certification déclarée ni lue dans le CV.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Une certification ne compte dans le matching des missions qu’une fois confirmée par l’admin, après vérification du justificatif, qu’elle soit déclarée par le candidat ou extraite du CV par l’IA.</p>
      <ul className="space-y-2">
        {certifications.map(certification => {
          const confirmed = certification.origins.includes("confirmed");
          return (
            <li key={certification.name} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{certification.name}{certification.expiresAt ? <span className="font-normal text-muted-foreground"> · expire le {certification.expiresAt}</span> : null}</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {RECRUITMENT_FACT_ORIGINS.filter(origin => certification.origins.includes(origin)).map(origin => <span key={origin} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${originTone(origin)}`}>{RECRUITMENT_FACT_ORIGIN_LABELS[origin]}</span>)}
                </p>
              </div>
              <Button size="sm" variant={confirmed ? "outline" : "default"} className="shrink-0" disabled={confirm.isPending} aria-label={`${confirmed ? "Annuler la confirmation de" : "Confirmer"} ${certification.name}`} onClick={() => confirm.mutate({ id: applicationId, name: certification.name, confirmed: !confirmed })}>
                {confirmed ? "Annuler la confirmation" : "Confirmer"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
