import { useState } from "react";
import { MonitorSmartphone, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { securityEventLabel, type SecurityEventLabelLanguage } from "@shared/securityEventLabels";
import { AdminBadge, ADMIN_BADGE_TONES, type AdminBadgeTone } from "./AdminStatusBadge";
import { formatAdminDateTime } from "./adminDateFormat";
import { describeSecurityEventCounts, securityOperationsCopy } from "./securityOperationsCopy";

/** A11Y-12: the admin's badge tones, readable in the light theme too. */
const severityTone: Record<string, AdminBadgeTone> = { info: "info", warning: "warning", high: "alert", critical: "danger" };

/** Events shown per page of the journal (ADM-15); one more is asked for, its presence saying an older page exists. */
export const SECURITY_LOG_PAGE_SIZE = 50;

type SecurityOperationsCopy = (typeof securityOperationsCopy)[keyof typeof securityOperationsCopy];

/** ADM-15: the journal's filters; successful candidate sign-ins, most of its events, are hidden until asked for. */
const FILTERS = ["adminOnly", "warningsAndAbove", "includeCandidateSignIns"] as const;
type SecurityLogFilters = Record<(typeof FILTERS)[number], boolean>;

const filterButtonClass = (pressed: boolean) => `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${pressed ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`;

/**
 * ADM-14: the devices signed in to the administrator's account (Clerk), and
 * « Révoquer toutes les autres sessions », which keeps this one.
 */
function AdminSessionsPanel({ copy, language }: { copy: SecurityOperationsCopy; language: SecurityEventLabelLanguage }) {
  const sessions = trpc.adminSecurity.sessions.useQuery();
  const [message, setMessage] = useState("");
  const revokeOthers = trpc.adminSecurity.revokeOtherSessions.useMutation({
    onSuccess: outcome => {
      const done = [
        ...(outcome.clerkUnavailable ? [] : [`${copy.revoked}${copy.countSeparator}${outcome.revoked}`]),
        `${copy.securityCodesRevoked}${copy.countSeparator}${outcome.securitySessions}`,
      ].join(" · ");
      const advice = outcome.clerkUnavailable ? copy.clerkUnavailable : outcome.notRevoked ? copy.notRevoked : "";
      setMessage(advice ? `${done}. ${advice}` : done);
      void sessions.refetch();
    },
    onError: () => setMessage(copy.revokeError),
  });
  // The button stays offered when Clerk lists no other device, or cannot be
  // read: it also cancels the security codes other devices still hold.
  const others = (sessions.data ?? []).filter(session => !session.current);

  return <section aria-labelledby="admin-sessions-title" className="rounded-2xl border border-border bg-card/70 p-5 sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><MonitorSmartphone className="h-5 w-5" aria-hidden="true" /></span>
        <div><h3 id="admin-sessions-title" className="font-display text-lg font-bold">{copy.sessionsTitle}</h3><p className="mt-1 text-sm text-muted-foreground">{copy.sessionsSubtitle}</p></div>
      </div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={() => { setMessage(""); revokeOthers.mutate(); }} disabled={revokeOthers.isPending}>{revokeOthers.isPending ? copy.revoking : copy.revokeOthers}</Button>
    </div>
    <div className="mt-4 space-y-2">
      {sessions.isLoading && <PublicContentSkeleton cards={1} label={copy.sessionsLoading} />}
      {sessions.error && <p className="text-sm text-red-700 dark:text-red-200">{copy.sessionsError}</p>}
      {sessions.data?.map(session => <div key={session.id} className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 wrap-anywhere">
          <p className="text-sm font-medium text-foreground">{[session.browser ?? copy.unknownDevice, session.device, session.location].filter(Boolean).join(" · ")}</p>
          <p className="text-xs text-muted-foreground">{copy.lastActive} {formatAdminDateTime(session.lastActiveAt, language)}</p>
        </div>
        {session.current && <AdminBadge tone="success" className="w-fit shrink-0 rounded-full py-1 font-semibold">{copy.currentSession}</AdminBadge>}
      </div>)}
      {sessions.data && others.length === 0 && <p className="text-sm text-muted-foreground">{copy.noOtherSession}</p>}
    </div>
    {/* Present from the first render (empty until needed) so that screen readers announce the outcome. */}
    <p role="status" className={message ? "mt-3 text-sm text-foreground" : "sr-only"}>{message}</p>
  </section>;
}

export default function SecurityOperationsTab() {
  const { language } = useLanguage();
  const labelLanguage = (language in securityOperationsCopy ? language : "fr") as SecurityEventLabelLanguage;
  const copy = securityOperationsCopy[labelLanguage];
  const [filters, setFilters] = useState<SecurityLogFilters>({ adminOnly: false, warningsAndAbove: false, includeCandidateSignIns: false });
  // The cursor of each page after the first (the last event of the page before it), newest first: the way back to the newer events.
  const [pageStarts, setPageStarts] = useState<number[]>([]);
  const beforeId = pageStarts.at(-1);
  const events = trpc.adminSecurity.events.useQuery({ limit: SECURITY_LOG_PAGE_SIZE + 1, ...filters, ...(beforeId ? { beforeId } : {}) }, { refetchInterval: 30_000 });
  // The header's count is the whole journal's, whatever the filters and the page below show.
  const recentHigh = trpc.adminSecurity.recentHighEvents.useQuery(undefined, { refetchInterval: 30_000 });
  const highCount = recentHigh.data?.count ?? 0;

  const rows = (events.data ?? []).slice(0, SECURITY_LOG_PAGE_SIZE);
  const hasOlder = (events.data?.length ?? 0) > SECURITY_LOG_PAGE_SIZE;
  // Hiding the successful candidate sign-ins, as by default, narrows the journal too: an empty page is not an empty journal.
  const filtered = filters.adminOnly || filters.warningsAndAbove || !filters.includeCandidateSignIns;
  const toggle = (key: (typeof FILTERS)[number]) => { setFilters(current => ({ ...current, [key]: !current[key] })); setPageStarts([]); };

  return <section className="space-y-6">
    <div className="rounded-2xl border border-cyan-400/20 bg-card/70 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><ShieldAlert className="h-5 w-5" /></span>
          <div><h2 className="font-display text-xl font-bold">{copy.title}</h2><p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p></div>
        </div>
        {recentHigh.data && <div className={`rounded-xl border px-3 py-2 text-sm font-semibold ${ADMIN_BADGE_TONES[highCount ? "alert" : "success"]}`}>{highCount ? `${highCount} ${copy.highEvents}` : copy.noHighEvents}</div>}
      </div>
    </div>
    <AdminSessionsPanel copy={copy} language={labelLanguage} />
    {/* The filters stay on screen (and keep the focus) while the journal loads. */}
    <div role="group" aria-label={copy.filters} className="flex flex-wrap gap-2">
      {FILTERS.map(key => <button key={key} type="button" aria-pressed={filters[key]} onClick={() => toggle(key)} className={filterButtonClass(filters[key])}>{copy[key]}</button>)}
    </div>
    {events.isLoading ? <PublicContentSkeleton cards={2} columns={2} label={copy.loading} /> : events.error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-700 dark:text-red-200">{copy.loadError}.</div> : <div className="overflow-hidden rounded-2xl border border-border bg-card/70">
      {rows.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground"><ShieldCheck className="h-8 w-8 text-emerald-300" /><p>{filtered || beforeId ? copy.noMatchingEvents : copy.noEvents}</p></div> : <div className="divide-y divide-border">
        {rows.map(event => {
          const counts = describeSecurityEventCounts(copy, event.counts);
          return <div key={event.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="font-medium text-foreground">{securityEventLabel(event.category, event.outcome, labelLanguage)}</p><p className="mt-1 text-xs text-muted-foreground">{copy.actors[event.actorKind as keyof typeof copy.actors] ?? event.actorKind} · {formatAdminDateTime(event.createdAt, language)}</p>{counts && <p className="mt-1 text-xs text-muted-foreground">{counts}</p>}</div></div>
            <div className="flex items-center gap-2"><span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{copy.outcomes[event.outcome as keyof typeof copy.outcomes] ?? event.outcome}</span><AdminBadge tone={severityTone[event.severity] ?? "neutral"} className="rounded-full py-1 font-semibold">{copy.severities[event.severity as keyof typeof copy.severities] ?? event.severity}</AdminBadge></div>
          </div>;
        })}
      </div>}
    </div>}
    {(beforeId || hasOlder) && <nav aria-label={copy.pagination} className="flex flex-wrap justify-between gap-2">
      <Button variant="outline" size="sm" disabled={!beforeId} onClick={() => setPageStarts(current => current.slice(0, -1))}>{copy.newerEvents}</Button>
      <Button variant="outline" size="sm" disabled={!hasOlder} onClick={() => setPageStarts(current => [...current, rows.at(-1)!.id])}>{copy.olderEvents}</Button>
    </nav>}
  </section>;
}
