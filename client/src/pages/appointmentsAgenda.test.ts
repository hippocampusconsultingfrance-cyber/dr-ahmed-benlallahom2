import { describe, expect, it } from "vitest";
import { buildAppointmentsAgenda } from "./appointmentsAgenda";

describe("agenda des rendez-vous", () => {
  it("groupe les rendez-vous futurs par journée et exclut les annulations", () => {
    const now = new Date("2026-08-19T08:00:00.000Z");
    const agenda = buildAppointmentsAgenda([
      { id: 1, customerName: "A", appointmentDate: "2026-08-20T09:00:00.000Z", appointmentStatus: "confirmed", paymentStatus: "completed", trackingId: "A" },
      { id: 2, customerName: "B", appointmentDate: "2026-08-20T11:00:00.000Z", appointmentStatus: "cancelled", paymentStatus: "completed", trackingId: "B" },
      { id: 3, customerName: "C", appointmentDate: "2026-08-21T10:00:00.000Z", appointmentStatus: "confirmed", paymentStatus: "pending", trackingId: "C" },
      { id: 4, customerName: "D", appointmentDate: "2026-08-18T10:00:00.000Z", appointmentStatus: "confirmed", paymentStatus: "completed", trackingId: "D" },
    ], now);

    expect(agenda).toHaveLength(2);
    expect(agenda[0].items.map((item) => item.customerName)).toEqual(["A"]);
    expect(agenda[1].items.map((item) => item.customerName)).toEqual(["C"]);
  });
});
