/**
 * Booking rules shared by the booking page and the API. Change a value here to
 * change it everywhere (client checks, server checks, emails).
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Minimum time between the booking and the start of the consultation. */
export const BOOKING_MIN_LEAD_TIME_HOURS = 2;
export const BOOKING_MIN_LEAD_TIME_MS = BOOKING_MIN_LEAD_TIME_HOURS * HOUR_MS;

/** A patient who cancels obtains a full refund up to this many hours before the consultation. */
export const BOOKING_PATIENT_REFUND_DEADLINE_HOURS = 24;

/** How far ahead a consultation can be booked. */
export const BOOKING_HORIZON_DAYS = 90;
export const BOOKING_HORIZON_MS = BOOKING_HORIZON_DAYS * DAY_MS;

/**
 * Free-text "Objet de la demande" (health-data minimisation): a short subject,
 * never copied into any email (patient, owner, reminder, invoice); the admin
 * reads it in the dashboard only.
 */
export const BOOKING_REQUEST_SUBJECT_MAX_LENGTH = 500;

/**
 * Link to the terms of sale (CGV) shown next to the payment button and on the
 * confirmation page. Null hides the link: set it (e.g. "/legal?tab=cgv") only
 * once a validated CGV page exists.
 */
export const BOOKING_TERMS_OF_SALE_HREF: string | null = null;

export type BookingWindowIssue = "too_soon" | "too_far";

/** Why a consultation start cannot be booked at `now` (past dates are "too_soon"), or null. */
export function getBookingWindowIssue(appointmentStart: Date, now: number = Date.now()): BookingWindowIssue | null {
  const start = appointmentStart.getTime();
  if (!Number.isFinite(start) || start < now + BOOKING_MIN_LEAD_TIME_MS) return "too_soon";
  if (start > now + BOOKING_HORIZON_MS) return "too_far";
  return null;
}

/**
 * Stable reasons for a refused booking, sent with the tRPC error as
 * `data.reason` so the booking page shows its own translated message instead
 * of the French text written by the server (EN-06): the schedule refusals,
 * then the anti-abuse limits (attempts per hour, bookings awaiting payment),
 * the payment service being unavailable and a name without any visible letter
 * or digit.
 */
export const BOOKING_REFUSAL_REASONS = [
  "slot_taken",
  "too_soon",
  "too_far",
  "outside_schedule",
  "no_availability",
  "date_blocked",
  "rate_limited",
  "too_many_holds",
  "payment_unavailable",
  "invalid_name",
] as const;
export type BookingRefusalReason = (typeof BOOKING_REFUSAL_REASONS)[number];

export function isBookingRefusalReason(value: unknown): value is BookingRefusalReason {
  return typeof value === "string" && (BOOKING_REFUSAL_REASONS as readonly string[]).includes(value);
}

export const BOOKING_TOO_SOON_MESSAGE = `Ce créneau n’est plus réservable : les consultations se réservent au moins ${BOOKING_MIN_LEAD_TIME_HOURS} heures à l’avance. Veuillez choisir un créneau plus tardif.`;
export const BOOKING_TOO_FAR_MESSAGE = `Les consultations se réservent au plus ${BOOKING_HORIZON_DAYS} jours à l’avance. Veuillez choisir une date plus proche.`;
export const BOOKING_INVALID_PHONE_MESSAGE = "Saisissez un numéro de téléphone valide (8 à 15 chiffres, indicatif international accepté, ex. +33 6 12 34 56 78).";
export const BOOKING_INVALID_NAME_MESSAGE = "Saisissez votre nom complet : il doit comporter au moins une lettre ou un chiffre.";

const VISIBLE_LETTER_OR_DIGIT = new RegExp("(?!\\p{Default_Ignorable_Code_Point})[\\p{L}\\p{N}]", "u");

/**
 * A name the invoice can print: at least one letter or digit, of any script,
 * once trimmed. Spaces, invisible characters (ZWJ, ZWSP, bidi marks, Hangul
 * fillers, which Unicode counts as letters), blank braille (U+2800) or emoji
 * alone are refused.
 */
export function hasVisibleNameCharacter(value: string): boolean {
  return VISIBLE_LETTER_OR_DIGIT.test(value.trim());
}

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
