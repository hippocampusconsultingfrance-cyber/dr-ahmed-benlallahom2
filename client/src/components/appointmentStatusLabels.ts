/** A booking's statuses as the administration writes them (booking card, a person's data), not their stored English values. */

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = { held: "Créneau réservé", confirmed: "Confirmé", cancelled: "Annulé", completed: "Terminé", no_show: "Absent" };

export const PAYMENT_STATUS_LABELS: Record<string, string> = { pending: "En attente", completed: "Payé", failed: "Échoué", refunded: "Remboursé" };
