import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { UserLanguage } from "@/contexts/userPreferences";
import { localeDay, todayInParis } from "@/lib/parisDay";
import { trpc } from "@/lib/trpc";
import { CERTIFICATION_RENEWAL_MAX_YEARS, certificationDateIsCurrent, certificationExpiryDate, latestCertificationRenewalDay, RECRUITMENT_FACT_ORIGIN_LABELS, RECRUITMENT_FACT_ORIGINS, type CertificationExpiryDate, type RecruitmentFact } from "@shared/recruitmentFactOrigins";
import { isCertificationRenewalRefusalReason } from "@shared/recruitmentMissionRefusalReasons";

type CertificationReviewProps = {
  applicationId: number;
  certifications: Array<RecruitmentFact & { expiresAt?: string | null }>;
  /**
   * French by default, like the Candidatures tab and the 360° sheet around
   * the panel; the mission screen, translated, passes the admin's language.
   */
  language?: UserLanguage;
};

/** What the admin entered to confirm a renewal: the new expiry date, or that the certificate has none. */
type RenewalDraft = { date: string; withoutExpiry: boolean };

/**
 * In the language of the screen showing the panel (IA-02): the expiry with
 * the preposition its precision takes (« le 30/06/2027 », « en mai 2023 »),
 * the toasts and the server's refusals, from their stable reason and the day
 * they name.
 */
const reviewCopy = {
  fr: {
    locale: "fr-FR",
    none: "Aucune certification déclarée ni lue dans le CV.",
    intro: "Une certification ne compte dans le matching des missions qu’une fois confirmée par l’admin, après vérification du justificatif, qu’elle soit déclarée par le candidat ou extraite du CV par l’IA.",
    origins: RECRUITMENT_FACT_ORIGIN_LABELS,
    expiry: (expired: boolean, expiry: CertificationExpiryDate) => `${expired ? "expirée" : "expire"} ${expiry.precision === "day" ? "le" : "en"} ${expiry.date}`,
    confirm: "Confirmer",
    confirmOf: (name: string) => `Confirmer ${name}`,
    withdraw: "Annuler la confirmation",
    withdrawOf: (name: string) => `Annuler la confirmation de ${name}`,
    expiredNotice: "Expirée, elle ne compte pas dans le matching. Si le justificatif vérifié a été renouvelé, confirmez le renouvellement avec sa nouvelle date d’expiration, ou cochez qu’il n’en porte pas.",
    newExpiry: "Nouvelle date d’expiration",
    newExpiryOf: (name: string) => `Nouvelle date d’expiration — ${name}`,
    withoutExpiry: "Sans date d’expiration",
    withoutExpiryOf: (name: string) => `Le justificatif de ${name} ne porte pas de date d’expiration`,
    renew: "Confirmer le renouvellement",
    renewOf: (name: string) => `Confirmer le renouvellement de ${name}`,
    renewed: (name: string, expiry: CertificationExpiryDate | null) => `Renouvellement confirmé : ${name}, ${expiry ? `expire le ${expiry.date}` : "sans date d’expiration"}`,
    confirmed: (name: string) => `Certification confirmée : ${name}`,
    withdrawn: (name: string) => `Confirmation retirée : ${name}`,
    withdrawnNotRetained: (name: string) => `Confirmation retirée : ${name}. La dernière analyse du CV ne la retient pas : elle n’est plus comptée comme extraite du CV.`,
    refusals: {
      renewal_date_invalid: () => "Nouvelle date d’expiration invalide.",
      renewal_date_past: () => "La nouvelle date d’expiration est déjà passée : la certification resterait expirée.",
      renewal_date_too_far: (day: string) => `La nouvelle date d’expiration est à plus de ${CERTIFICATION_RENEWAL_MAX_YEARS} ans : vérifiez-la sur le justificatif (le ${day} au plus tard).`,
      renewal_required: () => "Cette certification a expiré : confirmez son renouvellement, avec la nouvelle date d’expiration lue sur le justificatif, ou cochez qu’il n’en porte pas.",
    },
  },
  en: {
    locale: "en-GB",
    none: "No certification declared or read in the CV.",
    intro: "A certification only counts in the missions’ matching once confirmed by the admin, after checking the certificate, whether declared by the candidate or read from the CV by the AI.",
    origins: { declared: "declared by the candidate", extracted: "read from the CV by the AI", confirmed: "confirmed by the admin" },
    expiry: (expired: boolean, expiry: CertificationExpiryDate) => `${expired ? "expired" : "expires"} ${expiry.precision === "day" ? "on" : "in"} ${expiry.date}`,
    confirm: "Confirm",
    confirmOf: (name: string) => `Confirm ${name}`,
    withdraw: "Withdraw confirmation",
    withdrawOf: (name: string) => `Withdraw the confirmation of ${name}`,
    expiredNotice: "Expired, it does not count in the matching. If the certificate you checked has been renewed, confirm the renewal with its new expiry date, or tick that it has none.",
    newExpiry: "New expiry date",
    newExpiryOf: (name: string) => `New expiry date — ${name}`,
    withoutExpiry: "No expiry date",
    withoutExpiryOf: (name: string) => `The certificate of ${name} has no expiry date`,
    renew: "Confirm renewal",
    renewOf: (name: string) => `Confirm the renewal of ${name}`,
    renewed: (name: string, expiry: CertificationExpiryDate | null) => `Renewal confirmed: ${name}, ${expiry ? `expires on ${expiry.date}` : "no expiry date"}`,
    confirmed: (name: string) => `Certification confirmed: ${name}`,
    withdrawn: (name: string) => `Confirmation withdrawn: ${name}`,
    withdrawnNotRetained: (name: string) => `Confirmation withdrawn: ${name}. The latest analysis of the CV does not retain it: it no longer counts as read from the CV.`,
    refusals: {
      renewal_date_invalid: () => "Invalid new expiry date.",
      renewal_date_past: () => "The new expiry date has already passed: the certification would remain expired.",
      renewal_date_too_far: (day: string) => `The new expiry date is more than ${CERTIFICATION_RENEWAL_MAX_YEARS} years ahead: check it on the certificate (${day} at the latest).`,
      renewal_required: () => "This certification has expired: confirm its renewal, with the new expiry date read on the certificate, or tick that it has none.",
    },
  },
  de: {
    locale: "de-DE",
    none: "Kein Zertifikat angegeben oder im Lebenslauf gelesen.",
    intro: "Ein Zertifikat zählt im Matching der Missionen erst, wenn der Admin es nach Prüfung des Nachweises bestätigt hat, ob vom Kandidaten angegeben oder von der KI aus dem Lebenslauf gelesen.",
    origins: { declared: "vom Kandidaten angegeben", extracted: "von der KI aus dem Lebenslauf gelesen", confirmed: "vom Admin bestätigt" },
    expiry: (expired: boolean, expiry: CertificationExpiryDate) => expired ? `abgelaufen ${expiry.precision === "day" ? "am" : expiry.precision === "month" ? "im" : "im Jahr"} ${expiry.date}` : `gültig bis ${expiry.date}`,
    confirm: "Bestätigen",
    confirmOf: (name: string) => `${name} bestätigen`,
    withdraw: "Bestätigung zurücknehmen",
    withdrawOf: (name: string) => `Bestätigung von ${name} zurücknehmen`,
    expiredNotice: "Abgelaufen, zählt es nicht im Matching. Wurde der geprüfte Nachweis erneuert, bestätigen Sie die Erneuerung mit dem neuen Ablaufdatum oder kreuzen Sie an, dass er keines trägt.",
    newExpiry: "Neues Ablaufdatum",
    newExpiryOf: (name: string) => `Neues Ablaufdatum — ${name}`,
    withoutExpiry: "Ohne Ablaufdatum",
    withoutExpiryOf: (name: string) => `Der Nachweis für ${name} trägt kein Ablaufdatum`,
    renew: "Erneuerung bestätigen",
    renewOf: (name: string) => `Erneuerung von ${name} bestätigen`,
    renewed: (name: string, expiry: CertificationExpiryDate | null) => `Erneuerung bestätigt: ${name}, ${expiry ? `gültig bis ${expiry.date}` : "ohne Ablaufdatum"}`,
    confirmed: (name: string) => `Zertifikat bestätigt: ${name}`,
    withdrawn: (name: string) => `Bestätigung zurückgenommen: ${name}`,
    withdrawnNotRetained: (name: string) => `Bestätigung zurückgenommen: ${name}. Die letzte Analyse des Lebenslaufs übernimmt es nicht: Es gilt nicht mehr als aus dem Lebenslauf gelesen.`,
    refusals: {
      renewal_date_invalid: () => "Ungültiges neues Ablaufdatum.",
      renewal_date_past: () => "Das neue Ablaufdatum ist bereits vergangen: Das Zertifikat bliebe abgelaufen.",
      renewal_date_too_far: (day: string) => `Das neue Ablaufdatum liegt mehr als ${CERTIFICATION_RENEWAL_MAX_YEARS} Jahre in der Zukunft: Prüfen Sie es auf dem Nachweis (spätestens am ${day}).`,
      renewal_required: () => "Dieses Zertifikat ist abgelaufen: Bestätigen Sie seine Erneuerung mit dem neuen Ablaufdatum auf dem Nachweis oder kreuzen Sie an, dass er keines trägt.",
    },
  },
  zh: {
    locale: "zh-CN",
    none: "未申报证书，简历中也未读到证书。",
    intro: "无论是候选人申报的证书还是 AI 从简历中提取的证书，都须经管理员核实证明文件并确认后才计入任务匹配。",
    origins: { declared: "候选人自行申报", extracted: "AI 从简历中提取", confirmed: "管理员已确认" },
    expiry: (expired: boolean, expiry: CertificationExpiryDate) => expired ? `已于 ${expiry.date} 过期` : `有效期至 ${expiry.date}`,
    confirm: "确认",
    confirmOf: (name: string) => `确认 ${name}`,
    withdraw: "撤销确认",
    withdrawOf: (name: string) => `撤销对 ${name} 的确认`,
    expiredNotice: "已过期，不计入匹配。如经核实的证书已续期，请填写新的到期日期以确认续期，或勾选证书上没有到期日期。",
    newExpiry: "新的到期日期",
    newExpiryOf: (name: string) => `新的到期日期 — ${name}`,
    withoutExpiry: "无到期日期",
    withoutExpiryOf: (name: string) => `${name} 的证书上没有到期日期`,
    renew: "确认续期",
    renewOf: (name: string) => `确认 ${name} 的续期`,
    renewed: (name: string, expiry: CertificationExpiryDate | null) => `已确认续期：${name}，${expiry ? `有效期至 ${expiry.date}` : "无到期日期"}`,
    confirmed: (name: string) => `已确认证书：${name}`,
    withdrawn: (name: string) => `已撤销确认：${name}`,
    withdrawnNotRetained: (name: string) => `已撤销确认：${name}。最近一次简历分析未保留该证书：它不再被视为从简历中提取。`,
    refusals: {
      renewal_date_invalid: () => "新的到期日期无效。",
      renewal_date_past: () => "新的到期日期已过：该证书仍将处于过期状态。",
      renewal_date_too_far: (day: string) => `新的到期日期晚于 ${CERTIFICATION_RENEWAL_MAX_YEARS} 年之后：请在证书上核对（最晚为 ${day}）。`,
      renewal_required: () => "该证书已过期：请确认其续期，填写证书上的新到期日期，或勾选证书上没有到期日期。",
    },
  },
} as const;

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
 * An expired one earns none until the admin confirms its renewal, with the
 * new expiry date, or none when they tick that the certificate gives none:
 * unconfirmed, it offers only that renewal, as the server confirms it no
 * other way. Withdrawn, a certification the latest analysis of the CV no
 * longer retains loses its reading by the AI: the toast says so.
 */
export default function CertificationReview({ applicationId, certifications, language = "fr" }: CertificationReviewProps) {
  const copy = reviewCopy[language] ?? reviewCopy.fr;
  const utils = trpc.useUtils();
  const [renewalDrafts, setRenewalDrafts] = useState<Record<string, RenewalDraft>>({});
  const editRenewal = (name: string, change: Partial<RenewalDraft>) => setRenewalDrafts(current => ({ ...current, [name]: { ...(current[name] ?? { date: "", withoutExpiry: false }), ...change } }));
  const expiryOf = (expiresAt: string) => certificationExpiryDate(expiresAt, copy.locale);
  // Every screen showing the candidate's certifications reads them again.
  const refresh = () => {
    void utils.admin.recruitment.list.invalidate();
    void utils.admin.recruitment.candidate.detail.invalidate({ id: applicationId });
    void utils.admin.clientBriefs.candidates.invalidate();
  };
  const confirm = trpc.admin.recruitment.candidate.confirmCertification.useMutation({
    onSuccess: (result, variables) => {
      toast.success(variables.renewal
        ? copy.renewed(variables.name, variables.renewal.expiresAt ? expiryOf(variables.renewal.expiresAt) : null)
        : variables.confirmed ? copy.confirmed(variables.name)
          : "notRetainedByAnalysis" in result ? copy.withdrawnNotRetained(variables.name)
            : copy.withdrawn(variables.name));
      refresh();
    },
    // The server's stable reason, worded in the admin's language with the day
    // it names (the latest renewal date accepted); any other error as it came.
    // A refusal can come from a sheet older than the dossier (renewal_required:
    // an analysis read since that the certification has expired, while the
    // sheet still offers « Confirmer »): read again, it shows the renewal box
    // the toast asks for.
    onError: mutationError => {
      const reason = mutationError.data?.reason;
      const date = mutationError.data?.date;
      toast.error(isCertificationRenewalRefusalReason(reason) && (reason !== "renewal_date_too_far" || date) ? copy.refusals[reason](date ? localeDay(date, copy.locale) : "") : mutationError.message);
      refresh();
    },
  });

  if (!certifications.length) return <p className="text-sm text-muted-foreground">{copy.none}</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{copy.intro}</p>
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
                  <p className="font-medium text-foreground">{certification.name}{certification.expiresAt ? <span className={`font-normal ${expired ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}> · {copy.expiry(expired, expiryOf(certification.expiresAt))}</span> : null}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {RECRUITMENT_FACT_ORIGINS.filter(origin => certification.origins.includes(origin)).map(origin => <span key={origin} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${originTone(origin)}`}>{copy.origins[origin]}</span>)}
                  </p>
                </div>
                {(confirmed || !expired) && (
                  <Button size="sm" variant={confirmed ? "outline" : "default"} className="shrink-0" disabled={confirm.isPending} aria-label={confirmed ? copy.withdrawOf(certification.name) : copy.confirmOf(certification.name)} onClick={() => confirm.mutate({ id: applicationId, name: certification.name, confirmed: !confirmed })}>
                    {confirmed ? copy.withdraw : copy.confirm}
                  </Button>
                )}
              </div>
              {expired && (
                <div className="mt-3 flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 sm:flex-row sm:items-end sm:justify-between">
                  <p>{copy.expiredNotice}</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="space-y-1"><span className="block">{copy.newExpiry}</span><input type="date" aria-label={copy.newExpiryOf(certification.name)} value={draft?.date ?? ""} min={todayInParis()} max={latestCertificationRenewalDay(todayInParis())} disabled={draft?.withoutExpiry} onChange={event => editRenewal(certification.name, { date: event.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground disabled:opacity-50" /></label>
                    <label className="flex h-9 items-center gap-2"><input type="checkbox" aria-label={copy.withoutExpiryOf(certification.name)} checked={draft?.withoutExpiry ?? false} onChange={event => editRenewal(certification.name, { withoutExpiry: event.target.checked })} className="h-4 w-4 accent-primary" />{copy.withoutExpiry}</label>
                    <Button size="sm" disabled={confirm.isPending || !renewal} aria-label={copy.renewOf(certification.name)} onClick={() => { if (renewal) confirm.mutate({ id: applicationId, name: certification.name, confirmed: true, renewal }); }}>{copy.renew}</Button>
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
