import { describe, expect, it } from "vitest";
import { isNightRateForParis, isWithinAvailability, parseAppointmentDate } from "./routers";

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
    expect(parseAppointmentDate("2026-01-15T08:00").toISOString()).toBe("2026-01-15T07:00:00.000Z");
  });

  it("requires the full 30-minute consultation to fit inside an availability window", () => {
    const mondaySlot = [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }];
    expect(isWithinAvailability(parseAppointmentDate("2026-08-17T11:30"), mondaySlot)).toBe(true);
    expect(isWithinAvailability(parseAppointmentDate("2026-08-17T11:31"), mondaySlot)).toBe(false);
  });
});

export {};
