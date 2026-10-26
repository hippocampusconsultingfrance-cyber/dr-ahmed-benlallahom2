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

/**
 * Answer deadline: one month after receipt (GDPR art. 12.3), the same day of
 * the next month, or its last day when that month is shorter (31 January →
 * 28 or 29 February).
 */
export function gdprRequestDeadline(receivedAt: Date | string) {
  const received = new Date(receivedAt);
  const deadline = new Date(received);
  deadline.setDate(1);
  deadline.setMonth(deadline.getMonth() + 1);
  const lastDayOfMonth = new Date(deadline.getFullYear(), deadline.getMonth() + 1, 0).getDate();
  deadline.setDate(Math.min(received.getDate(), lastDayOfMonth));
  return deadline;
}

/** An open request whose deadline has passed. */
export function isGdprRequestOverdue(request: { status: string; createdAt: Date | string }, now = new Date()) {
  return isGdprRequestOpen(request.status) && gdprRequestDeadline(request.createdAt).getTime() < now.getTime();
}
