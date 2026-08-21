import { describe, expect, it } from "vitest";
import { APPOINTMENT_HOLD_MS, getAppointmentHoldExpiry, getExpiredAppointmentHoldUpdate } from "./appointmentHolds";

describe("maintien temporaire de réservation", () => {
  it("expire au bout de trente minutes, conformément à la fenêtre minimale Stripe Checkout", () => {
    const now = new Date("2026-08-21T10:00:00.000Z");
    expect(getAppointmentHoldExpiry(now).getTime() - now.getTime()).toBe(APPOINTMENT_HOLD_MS);
  });

  it("libère le créneau sans modifier l’historique de paiement", () => {
    expect(getExpiredAppointmentHoldUpdate(new Date("2026-08-21T10:30:00.000Z"))).toMatchObject({
      appointmentStatus: "cancelled",
      slotKey: null,
      holdExpiresAt: null,
    });
  });
});
