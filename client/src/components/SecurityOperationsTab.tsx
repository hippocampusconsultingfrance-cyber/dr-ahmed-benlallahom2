import { ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";

const severityStyle = {
  info: "border-cyan-400/20 bg-cyan-400/5 text-cyan-200",
  warning: "border-amber-400/20 bg-amber-400/5 text-amber-200",
  high: "border-orange-400/20 bg-orange-400/5 text-orange-200",
  critical: "border-red-400/20 bg-red-400/5 text-red-200",
} as const;

export default function SecurityOperationsTab() {
  const events = trpc.adminSecurity.events.useQuery({ limit: 75 }, { refetchInterval: 30_000 });

  if (events.isLoading) return <div className="h-48 animate-pulse rounded-2xl border border-border bg-card/60" />;
  if (events.error) return <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-200">Impossible de charger le journal de sécurité : {events.error.message}</div>;

  const rows = events.data ?? [];
  const highCount = rows.filter(event => event.severity === "high" || event.severity === "critical").length;

  return <section className="space-y-6">
    <div className="rounded-2xl border border-cyan-400/20 bg-card/70 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><ShieldAlert className="h-5 w-5" /></span>
          <div><h2 className="font-display text-xl font-bold">Observabilité de sécurité</h2><p className="mt-1 text-sm text-muted-foreground">Journal pseudonymisé des accès, blocages et actions sensibles. Actualisation toutes les 30 secondes.</p></div>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-sm font-semibold ${highCount ? "border-orange-400/30 bg-orange-400/10 text-orange-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>{highCount ? `${highCount} événement(s) à examiner` : "Aucun événement élevé récent"}</div>
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-border bg-card/70">
      {rows.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground"><ShieldCheck className="h-8 w-8 text-emerald-300" /><p>Aucun événement de sécurité n’est encore enregistré.</p></div> : <div className="divide-y divide-border">
        {rows.map(event => <div key={event.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="font-medium text-foreground">{event.category.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{event.actorKind} · {new Date(event.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</p></div></div>
          <div className="flex items-center gap-2"><span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{event.outcome}</span><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityStyle[event.severity]}`}>{event.severity}</span></div>
        </div>)}
      </div>}
    </div>
  </section>;
}
