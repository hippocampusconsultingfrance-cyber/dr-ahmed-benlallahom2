// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Page de réservation montée par React dans un DOM et utilisée comme par un
// patient : saisie, jour, horaire, puis double clic sur « Procéder au
// paiement ». Une seule réservation et une seule session de paiement sont
// créées ; après un échec, le bouton sert de nouveau. L’agenda et le tarif
// sont simulés au niveau tRPC, la création passe par React Query comme dans
// l’application.

const view = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  const week = Array.from({ length: 7 }, (_, dayOfWeek) => ({ id: dayOfWeek + 1, dayOfWeek, startTime: "09:00", endTime: "18:00", isActive: 1 }));
  const loaded = (data: unknown) => {
    const result = { data, isLoading: false, isError: false, isFetching: false, errorUpdatedAt: 0, dataUpdatedAt: 1, refetch: async () => ({ isError: false }) };
    return { useQuery: () => result };
  };
  const unused = { useMutation: () => ({ mutateAsync: async () => undefined, isPending: false }) };
  return {
    trpc: {
      availability: { getBlockedDates: loaded([]), getBookedSlots: loaded([]), getSlots: loaded(week) },
      appointments: {
        calculatePrice: loaded({ finalPrice: 100, isNightRate: false }),
        create: { useMutation: () => useMutation({ mutationFn: (input: unknown) => view.create(input) }) },
        createCheckoutSession: unused,
        cancelPending: unused,
      },
    },
  };
});

const { default: BookingPage } = await import("./BookingPage");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { getBookingFormCopy } = await import("@/lib/publicFormCopy");

const copy = getBookingFormCopy("fr");
const CHECKOUT_URL = "https://checkout.stripe.test/c/pay/cs_test_dom";
const CREATED = { success: true, checkoutUrl: CHECKOUT_URL, trackingId: "APTDOM000001", checkoutSessionId: "cs_test_dom", finalPrice: 100, holdExpiresAt: "2026-11-02T07:30:00.000Z" };
let assign: ReturnType<typeof vi.fn>;
let alert: ReturnType<typeof vi.fn>;

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(LanguageProvider, null, createElement(BookingPage))));
}
const field = (id: string) => document.getElementById(id) as HTMLInputElement;

/** Fills the form and picks the first time of the first open day, as a patient would. */
function fillForm() {
  fireEvent.change(field("booking-name"), { target: { value: "Jeanne Martin" } });
  fireEvent.change(field("booking-email"), { target: { value: "jeanne@example.test" } });
  fireEvent.change(field("booking-phone"), { target: { value: "+33 6 12 34 56 78" } });
  fireEvent.change(field("booking-details"), { target: { value: "Organisation de la consultation" } });
  const day = [...(field("booking-day") as unknown as HTMLSelectElement).options].find(option => option.value)!;
  fireEvent.change(field("booking-day"), { target: { value: day.value } });
  const slot = document.querySelector<HTMLInputElement>('input[name="booking-slot"]')!;
  fireEvent.click(slot);
  return slot.value;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T07:00:00.000Z"));
  localStorage.setItem("language", "fr");
  view.create = vi.fn(async () => CREATED);
  assign = vi.fn();
  alert = vi.fn();
  // Leaving for Stripe is recorded instead of navigating.
  vi.spyOn(window.location, "assign").mockImplementation(assign);
  vi.spyOn(window, "alert").mockImplementation(alert);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("paiement de la réservation (navigateur simulé)", () => {
  it("ne crée qu’une réservation et une session de paiement sur un double clic", async () => {
    mount();
    const pay = () => screen.getByRole("button", { name: copy.submit });
    expect(pay()).toHaveProperty("disabled", true);
    const appointmentDate = fillForm();
    expect(pay()).toHaveProperty("disabled", false);

    let finish!: (value: unknown) => void;
    view.create = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const button = pay();
    fireEvent.click(button);
    fireEvent.click(button);

    // While the booking is created, the button says so and stays disabled.
    await waitFor(() => expect(screen.getByRole("button", { name: copy.loading })).toHaveProperty("disabled", true));
    fireEvent.click(screen.getByRole("button", { name: copy.loading }));
    expect(view.create).toHaveBeenCalledTimes(1);
    expect(view.create).toHaveBeenCalledWith(expect.objectContaining({ customerName: "Jeanne Martin", customerEmail: "jeanne@example.test", appointmentDate, language: "fr" }));

    finish(CREATED);
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenCalledWith(CHECKOUT_URL);
    expect(JSON.parse(sessionStorage.getItem("booking:pending:v1")!)).toMatchObject({ trackingId: "APTDOM000001", checkoutSessionId: "cs_test_dom" });
    expect(view.create).toHaveBeenCalledTimes(1);
  });

  it("rend le bouton après un échec de création, pour un nouvel essai", async () => {
    mount();
    fillForm();
    view.create = vi.fn(async () => { throw new Error("network"); });

    fireEvent.click(screen.getByRole("button", { name: copy.submit }));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: copy.submit })).toHaveProperty("disabled", false));
    expect(assign).not.toHaveBeenCalled();

    view.create = vi.fn(async () => CREATED);
    fireEvent.click(screen.getByRole("button", { name: copy.submit }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(view.create).toHaveBeenCalledTimes(1);
  });
});
