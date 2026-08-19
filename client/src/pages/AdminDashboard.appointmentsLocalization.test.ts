import { describe, expect, it } from "vitest";
import { adminAppointmentsCopy } from "./AdminDashboard";

describe("réservations administratives localisées", () => {
  it("définit filtres, agenda, statuts et actions dans les quatre langues actives", () => {
    for (const copy of Object.values(adminAppointmentsCopy)) {
      expect(copy.loading).not.toHaveLength(0);
      expect(Object.values(copy.paymentStatus)).toHaveLength(4);
      expect(Object.values(copy.appointmentStatus)).toHaveLength(4);
      expect(copy.total(2)).not.toHaveLength(0);
      expect(copy.confirmRefund(100, "BK-001")).toContain("BK-001");
    }
  });

  it("conserve les statuts métier localisés", () => {
    expect(adminAppointmentsCopy.en.paymentStatus.completed).toBe("Paid");
    expect(adminAppointmentsCopy.de.appointmentStatus.no_show).toBe("Nicht erschienen");
    expect(adminAppointmentsCopy.zh.emptyTitle).toBe("暂无预约");
  });
});
