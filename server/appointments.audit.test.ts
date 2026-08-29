import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isBookableAppointmentTime, isNightRateForParis, isWithinAvailability, parseAppointmentDate } from "./routers";

describe("Appointment pricing audit", () => {
  it("uses the daytime rate at 08:00 in Paris during summer time", () => {
    expect(isNightRateForParis(new Date("2026-08-16T06:00:00.000Z"))).toBe(false);
  });

  it("uses the night rate before 08:00 in Paris during summer time", () => {
    expect(isNightRateForParis(new Date("2026-08-16T05:59:00.000Z"))).toBe(true);
  });

  it("uses the daytime rate before 18:00 in Paris during summer time", () => {
    expect(isNightRateForParis(new Date("2026-08-16T15:59:00.000Z"))).toBe(false);
  });

  it("uses the night rate from 18:00 in Paris during summer time", () => {
    expect(isNightRateForParis(new Date("2026-08-16T16:00:00.000Z"))).toBe(true);
  });

  it("follows winter time changes in Europe/Paris", () => {
    expect(isNightRateForParis(new Date("2026-01-15T07:00:00.000Z"))).toBe(false);
    expect(isNightRateForParis(new Date("2026-01-15T17:00:00.000Z"))).toBe(true);
  });

  it("interprets a timezone-less booking date as Europe/Paris local time", () => {
    expect(parseAppointmentDate("2026-08-16T18:00").toISOString()).toBe("2026-08-16T16:00:00.000Z");
    expect(parseAppointmentDate("2026-09-03T10:30").toISOString()).toBe("2026-09-03T08:30:00.000Z");
    expect(parseAppointmentDate("2026-01-15T08:00").toISOString()).toBe("2026-01-15T07:00:00.000Z");
  });

  it("requires the full 30-minute consultation to fit inside an availability window", () => {
    const mondaySlot = [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }];
    expect(isWithinAvailability(parseAppointmentDate("2026-08-17T11:30"), mondaySlot)).toBe(true);
    expect(isWithinAvailability(parseAppointmentDate("2026-08-17T11:31"), mondaySlot)).toBe(false);
    expect(isWithinAvailability(parseAppointmentDate("2026-08-17T09:15"), mondaySlot)).toBe(false);
  });

  it("fails closed when no consultation schedule is configured", () => {
    expect(isBookableAppointmentTime(parseAppointmentDate("2026-08-17T10:00"), [])).toBe(false);
  });

  it("supports a configured window that crosses midnight", () => {
    const mondayNight = [{ dayOfWeek: 1, startTime: "22:00", endTime: "02:00" }];
    expect(isBookableAppointmentTime(parseAppointmentDate("2026-08-17T23:30"), mondayNight)).toBe(true);
    expect(isBookableAppointmentTime(parseAppointmentDate("2026-08-18T01:30"), mondayNight)).toBe(true);
    expect(isBookableAppointmentTime(parseAppointmentDate("2026-08-18T02:00"), mondayNight)).toBe(false);
  });

  it("annule immédiatement un checkout Stripe abandonné encore en attente", () => {
    const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const cancelPendingBlock = source.slice(source.indexOf("cancelPending: publicProcedure"), source.indexOf("// Blog / Actualités"));

    expect(cancelPendingBlock).toContain('eq(appointments.appointmentStatus, "held")');
    expect(cancelPendingBlock).not.toContain('eq(appointments.appointmentStatus, "confirmed")');
    expect(cancelPendingBlock).toContain('holdExpiresAt: null');
    expect(cancelPendingBlock).toContain('cancelledAt: new Date()');
  });
});

export {};
