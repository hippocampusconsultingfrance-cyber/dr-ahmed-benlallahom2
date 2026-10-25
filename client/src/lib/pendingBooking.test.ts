import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBookingDraft,
  clearPendingBooking,
  loadBookingDraft,
  loadPendingBooking,
  saveBookingDraft,
  savePendingBooking,
  type PendingBooking,
} from "./pendingBooking";

// M5 — BOOK-BACKNAV : mémoire par onglet de la réservation en attente et de la saisie.

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const NOW = Date.UTC(2026, 9, 16, 10, 0);
const pending: PendingBooking = {
  trackingId: "APTBACK0001",
  checkoutSessionId: "cs_test_back",
  customerName: "Patient Test",
  customerEmail: "patient@example.test",
  finalPrice: 100,
  appointmentDate: "2026-10-20T08:00:00.000Z",
  holdExpiresAt: new Date(NOW + 20 * 60 * 1000).toISOString(),
};

beforeEach(() => {
  vi.stubGlobal("window", { sessionStorage: new MemoryStorage() });
});
afterEach(() => vi.unstubAllGlobals());

describe("réservation en attente après un retour depuis Stripe", () => {
  it("restitue la réservation en attente tant que le créneau est retenu, puis l’oublie", () => {
    savePendingBooking(pending);
    expect(loadPendingBooking(NOW)).toEqual(pending);
    expect(loadPendingBooking(NOW + 21 * 60 * 1000)).toBeNull();
    expect(loadPendingBooking(NOW)).toBeNull();
  });

  it("n’efface que la réservation correspondant à la référence ou à la session", () => {
    savePendingBooking(pending);
    clearPendingBooking({ trackingId: "APTOTHER" });
    expect(loadPendingBooking(NOW)).not.toBeNull();
    clearPendingBooking({ checkoutSessionId: "cs_test_back" });
    expect(loadPendingBooking(NOW)).toBeNull();
  });

  it("ignore une valeur corrompue et conserve la saisie du formulaire", () => {
    (window as unknown as { sessionStorage: MemoryStorage }).sessionStorage.setItem("booking:pending:v1", "{not json");
    expect(loadPendingBooking(NOW)).toBeNull();
    saveBookingDraft({ name: "Patient Test", email: "patient@example.test", phone: "+33612345678", appointmentDate: "2026-10-20T08:00:00.000Z", details: "Demande d’avis" });
    expect(loadBookingDraft()).toMatchObject({ name: "Patient Test", appointmentDate: "2026-10-20T08:00:00.000Z" });
    clearBookingDraft();
    expect(loadBookingDraft()).toBeNull();
  });

  it("reste utilisable sans stockage (navigation privée bloquée)", () => {
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("SecurityError"); } });
    expect(() => savePendingBooking(pending)).not.toThrow();
    expect(loadPendingBooking(NOW)).toBeNull();
    expect(loadBookingDraft()).toBeNull();
  });

  it("propose « Reprendre le paiement » et « Annuler et choisir un autre créneau » sur la page de réservation", () => {
    const source = readFileSync(new URL("../pages/BookingPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("trpc.appointments.createCheckoutSession.useMutation()");
    expect(source).toContain("trpc.appointments.cancelPending.useMutation()");
    expect(source).toContain("savePendingBooking({");
    expect(source).toContain('window.addEventListener("pageshow", onPageShow)');
    const confirmation = readFileSync(new URL("../pages/BookingConfirmationPage.tsx", import.meta.url), "utf8");
    expect(confirmation).toContain("clearPendingBooking({ checkoutSessionId: sessionId })");
  });
});
