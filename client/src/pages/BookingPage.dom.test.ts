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

const { default: BookingPage, bookingContent } = await import("./BookingPage");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { getBookingFormCopy } = await import("@/lib/publicFormCopy");

const copy = getBookingFormCopy("fr");
const content = bookingContent.fr;
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
    expect((await screen.findByRole("alert")).textContent).toBe(content.bookingError);
    await waitFor(() => expect(screen.getByRole("button", { name: copy.submit })).toHaveProperty("disabled", false));
    expect(assign).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();

    view.create = vi.fn(async () => CREATED);
    fireEvent.click(screen.getByRole("button", { name: copy.submit }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(view.create).toHaveBeenCalledTimes(1);
  });
});

const parisTime = (iso: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" }).format(new Date(iso));
const pay = () => fireEvent.click(screen.getByRole("button", { name: copy.submit }));

describe("erreurs et repères du parcours de réservation (RES-10, A11Y-10, INTL-09)", () => {
  it("affiche un créneau pris dans la page, avec le focus, puis amène la grille et y met en avant les horaires libres les plus proches", async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);
    mount();
    const chosen = fillForm();
    view.create = vi.fn(async () => { throw Object.assign(new Error("Ce créneau vient d’être réservé."), { data: { code: "CONFLICT", reason: "slot_taken" } }); });
    pay();

    const refusal = await screen.findByRole("alert");
    expect(refusal.textContent).toBe(content.refusals.slot_taken);
    await waitFor(() => expect(document.activeElement).toBe(refusal));
    expect(alert).not.toHaveBeenCalled();

    // Les trois horaires libres les plus proches de celui refusé (ici le premier du jour).
    const grid = screen.getByRole("group", { name: content.form.slotsLegend });
    const values = [...grid.querySelectorAll<HTMLInputElement>('input[name="booking-slot"]')].map(radio => radio.value);
    expect(values[0]).toBe(chosen);
    const suggested = [...grid.querySelectorAll<HTMLInputElement>("label[data-suggested] input")].map(radio => radio.value);
    expect(suggested).toEqual(values.slice(1, 4));
    expect(document.getElementById("booking-nearest-slots")!.textContent).toBe(content.form.nearestSlots(suggested.map(parisTime)));
    expect(grid.getAttribute("aria-describedby")!.split(" ")).toContain("booking-nearest-slots");
    expect(scrollIntoView.mock.contexts).toContain(grid);

    // L’horaire proposé choisi, le refus et la mise en avant disparaissent.
    fireEvent.click(grid.querySelector<HTMLInputElement>(`input[value="${suggested[0]}"]`)!);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(grid.querySelectorAll("label[data-suggested]")).toHaveLength(0);
    expect(document.getElementById("booking-nearest-slots")).toBeNull();
  });

  it("annonce de nouveau un refus identique, avec le focus", async () => {
    mount();
    fillForm();
    view.create = vi.fn(async () => { throw Object.assign(new Error("Trop de tentatives"), { data: { code: "TOO_MANY_REQUESTS", reason: "rate_limited" } }); });
    pay();
    const first = await screen.findByRole("alert");
    expect(first.textContent).toBe(content.refusals.rate_limited);
    // Le message donne le téléphone du cabinet.
    expect(first.textContent).toMatch(/\+33 9 72 15 24 13/);
    await waitFor(() => expect(screen.getByRole("button", { name: copy.submit })).toHaveProperty("disabled", false));

    pay();
    await waitFor(() => expect(view.create).toHaveBeenCalledTimes(2));
    // Nouvel élément (nouvelle annonce), qui reprend le focus.
    await waitFor(() => expect(screen.getByRole("alert")).not.toBe(first));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("alert")));
  });

  it("annonce de nouveau, avec le focus, le même refus constaté avant l’envoi", async () => {
    mount();
    const appointmentDate = fillForm();
    // L’horaire choisi est devenu trop proche, sans attendre le prochain tic de l’horloge de la page.
    vi.setSystemTime(new Date(new Date(appointmentDate).getTime() - 60 * 60 * 1000));
    const form = field("booking-name").closest("form")!;
    fireEvent.submit(form);
    const first = await screen.findByRole("alert");
    expect(first.textContent).toBe(content.form.tooSoon);
    await waitFor(() => expect(document.activeElement).toBe(first));

    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("alert")).not.toBe(first));
    expect(screen.getByRole("alert").textContent).toBe(content.form.tooSoon);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("alert")));
    expect(view.create).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it("garde une seule vérification anti-robot à côté du message de refus, d’un essai à l’autre (ABUS-02)", async () => {
    mount();
    fillForm();
    view.create = vi.fn(async () => { throw Object.assign(new Error("Vérification requise"), { data: { code: "PRECONDITION_FAILED", reason: "security_check_required" } }); });
    pay();
    await waitFor(() => expect(document.getElementById("booking-submit-error")?.textContent).toBe(content.refusals.security_check_required));
    // Sans clé de site en test, la vérification s’affiche comme indisponible : un seul bloc, jamais dupliqué.
    const checks = () => [...document.querySelectorAll("form [role=alert]")].filter(element => element.id !== "booking-submit-error");
    // Quelques nouveaux rendus de la page (saisie) : rien ne s’accumule.
    for (const details of ["Organisation", "Organisation de", "Organisation de la consultation"]) fireEvent.change(field("booking-details"), { target: { value: details } });
    await waitFor(() => expect(checks()).toHaveLength(1));
    expect(document.querySelectorAll("#booking-submit-error")).toHaveLength(1);
  });

  it("refuse une adresse sans extension avant tout envoi et propose la correction d’une faute courante", async () => {
    mount();
    fillForm();
    fireEvent.change(field("booking-email"), { target: { value: "jeanne@gmail" } });
    pay();

    expect(view.create).not.toHaveBeenCalled();
    expect(document.getElementById("booking-email-error")!.textContent).toBe(content.form.invalidEmail);
    expect(field("booking-email").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("booking-email"));
    expect(document.getElementById("booking-email-suggestion")!.textContent).toContain(content.form.emailSuggestion("jeanne@gmail.com"));

    fireEvent.click(screen.getByRole("button", { name: content.form.useEmailSuggestion }));
    expect(field("booking-email").value).toBe("jeanne@gmail.com");
    expect(document.getElementById("booking-email-error")).toBeNull();
    expect(document.activeElement).toBe(field("booking-email"));
    expect(document.getElementById("booking-confirmation-email")!.textContent).toBe(content.form.confirmationTo("jeanne@gmail.com"));
  });

  it("ne bloque pas une adresse complète même quand une correction est proposée, et la rappelle avant le paiement", async () => {
    mount();
    fillForm();
    fireEvent.change(field("booking-email"), { target: { value: "jeanne@gmial.com" } });
    fireEvent.blur(field("booking-email"));
    expect(document.getElementById("booking-email-suggestion")!.textContent).toContain(content.form.emailSuggestion("jeanne@gmail.com"));
    expect(document.getElementById("booking-email-error")).toBeNull();
    // Adresse relue juste au-dessus du bouton, et liée à lui.
    expect(document.getElementById("booking-confirmation-email")!.textContent).toBe(content.form.confirmationTo("jeanne@gmial.com"));
    expect(screen.getByRole("button", { name: copy.submit }).getAttribute("aria-describedby")).toBe("booking-confirmation-email");

    pay();
    await waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(view.create).toHaveBeenCalledWith(expect.objectContaining({ customerEmail: "jeanne@gmial.com" }));
  });

  it("demande l’indicatif d’un numéro local, et envoie en chiffres 0-9 un numéro collé en chiffres arabes", async () => {
    mount();
    fillForm();
    fireEvent.change(field("booking-phone"), { target: { value: "0612345678" } });
    pay();
    expect(view.create).not.toHaveBeenCalled();
    expect(document.getElementById("booking-phone-error")!.textContent).toBe(content.form.invalidPhone);
    expect(document.activeElement).toBe(field("booking-phone"));

    // Numéro copié d’un répertoire en arabe, entouré de marques de direction.
    fireEvent.change(field("booking-phone"), { target: { value: "\u202A+٩٧١ ٥٠ ١٢٣ ٤٥٦٧\u202C" } });
    expect(document.getElementById("booking-phone-error")).toBeNull();
    pay();
    await waitFor(() => expect(view.create).toHaveBeenCalledTimes(1));
    expect(view.create).toHaveBeenCalledWith(expect.objectContaining({ customerPhone: "+971 50 123 4567" }));
  });

  it("annonce l’étape courante, relie la consigne de date au jour et à la grille, et ouvre la page par son h1 sans saut de niveau", () => {
    mount();
    const currentSteps = () => [...document.querySelectorAll('[aria-current="step"]')].map(step => step.textContent);
    expect(currentSteps()).toEqual([`${content.stepOf(1, 3)}Informations`]);
    fillForm();
    expect(currentSteps()).toEqual([`${content.stepOf(3, 3)}Paiement`]);

    expect(document.getElementById("booking-date-hint")!.textContent).toContain(content.form.dateHint);
    expect(field("booking-day").getAttribute("aria-describedby")!.split(" ")).toContain("booking-date-hint");
    expect(screen.getByRole("group", { name: content.form.slotsLegend }).getAttribute("aria-describedby")!.split(" ")).toContain("booking-date-hint");

    // Tarif affiché : « Tarification » est un h2 sous le h1, et aucun titre ne précède le h1.
    expect(screen.getByRole("heading", { level: 2, name: content.pricing.title })).toBeTruthy();
    const levels = [...document.getElementById("main-content")!.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(heading => Number(heading.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    levels.forEach((level, index) => { if (index > 0) expect(level, `${levels}`).toBeLessThanOrEqual(levels[index - 1] + 1); });
  });

  it("place le focus sur le titre du paiement en attente retrouvé au retour de Stripe", async () => {
    sessionStorage.setItem("booking:pending:v1", JSON.stringify({ trackingId: "APTDOMPENDING1", checkoutSessionId: "cs_test_pending_dom", customerName: "Jeanne Martin", customerEmail: "jeanne@example.test", finalPrice: 100, appointmentDate: "2026-11-03T09:00:00.000Z", holdExpiresAt: "2026-11-02T07:25:00.000Z" }));
    mount();
    const title = await screen.findByRole("heading", { name: content.pending.title });
    await waitFor(() => expect(document.activeElement).toBe(title));
  });
});
