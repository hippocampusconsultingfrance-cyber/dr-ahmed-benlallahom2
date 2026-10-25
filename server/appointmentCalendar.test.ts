import { describe, expect, it } from "vitest";
import { appointmentCalendarFilename, buildAppointmentCalendarEvent, escapeCalendarText, foldCalendarLine, formatCalendarUtc } from "./appointmentCalendar";

// RES-05 — fichier .ics joint à la confirmation : RFC 5545, heure UTC exacte,
// UID stable, lignes CRLF repliées à 75 octets.

const input = {
  trackingId: "APT77978063B5A6",
  // 00:30 heure de Paris le 16 octobre.
  start: new Date("2026-10-15T22:30:00.000Z"),
  durationMinutes: 30,
  stampedAt: new Date("2026-10-10T08:00:00.000Z"),
  language: "en" as const,
  contact: { email: "contact@example.test", phone: "+33 9 72 15 24 13" },
};

/** Unfolds the content lines (RFC 5545, 3.1) and splits them. */
function contentLines(ics: string) {
  return ics.replace(/\r\n[ \t]/g, "").split("\r\n").filter(Boolean);
}

describe("fichier agenda de la consultation", () => {
  it("produit un VCALENDAR valide : lignes CRLF, un seul VEVENT, heures en UTC", () => {
    const ics = buildAppointmentCalendarEvent(input);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const lines = contentLines(ics);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines.filter(line => line === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines).toContain("DTSTART:20261015T223000Z");
    expect(lines).toContain("DTEND:20261015T230000Z");
    expect(lines).toContain("DTSTAMP:20261010T080000Z");
    expect(lines).toContain("SUMMARY:Consultation with Dr Ahmed Ben Lallahom");
    expect(lines.find(line => line.startsWith("DESCRIPTION:"))).toContain("Reference: APT77978063B5A6");
  });

  it("garde un UID stable et un contenu identique pour la même réservation", () => {
    const first = buildAppointmentCalendarEvent(input);
    const again = buildAppointmentCalendarEvent({ ...input });
    expect(again).toBe(first);
    expect(contentLines(first)).toContain("UID:APT77978063B5A6@drahmedbenlallahom.com");
    expect(contentLines(buildAppointmentCalendarEvent({ ...input, language: "fr" }))).toContain("UID:APT77978063B5A6@drahmedbenlallahom.com");
    expect(appointmentCalendarFilename("APT77978063B5A6")).toBe("consultation-APT77978063B5A6.ics");
  });

  it("écrit l’événement en français pour une réservation en français, avec la modalité configurée", () => {
    const lines = contentLines(buildAppointmentCalendarEvent({ ...input, language: "fr", modalityText: "Appel vidéo; lien envoyé, la veille" }));
    expect(lines).toContain("SUMMARY:Consultation avec le Dr Ahmed Ben Lallahom");
    const description = lines.find(line => line.startsWith("DESCRIPTION:"))!;
    expect(description).toContain("Référence : APT77978063B5A6\\nDéroulement : Appel vidéo\\; lien envoyé\\, la veille");
  });

  it("échappe le texte et replie les longues lignes à 75 octets sans couper un caractère", () => {
    expect(escapeCalendarText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
    const ics = buildAppointmentCalendarEvent({ ...input, language: "fr", modalityText: "Téléconsultation ".repeat(12) });
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    const folded = foldCalendarLine(`DESCRIPTION:${"é".repeat(80)}`);
    expect(folded.split("\r\n ").join("")).toBe(`DESCRIPTION:${"é".repeat(80)}`);
    expect(folded).not.toContain("�");
    expect(formatCalendarUtc(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });
});
