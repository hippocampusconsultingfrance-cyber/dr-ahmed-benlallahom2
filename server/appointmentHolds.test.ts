import { describe, expect, it } from "vitest";
import { APPOINTMENT_HOLD_MS, STRIPE_CHECKOUT_MIN_EXPIRY_MS, getAppointmentHoldExpiry, getExpiredAppointmentHoldUpdate, stripeExpiresAt } from "./appointmentHolds";

describe("maintien temporaire de réservation", () => {
  it("laisse une marge au-dessus du minimum Stripe Checkout (30 min) pour absorber la latence", () => {
    const now = new Date("2026-08-21T10:00:00.000Z");
    const hold = getAppointmentHoldExpiry(now)!;
    expect(hold.getTime() - now.getTime()).toBe(APPOINTMENT_HOLD_MS);
    expect(APPOINTMENT_HOLD_MS).toBeGreaterThanOrEqual(STRIPE_CHECKOUT_MIN_EXPIRY_MS);
    expect(STRIPE_CHECKOUT_MIN_EXPIRY_MS).toBeGreaterThanOrEqual(31 * 60 * 1000);
    // Une seconde de latence entre le calcul et l’appel Stripe garde plus de 30 min.
    expect(stripeExpiresAt(hold) - Math.floor((now.getTime() + 1000) / 1000)).toBeGreaterThan(30 * 60);
  });

  it("ne dépasse jamais le début de la consultation et refuse un créneau trop proche", () => {
    const now = new Date("2026-08-21T10:00:00.000Z");
    expect(getAppointmentHoldExpiry(now, new Date("2026-08-21T12:00:00.000Z"))?.getTime()).toBe(now.getTime() + APPOINTMENT_HOLD_MS);
    expect(getAppointmentHoldExpiry(now, new Date("2026-08-21T10:31:30.000Z"))?.toISOString()).toBe("2026-08-21T10:31:30.000Z");
    expect(getAppointmentHoldExpiry(now, new Date("2026-08-21T10:30:59.000Z"))).toBeNull();
    expect(getAppointmentHoldExpiry(now, new Date("2026-08-21T09:00:00.000Z"))).toBeNull();
  });

  it("libère le créneau sans modifier l’historique de paiement", () => {
    expect(getExpiredAppointmentHoldUpdate(new Date("2026-08-21T10:30:00.000Z"))).toMatchObject({
      appointmentStatus: "cancelled",
      slotKey: null,
      holdExpiresAt: null,
    });
  });
});
