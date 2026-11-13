// Dates and times in Europe/Paris, whatever the server's time zone: booking, availability, admin dates.

import { z } from "zod";
import { pad, parisWallClockTime } from "../../shared/parisTime";

// One definition for the booking page and the API (CODE-08): the Paris clock
// and the opening hours in shared/parisTime.ts, the night rate in shared/bookingPolicy.ts.
export { PARIS_TIME_ZONE, getParisParts, isBookableAppointmentTime, isWithinAvailability, pad, parisDateKey, timeToMinutes } from "../../shared/parisTime";
export { isNightRateForParis } from "../../shared/bookingPolicy";

/** Date typed by the admin (YYYY-MM-DD, Paris), stored at noon UTC: the same day in Paris. */
export function parseAdminDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

/** Midnight in Paris at the start of a calendar day ("2026-11-05"). */
function parisMidnight(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const start = match ? parisWallClockTime(Number(match[1]), Number(match[2]), Number(match[3])) : null;
  if (!start) throw new Error("Invalid Paris local date");
  return start;
}

const APPOINTMENT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?)?(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * Parses an ISO instant (with Z or an offset) or a Europe/Paris wall-clock time.
 * Impossible calendar values (30 February, 25:00) and Paris wall-clock times
 * that do not exist (spring-forward gap) are rejected instead of being shifted.
 */
export function parseAppointmentDate(value: string): Date {
  const match = APPOINTMENT_DATE_PATTERN.exec(value.trim());
  if (!match) throw new Error("Invalid appointment date");
  const [, yearText, monthText, dayText, hourText = "00", minuteText = "00", secondText = "00", zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
    throw new Error("Invalid appointment date");
  }
  if (zone && /^[+-]/.test(zone)) {
    const offset = zone.replace(":", "");
    if (Number(offset.slice(1, 3)) > 14 || Number(offset.slice(3, 5)) > 59) throw new Error("Invalid appointment date");
  }

  const parsed = zone ? new Date(value.trim()) : parisWallClockTime(year, month, day, hour, minute, second);
  if (!parsed || !Number.isFinite(parsed.getTime())) {
    throw new Error("Invalid appointment date");
  }
  return parsed;
}

export const calendarDateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit respecter le format YYYY-MM-DD")
  .refine(value => {
    const [year, month, day] = value.split("-").map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
  }, "La date calendaire est invalide");

export function getParisDateRange(dateKey: string): { start: Date; end: Date } {
  const start = parisMidnight(dateKey);
  const [year, month, day] = dateKey.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextKey = `${nextDay.getUTCFullYear()}-${pad(nextDay.getUTCMonth() + 1)}-${pad(nextDay.getUTCDate())}`;
  return { start, end: parisMidnight(nextKey) };
}
