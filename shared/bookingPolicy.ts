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
 * the payment service being unavailable, a name without any visible letter
 * or digit, and the anti-robot check asked only when unpaid holds pile up
 * (ABUS-02): the page then shows the check and the patient pays as usual,
 * unless the check service itself is down (the patient retries later).
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
  "security_check_required",
  "security_check_unavailable",
] as const;
export type BookingRefusalReason = (typeof BOOKING_REFUSAL_REASONS)[number];

export function isBookingRefusalReason(value: unknown): value is BookingRefusalReason {
  return typeof value === "string" && (BOOKING_REFUSAL_REASONS as readonly string[]).includes(value);
}

export const BOOKING_TOO_SOON_MESSAGE = `Ce créneau n’est plus réservable : les consultations se réservent au moins ${BOOKING_MIN_LEAD_TIME_HOURS} heures à l’avance. Veuillez choisir un créneau plus tardif.`;
export const BOOKING_TOO_FAR_MESSAGE = `Les consultations se réservent au plus ${BOOKING_HORIZON_DAYS} jours à l’avance. Veuillez choisir une date plus proche.`;
export const BOOKING_INVALID_PHONE_MESSAGE = "Saisissez un numéro de téléphone valide, avec l’indicatif du pays précédé de + ou 00 (8 à 15 chiffres, ex. +33 6 12 34 56 78).";
export const BOOKING_INVALID_NAME_MESSAGE = "Saisissez votre nom complet : il doit comporter au moins une lettre ou un chiffre.";

const VISIBLE_LETTER_OR_DIGIT = new RegExp("(?!\\p{Default_Ignorable_Code_Point})[\\p{L}\\p{N}]", "u");

/**
 * A name the invoice can print: at least one letter or digit, of any script,
 * once trimmed. Spaces, invisible characters (ZWJ, ZWSP, bidi marks, Hangul
 * fillers, which Unicode counts as letters), blank braille (U+2800) or emoji
 * alone are refused. Read in compatibility form (NFKC), as the invoice prints
 * it: enclosed or squared letters (Ⓙⓔⓐⓝ, 🄹🄾🄷🄽) are symbols that stand for
 * letters, while Hangul fillers stay fillers (U+1160).
 */
export function hasVisibleNameCharacter(value: string): boolean {
  return VISIBLE_LETTER_OR_DIGIT.test(value.trim().normalize("NFKC"));
}

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
const NO_BREAK_SPACES = /[\u00A0\u2007\u202F]/g;
// Marques de direction que les répertoires Android et iOS en arabe ajoutent au
// copier-coller (LRM, RLM, ALM, LRE…PDF, LRO, RLO, LRI…PDI).
const DIRECTION_MARKS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Phone number as typed or pasted, read the way the booking checks and stores
 * it (INTL-09): compatibility form (NFKC: full-width digits and "＋"), Arabic
 * and Persian digits as 0-9, no-break spaces as plain spaces, without the
 * direction marks around a pasted number. Trimmed; nothing else changes.
 */
export function normalizePhoneInput(value: string): string {
  return value
    .normalize("NFKC")
    .replace(ARABIC_INDIC_DIGITS, digit => String((digit.charCodeAt(0) & 0xf)))
    .replace(NO_BREAK_SPACES, " ")
    .replace(DIRECTION_MARKS, "")
    .trim();
}

/**
 * Plausible international phone number, once normalized (normalizePhoneInput):
 * the country code first, after "+" or "00", then digits with spaces, dots,
 * dashes or parentheses as separators, 8 to 15 digits (E.164). A number
 * without its country code ("06 12 34 56 78") is refused: the doctor could not
 * tell which country to call.
 */
export function isPlausiblePhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  const prefix = /^\(?(\+|00)/.exec(trimmed)?.[1];
  if (!prefix || !/^\(?(\+|00)[0-9 ().-]*[0-9]$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "").slice(prefix === "00" ? 2 : 0);
  return digits.length >= 8 && digits.length <= 15;
}
