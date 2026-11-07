import { describe, expect, it } from "vitest";
import { formatAdminDateTime } from "./adminDateFormat";

// ADM-07 — les dates de l’administration (messages, questions santé, RGPD,
// rendez-vous, journal de sécurité, fiche 360°) sont lues à l’horloge de Paris,
// sans les secondes, avec le fuseau écrit : un médecin qui consulte depuis
// Tunis ou Dubaï lit les mêmes heures que celles des rendez-vous.

describe("ADM-07 — dates de l’administration en heure de Paris", () => {
  it.each(["UTC", "Africa/Tunis", "Asia/Dubai"])("lit l’instant à l’horloge de Paris, en heure d’été comme en heure d’hiver, depuis un navigateur réglé sur %s", timeZone => {
    const previous = process.env.TZ;
    process.env.TZ = timeZone;
    try {
      // 08:30 UTC: 10:30 in Paris in summer (UTC+2), 09:30 in winter (UTC+1).
      expect(formatAdminDateTime(new Date("2026-07-14T08:30:45Z"))).toBe("14/07/2026 10:30 (heure de Paris)");
      expect(formatAdminDateTime("2026-12-24T08:30:45.000Z")).toBe("24/12/2026 09:30 (heure de Paris)");
      // Late in the evening UTC, already the next day in Paris.
      expect(formatAdminDateTime("2026-10-31T23:15:00Z")).toBe("01/11/2026 00:15 (heure de Paris)");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it("écrit la date et son fuseau dans la langue de l’administration", () => {
    const date = new Date("2026-12-24T08:30:00Z");
    expect(formatAdminDateTime(date, "en")).toBe("24/12/2026, 09:30 (Paris time)");
    expect(formatAdminDateTime(date, "de")).toBe("24.12.26, 09:30 (Pariser Zeit)");
    expect(formatAdminDateTime(date, "zh")).toBe("2026/12/24 09:30（巴黎时间）");
  });
});
