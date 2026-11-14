/**
 * Booking rules shared by the booking page and the API. Change a value here to
 * change it everywhere (client checks, server checks, emails).
 */

import { getParisParts } from "./parisTime";
import { INVALID_CHARACTERS_REASON } from "./publicFormRefusalReasons";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Consultation fees in euro cents (CODE-09): the price sent to Stripe and
 * stored with the appointment (then printed on its invoice), and the rates
 * the booking page and the FAQ show.
 */
export const CONSULTATION_DAY_RATE_CENTS = 10_000;
export const CONSULTATION_NIGHT_RATE_CENTS = 15_000;

/** Night rate for a consultation starting from 18:00 until 08:00 the next morning, in Paris time. */
export const NIGHT_RATE_START_HOUR = 18;
export const NIGHT_RATE_END_HOUR = 8;

export function isNightRateForParis(date: Date): boolean {
  const { hour } = getParisParts(date);
  return hour >= NIGHT_RATE_START_HOUR || hour < NIGHT_RATE_END_HOUR;
}

/** Price in cents of a consultation starting at `date`: the night rate from 18:00 to 08:00 in Paris. */
export function consultationPriceCents(date: Date): number {
  return isNightRateForParis(date)
    ? CONSULTATION_NIGHT_RATE_CENTS
    : CONSULTATION_DAY_RATE_CENTS;
}

const rateAmountFormats = new Map<string, Intl.NumberFormat>();

/**
 * A rate as the pages write it, without cents when whole: 10000 → "100", 12050 → "120,50" in French.
 * One formatter per locale, created once: the booking page writes its rates again at each render.
 */
export function formatRateAmount(cents: number, locale: string): string {
  const fractionDigits = cents % 100 === 0 ? 0 : 2;
  const key = `${locale}|${fractionDigits}`;
  let format = rateAmountFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: 2,
    });
    rateAmountFormats.set(key, format);
  }
  return format.format(cents / 100);
}

/** An hour of the rate ranges on the 12-hour clock of the English pages: 8 → "8am", 18 → "6pm" ("6 pm" with a space). */
export function englishRateHour(hour: number, space = ""): string {
  return `${hour % 12 || 12}${space}${hour < 12 ? "am" : "pm"}`;
}

/**
 * Locale of the dates and amounts of a booking, by language of the booking
 * page: the page, its confirmation and the Stripe payment page (RES-14).
 */
export const BOOKING_LOCALES: Record<string, string> = {
  fr: "fr-FR",
  en: "en-GB",
  de: "de-DE",
  zh: "zh-CN",
};

/** The locale of a booking language; English (en-GB) for a language the site does not offer. */
export function getBookingLocale(language: string): string {
  return BOOKING_LOCALES[language] ?? "en-GB";
}

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
export function getBookingWindowIssue(
  appointmentStart: Date,
  now: number = Date.now()
): BookingWindowIssue | null {
  const start = appointmentStart.getTime();
  if (!Number.isFinite(start) || start < now + BOOKING_MIN_LEAD_TIME_MS)
    return "too_soon";
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
 * unless the check service itself is down (the patient retries later). Last,
 * a field refused for its characters (INTL-05), as on every public form.
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
  INVALID_CHARACTERS_REASON,
] as const;
export type BookingRefusalReason = (typeof BOOKING_REFUSAL_REASONS)[number];

export function isBookingRefusalReason(
  value: unknown
): value is BookingRefusalReason {
  return (
    typeof value === "string" &&
    (BOOKING_REFUSAL_REASONS as readonly string[]).includes(value)
  );
}

export const BOOKING_TOO_SOON_MESSAGE = `Ce créneau n’est plus réservable : les consultations se réservent au moins ${BOOKING_MIN_LEAD_TIME_HOURS} heures à l’avance. Veuillez choisir un créneau plus tardif.`;
export const BOOKING_TOO_FAR_MESSAGE = `Les consultations se réservent au plus ${BOOKING_HORIZON_DAYS} jours à l’avance. Veuillez choisir une date plus proche.`;
export const BOOKING_INVALID_PHONE_MESSAGE =
  "Saisissez un numéro de téléphone valide, avec l’indicatif du pays précédé de + ou 00 (8 à 15 chiffres, ex. +33 6 12 34 56 78).";
export const BOOKING_INVALID_NAME_MESSAGE =
  "Saisissez votre nom complet : il doit comporter au moins une lettre ou un chiffre.";

const VISIBLE_LETTER_OR_DIGIT = new RegExp(
  "(?!\\p{Default_Ignorable_Code_Point})[\\p{L}\\p{N}]",
  "u"
);

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
// copier-coller (LRM, RLM, ALM, LRE…PDF, LRO, RLO, LRI…PDI), et caractères
// invisibles de largeur nulle qu’un numéro copié emporte aussi (ZWSP, ZWNJ,
// ZWJ, WJ, BOM).
const INVISIBLE_MARKS =
  /[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

/**
 * Phone number as typed or pasted, read the way the booking checks it
 * (INTL-09): compatibility form (NFKC: full-width digits and "＋"), Arabic
 * and Persian digits as 0-9, no-break spaces as plain spaces, without the
 * direction marks and zero-width characters around a pasted number. Trimmed;
 * nothing else changes.
 */
export function normalizePhoneInput(value: string): string {
  return value
    .normalize("NFKC")
    .replace(ARABIC_INDIC_DIGITS, digit => String(digit.charCodeAt(0) & 0xf))
    .replace(NO_BREAK_SPACES, " ")
    .replace(INVISIBLE_MARKS, "")
    .trim();
}

/**
 * Phone number in E.164 form, once normalized (normalizePhoneInput), or null
 * when it is not plausible: the country code first, after "+" or "00" (no
 * country code starts with 0), then digits with spaces, dots, dashes or
 * parentheses as separators, 8 to 15 digits. Stored as "+" and the digits
 * alone, the national "(0)" written after the country code dropped
 * ("0033 (0)6 12 34 56 78" → "+33612345678"). A number without its country
 * code ("06 12 34 56 78", "+06 12 34 56 78") is refused: the doctor could not
 * tell which country to call.
 */
export function toE164PhoneNumber(value: string): string | null {
  const trimmed = value.trim();
  const prefix = /^\(?(\+|00)\s*\(?[1-9]/.exec(trimmed)?.[1];
  if (!prefix || !/^\(?(\+|00)[0-9 ().-]*[0-9]$/.test(trimmed)) return null;
  const digits = trimmed
    .replace(/\(\s*0\s*\)/g, "")
    .replace(/\D/g, "")
    .slice(prefix === "00" ? 2 : 0);
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

/** Plausible international phone number (toE164PhoneNumber). */
export function isPlausiblePhoneNumber(value: string): boolean {
  return toE164PhoneNumber(value) !== null;
}

// La règle de z.string().email() (zod 4), que le serveur appliquait jusque-là.
const BOOKING_EMAIL_ADDRESS =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/**
 * Address the confirmation and the invoice can reach (RES-10): one rule for
 * the page and the server (booking, correction from the dashboard), so that
 * the page refuses under the field what the server would refuse
 * ("patient@gmail", "jean@gmail.c0m", "jean..x@exemple.fr"). A dot-separated
 * local part of letters, digits and _ ' + -, a domain with an extension of
 * two letters at least.
 */
export function isBookingEmailAddress(value: string): boolean {
  return BOOKING_EMAIL_ADDRESS.test(value);
}
