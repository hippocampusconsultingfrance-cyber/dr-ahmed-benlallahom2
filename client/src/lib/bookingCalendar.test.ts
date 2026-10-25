import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBookingIcs, downloadBookingIcs } from "./bookingCalendar";

const event = {
  trackingId: "APTABC123DEF45",
  start: new Date("2026-10-29T18:00:00.000Z"),
  durationMinutes: 30,
  summary: "Consultation avec le Dr Ahmed Ben Lallahom",
  description: "Référence : APTABC123DEF45\nDurée : 30 minutes\nMontant réglé : 150,00 €",
};

/** Lignes logiques du fichier, les lignes repliées étant recollées. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("fichier agenda de la page de confirmation (RES-05)", () => {
  it("écrit l'heure exacte en UTC, la durée et la référence", () => {
    const ics = buildBookingIcs(event, new Date("2026-10-25T10:15:30.123Z"));
    const lines = unfold(ics);
    expect(lines.slice(0, 6)).toEqual(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dr Ahmed Ben Lallahom//Reservation//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT"]);
    expect(lines).toContain("UID:APTABC123DEF45@drahmedbenlallahom.com");
    expect(lines).toContain("DTSTAMP:20261025T101530Z");
    expect(lines).toContain("DTSTART:20261029T180000Z");
    expect(lines).toContain("DTEND:20261029T183000Z");
    expect(lines).toContain("SUMMARY:Consultation avec le Dr Ahmed Ben Lallahom");
    // Virgules, points-virgules et retours à la ligne échappés (RFC 5545).
    expect(lines).toContain("DESCRIPTION:Référence : APTABC123DEF45\\nDurée : 30 minutes\\nMontant réglé : 150\\,00 €");
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
  });

  it("replie les lignes longues à 75 octets sans couper un caractère", () => {
    const ics = buildBookingIcs({ ...event, summary: "与 Ahmed Ben Lallahom 医生的咨询".repeat(4) });
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length, line).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`SUMMARY:${"与 Ahmed Ben Lallahom 医生的咨询".repeat(4)}`);
  });
});

describe("téléchargement du fichier agenda (RES-05)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("laisse 40 s au navigateur pour lire le fichier avant de libérer son adresse", () => {
    vi.useFakeTimers();
    const link = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("document", { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:consultation");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    downloadBookingIcs(buildBookingIcs(event), "consultation-APTABC123DEF45.ics");
    expect(link).toMatchObject({ href: "blob:consultation", download: "consultation-APTABC123DEF45.ics" });
    expect(link.click).toHaveBeenCalledOnce();

    // Safari et iOS peuvent démarrer le téléchargement bien après le clic.
    vi.advanceTimersByTime(39_000);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:consultation");
  });
});
