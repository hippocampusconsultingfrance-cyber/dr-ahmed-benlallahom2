/**
 * Calendar file (.ics, RFC 5545) attached to the booking confirmation email
 * (RES-05), so the patient can add the consultation to Google Calendar,
 * Outlook or Apple Calendar without copying the time by hand.
 *
 * Times are written in UTC ("Z"): every calendar shows them in the patient's
 * own time zone, with no time-zone table to maintain. The UID is derived from
 * the booking reference, and the stamp is supplied by the caller (the payment
 * date), so a retried email carries exactly the same file.
 */

const CALENDAR_UID_DOMAIN = "drahmedbenlallahom.com";
const MAX_LINE_OCTETS = 75;

const CALENDAR_COPY = {
  fr: {
    summary: "Consultation avec le Dr Ahmed Ben Lallahom",
    reference: "Référence",
    modality: "Déroulement",
    contact: "Une question, un report ou une annulation",
  },
  en: {
    summary: "Consultation with Dr Ahmed Ben Lallahom",
    reference: "Reference",
    modality: "How it takes place",
    contact: "A question, a change or a cancellation",
  },
} as const;

export type AppointmentCalendarInput = {
  trackingId: string;
  start: Date;
  durationMinutes: number;
  /** When the event was created (DTSTAMP): stable across retries of the same email. */
  stampedAt: Date;
  language: "fr" | "en";
  modalityText?: string | null;
  contact?: { email: string; phone: string };
};

/** "20261020T080000Z". */
export function formatCalendarUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

/** TEXT value escaping: backslash, semicolon, comma and line breaks (RFC 5545, 3.3.11). */
export function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets, never inside a UTF-8 character (RFC 5545, 3.1). */
export function foldCalendarLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character, "utf8");
    // Continuation lines start with one space, which counts towards the limit.
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += character;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function appointmentCalendarFilename(trackingId: string): string {
  return `consultation-${trackingId}.ics`;
}

export function buildAppointmentCalendarEvent(input: AppointmentCalendarInput): string {
  const copy = CALENDAR_COPY[input.language];
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);
  const separator = input.language === "fr" ? " : " : ": ";
  const description = [
    `${copy.reference}${separator}${input.trackingId}`,
    ...(input.modalityText ? [`${copy.modality}${separator}${input.modalityText}`] : []),
    ...(input.contact ? [`${copy.contact}${input.language === "fr" ? " ?" : "?"} ${input.contact.email} · ${input.contact.phone}`] : []),
  ].join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Hippocampus Consulting//Consultation//${input.language.toUpperCase()}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.trackingId}@${CALENDAR_UID_DOMAIN}`,
    `DTSTAMP:${formatCalendarUtc(input.stampedAt)}`,
    `DTSTART:${formatCalendarUtc(input.start)}`,
    `DTEND:${formatCalendarUtc(end)}`,
    `SUMMARY:${escapeCalendarText(copy.summary)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldCalendarLine).join("\r\n")}\r\n`;
}
