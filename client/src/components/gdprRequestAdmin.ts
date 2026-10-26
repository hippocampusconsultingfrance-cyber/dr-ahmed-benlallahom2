/** GDPR requests in the administration (RGPD-12): French labels and the one-month answer deadline. */

export const GDPR_REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "À traiter",
  in_progress: "En cours",
  completed: "Traitée",
  rejected: "Refusée",
};

export const GDPR_REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Accès",
  rectification: "Rectification",
  deletion: "Suppression",
  portability: "Portabilité",
  objection: "Opposition",
};

export function isGdprRequestOpen(status: string) {
  return status === "pending" || status === "in_progress";
}

/** Requests are dated on the controller's clock, whatever the administrator's browser. */
export const GDPR_REQUEST_TIME_ZONE = "Europe/Paris";

const parisClockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: GDPR_REQUEST_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

/** Year, month (1-12), day, hour… of an instant on the Paris clock. */
function parisClock(date: Date) {
  const parts = Object.fromEntries(parisClockFormat.formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  return parts as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Instant at which a Paris calendar day starts; month and day may overflow, as with Date.UTC. */
function parisMidnight(year: number, month: number, day: number) {
  const wallClock = Date.UTC(year, month - 1, day);
  let instant = wallClock;
  // Paris is one or two hours ahead of UTC, and no clock change skips midnight.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const clock = parisClock(new Date(instant));
    const shown = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
    if (shown === wallClock) break;
    instant -= shown - wallClock;
  }
  return new Date(instant);
}

/**
 * Answer deadline: one month after receipt (GDPR art. 12.3), counted as
 * regulation 1182/71 does: the period ends with the last hour of the same
 * day of the next month, or of its last day when that month is shorter
 * (31 January → 28 or 29 February). Days are those of Paris. Returns the
 * last millisecond of that day.
 */
export function gdprRequestDeadline(receivedAt: Date | string) {
  const received = parisClock(new Date(receivedAt));
  const lastDayOfNextMonth = new Date(Date.UTC(received.year, received.month + 1, 0)).getUTCDate();
  const deadlineDay = Math.min(received.day, lastDayOfNextMonth);
  return new Date(parisMidnight(received.year, received.month + 1, deadlineDay + 1).getTime() - 1);
}

/** An open request whose deadline day has ended in Paris. */
export function isGdprRequestOverdue(request: { status: string; createdAt: Date | string }, now = new Date()) {
  return isGdprRequestOpen(request.status) && gdprRequestDeadline(request.createdAt).getTime() < now.getTime();
}

/** "26/11/2026": a request's day (receipt, deadline, answer) in Paris. */
export function formatGdprRequestDate(date: Date | string) {
  return new Date(date).toLocaleDateString("fr-FR", { timeZone: GDPR_REQUEST_TIME_ZONE });
}

/** "26/10/2026 08:56:37": its receipt time in Paris. */
export function formatGdprRequestDateTime(date: Date | string) {
  return new Date(date).toLocaleString("fr-FR", { timeZone: GDPR_REQUEST_TIME_ZONE });
}
