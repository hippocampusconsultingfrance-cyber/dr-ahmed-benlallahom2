import { describe, expect, it } from "vitest";
import { getBookingAvailabilityState } from "./BookingPage";

describe("état initial de disponibilité", () => {
  it("identifie un créneau non sélectionné pour afficher le repère illustré", () => {
    expect(getBookingAvailabilityState({ selected: false, pending: false, blocked: false, booked: false })).toBe("select");
    expect(getBookingAvailabilityState({ selected: true, pending: false, blocked: false, booked: false })).toBe("available");
  });
});
