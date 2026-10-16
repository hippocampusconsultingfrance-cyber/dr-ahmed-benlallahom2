/**
 * Booking rules shared by the booking page and the API. Change a value here to
 * change it everywhere (client checks, server checks, emails).
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Minimum time between the booking and the start of the consultation. */
export const BOOKING_MIN_LEAD_TIME_HOURS = 2;
export const BOOKING_MIN_LEAD_TIME_MS = BOOKING_MIN_LEAD_TIME_HOURS * HOUR_MS;

/** How far ahead a consultation can be booked. */
export const BOOKING_HORIZON_DAYS = 90;
export const BOOKING_HORIZON_MS = BOOKING_HORIZON_DAYS * DAY_MS;

/**
 * Free-text "Objet de la demande" (health-data minimisation): a short subject,
 * never copied into any email (patient, owner, reminder, invoice); the admin
 * reads it in the dashboard only.
 */
export const BOOKING_REQUEST_SUBJECT_MAX_LENGTH = 500;

export type BookingWindowIssue = "too_soon" | "too_far";

/** Why a consultation start cannot be booked at `now` (past dates are "too_soon"), or null. */
export function getBookingWindowIssue(appointmentStart: Date, now: number = Date.now()): BookingWindowIssue | null {
  const start = appointmentStart.getTime();
  if (!Number.isFinite(start) || start < now + BOOKING_MIN_LEAD_TIME_MS) return "too_soon";
  if (start > now + BOOKING_HORIZON_MS) return "too_far";
  return null;
}

export const BOOKING_TOO_SOON_MESSAGE = `Ce créneau n’est plus réservable : les consultations se réservent au moins ${BOOKING_MIN_LEAD_TIME_HOURS} heures à l’avance. Veuillez choisir un créneau plus tardif.`;
export const BOOKING_TOO_FAR_MESSAGE = `Les consultations se réservent au plus ${BOOKING_HORIZON_DAYS} jours à l’avance. Veuillez choisir une date plus proche.`;
export const BOOKING_INVALID_PHONE_MESSAGE = "Saisissez un numéro de téléphone valide (8 à 15 chiffres, indicatif international accepté, ex. +33 6 12 34 56 78).";

/**
 * Plausible international phone number: optional leading "+", digits with
 * spaces, dots, dashes or parentheses as separators, 8 to 15 digits (E.164).
 */
export function isPlausiblePhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\+?[0-9][0-9 ().-]*[0-9]$/.test(trimmed) && !/^\+?\([0-9][0-9 ().-]*[0-9]$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}
