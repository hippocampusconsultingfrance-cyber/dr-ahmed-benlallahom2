const ADMIN_AMOUNT_FORMAT = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/**
 * An amount in euros as the dashboard shows it, written as in the patient
 * emails and the owner alerts: « 100,00 € », « 1 250,50 € ». Accepts the
 * decimal text the database returns (« 100.00 »).
 */
export function formatAdminAmount(amount: string | number | null | undefined): string {
  return ADMIN_AMOUNT_FORMAT.format(Number(amount ?? 0) || 0);
}
