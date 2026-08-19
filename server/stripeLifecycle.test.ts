import { describe, expect, it } from "vitest";
import { getExpiredAppointmentUpdate } from "./stripeLifecycle";

describe("getExpiredAppointmentUpdate", () => {
  it("releases the slot and timestamps an unpaid expired checkout", () => {
    const cancelledAt = new Date("2026-08-19T08:00:00.000Z");

    expect(getExpiredAppointmentUpdate(cancelledAt)).toEqual({
      appointmentStatus: "cancelled",
      slotKey: null,
      cancelledAt,
    });
  });
});
