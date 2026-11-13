/**
 * Dates and times in Paris, whatever the time zone of the server or of the
 * visitor: one definition for the booking page and the API (CODE-08), from
 * the calendar day of an instant to the opening hours a consultation must fit.
 */

export const PARIS_TIME_ZONE = "Europe/Paris";

/** Paris wall clock of an instant; dayOfWeek counts from Sunday (0), as availability slots do. */
export type ParisParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; dayOfWeek: number };

/** Weekly opening hours in Paris time ("22:00"–"02:00" runs past midnight). */
export type AvailabilitySlot = { dayOfWeek: number; startTime: string; endTime: string };

const HOUR_MS = 60 * 60 * 1000;

// Un seul formateur, lu une fois par heure UTC (getParisOffsetMs) pour les créneaux des 90 jours ;
// les secondes gardent exact le décalage d’avant 1911 (temps moyen de Paris, +0:09:21).
const PARIS_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: PARIS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Milliseconds of a wall-clock time read as UTC, years 0 to 99 included (Date.UTC reads them as 1900 to 1999). */
function wallClockMs(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second);
  return date.getTime();
}

/** Offset of the Paris clock at an instant, read by the formatter (to the second). */
function readParisOffsetMs(time: number): number {
  const second = Math.floor(time / 1000) * 1000;
  const values = Object.fromEntries(PARIS_PARTS.formatToParts(new Date(second)).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  return wallClockMs(values.year, values.month, values.day, values.hour, values.minute, values.second) - second;
}

// Décalage de Paris par heure UTC : depuis 1911, il ne change qu'à une heure UTC pile (passage à
// l'heure d'été ou d'hiver), donc un seul formatage par heure sert à tous les créneaux des 90 jours
// de la grille. Avant, le décalage de +0:09:21 a pris fin au milieu d'une heure UTC (1911-03-10
// à 23:50:39 UTC) : un décalage qui n'est pas en heures entières est relu à l'instant même.
const parisOffsetByUtcHour = new Map<number, number>();
const PARIS_OFFSET_CACHE_LIMIT = 20_000;

function getParisOffsetMs(time: number): number {
  const utcHour = Math.floor(time / HOUR_MS);
  const cached = parisOffsetByUtcHour.get(utcHour);
  if (cached !== undefined) return cached;
  const offset = readParisOffsetMs(utcHour * HOUR_MS);
  if (offset % HOUR_MS !== 0) return readParisOffsetMs(time);
  if (parisOffsetByUtcHour.size >= PARIS_OFFSET_CACHE_LIMIT) parisOffsetByUtcHour.clear();
  parisOffsetByUtcHour.set(utcHour, offset);
  return offset;
}

export function getParisParts(date: Date): ParisParts {
  const time = date.getTime();
  const paris = new Date(time + getParisOffsetMs(time));
  return {
    year: paris.getUTCFullYear(), month: paris.getUTCMonth() + 1, day: paris.getUTCDate(),
    hour: paris.getUTCHours(), minute: paris.getUTCMinutes(), second: paris.getUTCSeconds(), dayOfWeek: paris.getUTCDay(),
  };
}

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Paris calendar day of an instant: "2026-11-05". */
export function parisDateKey(date: Date): string {
  const parts = getParisParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/**
 * Instant of a Paris wall-clock time, without relying on the process time
 * zone; null for an impossible date (30 February, 25:00) or a time Paris
 * never shows (the hour skipped when clocks go forward), never shifted.
 */
export function parisWallClockTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date | null {
  const wantedMs = wallClockMs(year, month, day, hour, minute, second);
  if (!Number.isFinite(wantedMs)) return null;
  let utcMs = wantedMs;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getParisParts(new Date(utcMs));
    const offsetErrorMs = wallClockMs(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second) - wantedMs;
    if (offsetErrorMs === 0) break;
    utcMs -= offsetErrorMs;
  }

  const parsed = new Date(utcMs);
  const reread = getParisParts(parsed);
  return reread.year === year && reread.month === month && reread.day === day && reread.hour === hour && reread.minute === minute && reread.second === second
    ? parsed
    : null;
}

/** Minutes since midnight of "HH:MM", or NaN. */
export function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : Number.NaN;
}

/**
 * Whether a consultation starting at `date` fits whole in the opening hours,
 * on a `durationMinutes` step from the start of a range, in Paris time: a
 * range past midnight (22:00–02:00) also opens the early hours of the next day.
 */
export function isWithinAvailability(date: Date, slots: AvailabilitySlot[], durationMinutes = 30): boolean {
  const parts = getParisParts(date);
  const dayOfWeek = parts.dayOfWeek;
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

/** The check of the booking page before offering a time and of the API before holding it: no opening hours, no booking. */
export function isBookableAppointmentTime(date: Date, slots: AvailabilitySlot[], durationMinutes = 30): boolean {
  return slots.length > 0 && isWithinAvailability(date, slots, durationMinutes);
}
