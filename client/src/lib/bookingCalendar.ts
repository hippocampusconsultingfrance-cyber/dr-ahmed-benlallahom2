/**
 * "Ajouter à mon agenda" on /booking/confirmation (RES-05): a calendar file
 * (.ics) built in the browser from the confirmed appointment returned by the
 * public status. Start and end are written in UTC, so the event lands at the
 * right time whatever the patient's time zone.
 */
export type BookingCalendarEvent = {
  trackingId: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  description: string;
};

function icsUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines of at most 75 octets (RFC 5545 §3.1), continued by a leading space, without splitting a character. */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const character of line) {
    const characterSize = encoder.encode(character).length;
    if (size + characterSize > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += character;
    size += characterSize;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildBookingIcs(event: BookingCalendarEvent, now: Date = new Date()): string {
  const end = new Date(event.start.getTime() + event.durationMinutes * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dr Ahmed Ben Lallahom//Reservation//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.trackingId}@drahmedbenlallahom.com`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(event.start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** Hands the .ics to the browser as a download (opened by the calendar app on phones). */
export function downloadBookingIcs(content: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
