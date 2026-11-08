import { ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { AdminBadge, ADMIN_BADGE_TONES, type AdminBadgeTone } from "./AdminStatusBadge";
import { formatAdminDateTime } from "./adminDateFormat";
import { describeSecurityEventCounts, securityOperationsCopy } from "./securityOperationsCopy";

/** A11Y-12: the admin's badge tones, readable in the light theme too. */
const severityTone: Record<string, AdminBadgeTone> = { info: "info", warning: "warning", high: "alert", critical: "danger" };

export default function SecurityOperationsTab() {
  const { language } = useLanguage();
  const copy = securityOperationsCopy[language as keyof typeof securityOperationsCopy] ?? securityOperationsCopy.fr;
  const events = trpc.adminSecurity.events.useQuery({ limit: 75 }, { refetchInterval: 30_000 });

  if (events.isLoading) return <PublicContentSkeleton cards={2} columns={2} label={copy.loading} />;
  if (events.error) return <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-700 dark:text-red-200">{copy.loadError}.</div>;

  const rows = events.data ?? [];
  const highCount = rows.filter(event => event.severity === "high" || event.severity === "critical").length;

  return <section className="space-y-6">
    <div className="rounded-2xl border border-cyan-400/20 bg-card/70 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><ShieldAlert className="h-5 w-5" /></span>
          <div><h2 className="font-display text-xl font-bold">{copy.title}</h2><p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p></div>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-sm font-semibold ${ADMIN_BADGE_TONES[highCount ? "alert" : "success"]}`}>{highCount ? `${highCount} ${copy.highEvents}` : copy.noHighEvents}</div>
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-border bg-card/70">
      {rows.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground"><ShieldCheck className="h-8 w-8 text-emerald-300" /><p>{copy.noEvents}</p></div> : <div className="divide-y divide-border">
        {rows.map(event => {
          const counts = describeSecurityEventCounts(copy, event.counts);
          return <div key={event.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="font-medium text-foreground">{copy.categories[event.category as keyof typeof copy.categories] ?? event.category.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{copy.actors[event.actorKind as keyof typeof copy.actors] ?? event.actorKind} · {formatAdminDateTime(event.createdAt, language)}</p>{counts && <p className="mt-1 text-xs text-muted-foreground">{counts}</p>}</div></div>
            <div className="flex items-center gap-2"><span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{copy.outcomes[event.outcome as keyof typeof copy.outcomes] ?? event.outcome}</span><AdminBadge tone={severityTone[event.severity] ?? "neutral"} className="rounded-full py-1 font-semibold">{copy.severities[event.severity as keyof typeof copy.severities] ?? event.severity}</AdminBadge></div>
          </div>;
        })}
      </div>}
    </div>
  </section>;
}
