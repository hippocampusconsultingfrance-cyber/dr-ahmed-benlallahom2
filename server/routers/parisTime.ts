// Dates and times in Europe/Paris, whatever the server's time zone: booking, availability, admin dates.

import { z } from "zod";

export const PARIS_TIME_ZONE = "Europe/Paris";

/** Date typed by the admin (YYYY-MM-DD, Paris), stored at noon UTC: the same day in Paris. */
export function parseAdminDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

const PARIS_DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getParisParts(date: Date) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PARIS_TIME_ZONE,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: String(values.weekday),
  };
}

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function parisDateKey(date: Date): string {
  const parts = getParisParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function parisWallClockToUtc(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!match) throw new Error("Invalid Paris local date");

  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const wallClockMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let utcMs = wallClockMs;

  // Resolve the Europe/Paris offset without relying on the server process timezone.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = getParisParts(new Date(utcMs));
    const representedWallClockMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const offsetErrorMs = representedWallClockMs - wallClockMs;
    if (offsetErrorMs === 0) break;
    utcMs -= offsetErrorMs;
  }

  return new Date(utcMs);
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

  const parsed = zone
    ? new Date(value.trim())
    : parisWallClockToUtc(`${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}`);

  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Invalid appointment date");
  }
  if (!zone) {
    const reread = getParisParts(parsed);
    if (reread.year !== year || reread.month !== month || reread.day !== day || reread.hour !== hour || reread.minute !== minute) {
      throw new Error("Invalid appointment date");
    }
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

export function isNightRateForParis(date: Date): boolean {
  return getParisParts(date).hour >= 18 || getParisParts(date).hour < 8;
}

export function getParisDateRange(dateKey: string): { start: Date; end: Date } {
  const start = parisWallClockToUtc(`${dateKey}T00:00:00`);
  const [year, month, day] = dateKey.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextKey = `${nextDay.getUTCFullYear()}-${pad(nextDay.getUTCMonth() + 1)}-${pad(nextDay.getUTCDate())}`;
  return { start, end: parisWallClockToUtc(`${nextKey}T00:00:00`) };
}

export function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : Number.NaN;
}

export function isWithinAvailability(
  date: Date,
  slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  durationMinutes = 30
): boolean {
  const parts = getParisParts(date);
  const dayOfWeek = PARIS_DAY_INDEX[parts.weekday];
  const previousDayOfWeek = (dayOfWeek + 6) % 7;
  const candidateStart = parts.hour * 60 + parts.minute;

  return slots.some(slot => {
    const slotStart = timeToMinutes(slot.startTime);
    const rawSlotEnd = timeToMinutes(slot.endTime);
    if (!Number.isFinite(slotStart) || !Number.isFinite(rawSlotEnd)) return false;

    const crossesMidnight = rawSlotEnd <= slotStart;
    const slotEnd = crossesMidnight ? rawSlotEnd + 24 * 60 : rawSlotEnd;
    let normalizedCandidateStart = candidateStart;

    if (!crossesMidnight) {
      if (slot.dayOfWeek !== dayOfWeek) return false;
    } else if (slot.dayOfWeek === dayOfWeek && candidateStart >= slotStart) {
      normalizedCandidateStart = candidateStart;
    } else if (slot.dayOfWeek === previousDayOfWeek && candidateStart < rawSlotEnd) {
      normalizedCandidateStart = candidateStart + 24 * 60;
    } else {
      return false;
    }

    const offsetFromStart = normalizedCandidateStart - slotStart;
    return offsetFromStart >= 0
      && normalizedCandidateStart + durationMinutes <= slotEnd
      && offsetFromStart % durationMinutes === 0;
  });
}

export function isBookableAppointmentTime(
  date: Date,
  slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  durationMinutes = 30
): boolean {
  return slots.length > 0 && isWithinAvailability(date, slots, durationMinutes);
}
