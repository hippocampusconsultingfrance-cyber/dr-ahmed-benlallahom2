/**
 * Booking rules shared by the booking page and the API. Change a value here to
 * change it everywhere (client checks, server checks, emails).
 */

/**
 * Free-text "Objet de la demande" (health-data minimisation): a short subject,
 * never copied into any email (patient, owner, reminder, invoice); the admin
 * reads it in the dashboard only.
 */
export const BOOKING_REQUEST_SUBJECT_MAX_LENGTH = 500;
