import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { todayInParis } from "@/lib/parisDay";
import { trpc } from "@/lib/trpc";
import { certificationDateIsCurrent, certificationExpiryInFrench, latestCertificationRenewalDay, RECRUITMENT_FACT_ORIGIN_LABELS, RECRUITMENT_FACT_ORIGINS, type RecruitmentFact } from "@shared/recruitmentFactOrigins";

type CertificationReviewProps = {
  applicationId: number;
  certifications: Array<RecruitmentFact & { expiresAt?: string | null }>;
};

/** What the admin entered to confirm a renewal: the new expiry date, or that the certificate has none. */
type RenewalDraft = { date: string; withoutExpiry: boolean };

/**
 * The renewal to confirm: a complete date (the field reads "" while one is
 * being typed or was partly erased), or the explicit choice of none. Nothing
 * otherwise, so that an unfinished date never renews without an expiry.
 */
function renewalOf(draft: RenewalDraft | undefined) {
  if (draft?.withoutExpiry) return { expiresAt: null };
  return draft && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? { expiresAt: draft.date } : null;
}

function originTone(origin: RecruitmentFact["origins"][number]) {
  if (origin === "confirmed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (origin === "extracted") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted/40 text-muted-foreground";
}

/**
 * A candidate's certifications with their origin, and « Confirmer » or
 * « Annuler la confirmation » for each (IA-02): only a certification an admin
 * confirmed earns points in a mission's matching, declared or read in the CV.
 * An expired one earns none, confirmed or not, until the admin confirms its
 * renewal, with the new expiry date, or none when they tick that the
 * certificate gives none. Withdrawn, a certification the latest analysis of
 * the CV no longer retains loses its reading by the AI: the toast says so.
 */
export default function CertificationReview({ applicationId, certifications }: CertificationReviewProps) {
  const utils = trpc.useUtils();
  const [renewalDrafts, setRenewalDrafts] = useState<Record<string, RenewalDraft>>({});
  const editRenewal = (name: string, change: Partial<RenewalDraft>) => setRenewalDrafts(current => ({ ...current, [name]: { ...(current[name] ?? { date: "", withoutExpiry: false }), ...change } }));
  const confirm = trpc.admin.recruitment.candidate.confirmCertification.useMutation({
    onSuccess: (result, variables) => {
      toast.success(variables.renewal
        ? `Renouvellement confirmé : ${variables.name}, ${variables.renewal.expiresAt ? `expire ${certificationExpiryInFrench(variables.renewal.expiresAt)}` : "sans date d’expiration"}`
        : variables.confirmed ? `Certification confirmée : ${variables.name}`
          : "notRetainedByAnalysis" in result ? `Confirmation retirée : ${variables.name}. La dernière analyse du CV ne la retient pas : elle n’est plus comptée comme extraite du CV.`
            : `Confirmation retirée : ${variables.name}`);
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
          const expired = !certificationDateIsCurrent(certification.expiresAt);
          const draft = renewalDrafts[certification.name];
          const renewal = renewalOf(draft);
          return (
            <li key={certification.name} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{certification.name}{certification.expiresAt ? <span className={`font-normal ${expired ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}> · {expired ? "expirée" : "expire"} {certificationExpiryInFrench(certification.expiresAt)}</span> : null}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {RECRUITMENT_FACT_ORIGINS.filter(origin => certification.origins.includes(origin)).map(origin => <span key={origin} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${originTone(origin)}`}>{RECRUITMENT_FACT_ORIGIN_LABELS[origin]}</span>)}
                  </p>
                </div>
                <Button size="sm" variant={confirmed ? "outline" : "default"} className="shrink-0" disabled={confirm.isPending} aria-label={`${confirmed ? "Annuler la confirmation de" : "Confirmer"} ${certification.name}`} onClick={() => confirm.mutate({ id: applicationId, name: certification.name, confirmed: !confirmed })}>
                  {confirmed ? "Annuler la confirmation" : "Confirmer"}
                </Button>
              </div>
              {expired && (
                <div className="mt-3 flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 sm:flex-row sm:items-end sm:justify-between">
                  <p>Expirée, elle ne compte pas dans le matching. Si le justificatif vérifié a été renouvelé, confirmez le renouvellement avec sa nouvelle date d’expiration, ou cochez qu’il n’en porte pas.</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="space-y-1"><span className="block">Nouvelle date d’expiration</span><input type="date" aria-label={`Nouvelle date d’expiration — ${certification.name}`} value={draft?.date ?? ""} min={todayInParis()} max={latestCertificationRenewalDay(todayInParis())} disabled={draft?.withoutExpiry} onChange={event => editRenewal(certification.name, { date: event.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground disabled:opacity-50" /></label>
                    <label className="flex h-9 items-center gap-2"><input type="checkbox" aria-label={`Le justificatif de ${certification.name} ne porte pas de date d’expiration`} checked={draft?.withoutExpiry ?? false} onChange={event => editRenewal(certification.name, { withoutExpiry: event.target.checked })} className="h-4 w-4 accent-primary" />Sans date d’expiration</label>
                    <Button size="sm" disabled={confirm.isPending || !renewal} aria-label={`Confirmer le renouvellement de ${certification.name}`} onClick={() => { if (renewal) confirm.mutate({ id: applicationId, name: certification.name, confirmed: true, renewal }); }}>Confirmer le renouvellement</Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
