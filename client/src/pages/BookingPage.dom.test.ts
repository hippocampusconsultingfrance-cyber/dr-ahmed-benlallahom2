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

const view = vi.hoisted(() => ({ create: vi.fn(), blocked: [] as Array<{ date: string }> }));

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
      availability: {
        // Dates fermées lues à chaque rendu : un test peut en fermer une après le choix du jour.
        getBlockedDates: { useQuery: () => ({ ...loaded([]).useQuery(), data: view.blocked }) },
        getBookedSlots: loaded([]),
        getSlots: loaded(week),
      },
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
/** Niveaux des titres du contenu principal, dans l'ordre de lecture. */
const headingLevels = () => [...document.getElementById("main-content")!.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(heading => Number(heading.tagName.slice(1)));
/** Réservation en attente de paiement gardée par l'onglet avant le départ vers Stripe. */
const PENDING = { trackingId: "APTDOMPENDING1", checkoutSessionId: "cs_test_pending_dom", customerName: "Jeanne Martin", customerEmail: "jeanne@example.test", finalPrice: 100, appointmentDate: "2026-11-03T09:00:00.000Z", holdExpiresAt: "2026-11-02T07:25:00.000Z" };

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
  view.blocked = [];
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
  window.history.replaceState(null, "", "/");
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

describe("champ refusé pour ses caractères (INTL-05)", () => {
  it("dit de retaper le texte, au lieu de la consigne générale de saisie, et rend le bouton", async () => {
    mount();
    fillForm();
    view.create = vi.fn(async () => { throw Object.assign(new Error("Texte français écrit par le serveur."), { data: { code: "BAD_REQUEST", reason: "invalid_characters" } }); });

    fireEvent.click(screen.getByRole("button", { name: copy.submit }));
    const refusal = await screen.findByRole("alert");
    expect(refusal.textContent).toBe("Un champ contient un saut de ligne ou un caractère invisible qui n’y est pas accepté, souvent laissé par un copier-coller : retapez ce texte au clavier, puis renvoyez le formulaire.");
    expect(refusal.textContent).not.toBe(content.invalidInput);
    await waitFor(() => expect(screen.getByRole("button", { name: copy.submit })).toHaveProperty("disabled", false));
    expect(assign).not.toHaveBeenCalled();
  });
});

const parisTime = (iso: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" }).format(new Date(iso));
const pay = () => fireEvent.click(screen.getByRole("button", { name: copy.submit }));

describe("erreurs et repères du parcours de réservation (RES-10, A11Y-10, INTL-09)", () => {
  it("affiche un créneau pris en tête de la grille, avec le focus et les horaires libres les plus proches dans le message, et amène la grille à l’écran", async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);
    mount();
    const chosen = fillForm();
    view.create = vi.fn(async () => { throw Object.assign(new Error("Ce créneau vient d’être réservé."), { data: { code: "CONFLICT", reason: "slot_taken" } }); });
    pay();

    const refusal = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(refusal));
    expect(alert).not.toHaveBeenCalled();

    // Les trois horaires libres les plus proches de celui refusé (ici le premier du jour).
    const grid = screen.getByRole("group", { name: content.form.slotsLegend });
    const values = [...grid.querySelectorAll<HTMLInputElement>('input[name="booking-slot"]')].map(radio => radio.value);
    expect(values[0]).toBe(chosen);
    const suggested = [...grid.querySelectorAll<HTMLInputElement>("label[data-suggested] input")].map(radio => radio.value);
    expect(suggested).toEqual(values.slice(1, 4));
    // Le message annoncé dit le refus et propose ces horaires ; il est dans la grille, avant les horaires.
    expect(refusal.textContent).toBe(`${content.refusals.slot_taken} ${content.form.nearestSlots(suggested.map(parisTime))}`);
    expect(grid.contains(refusal)).toBe(true);
    expect(refusal.compareDocumentPosition(grid.querySelector('input[name="booking-slot"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grid.getAttribute("aria-describedby")!.split(" ")).toContain("booking-nearest-slots");
    // Le message, en haut de l’écran, avec la grille sous lui.
    expect(scrollIntoView.mock.contexts).toContain(refusal);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });

    // L’horaire proposé choisi, le refus et la mise en avant disparaissent.
    fireEvent.click(grid.querySelector<HTMLInputElement>(`input[value="${suggested[0]}"]`)!);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(grid.querySelectorAll("label[data-suggested]")).toHaveLength(0);
    expect(document.getElementById("booking-nearest-slots")).toBeNull();
  });

  it("retire le refus d’un créneau pris quand le patient choisit un autre jour", async () => {
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);
    mount();
    fillForm();
    view.create = vi.fn(async () => { throw Object.assign(new Error("Ce créneau vient d’être réservé."), { data: { code: "CONFLICT", reason: "slot_taken" } }); });
    pay();
    await screen.findByRole("alert");

    const otherDay = [...(field("booking-day") as unknown as HTMLSelectElement).options].filter(option => option.value)[1];
    fireEvent.change(field("booking-day"), { target: { value: otherDay.value } });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
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

  it("refuse sous le champ, sans rien envoyer, une adresse que le serveur refuserait (RES-10)", async () => {
    mount();
    fillForm();
    for (const address of ["jean@gmail.c0m", "jean@gmail.com1", "jean..x@exemple.fr", "jean.@exemple.fr"]) {
      fireEvent.change(field("booking-email"), { target: { value: address } });
      pay();
      expect(document.getElementById("booking-email-error")?.textContent, address).toBe(content.form.invalidEmail);
      expect(document.activeElement, address).toBe(field("booking-email"));
      expect(document.getElementById("booking-confirmation-email"), address).toBeNull();
    }
    expect(view.create).not.toHaveBeenCalled();

    // Corrigée, l’adresse part sans espace autour.
    fireEvent.change(field("booking-email"), { target: { value: " jean@gmail.com " } });
    pay();
    await waitFor(() => expect(view.create).toHaveBeenCalledWith(expect.objectContaining({ customerEmail: "jean@gmail.com" })));
  });

  it("accepte une adresse collée avec une marque de direction ou une espace insécable aux extrémités, et l’envoie sans elles (INTL-05)", async () => {
    mount();
    fillForm();
    fireEvent.change(field("booking-email"), { target: { value: "‏jeanne@example.test‎ " } });
    fireEvent.blur(field("booking-email"));
    expect(field("booking-email").value).toBe("jeanne@example.test");
    expect(document.getElementById("booking-email-error")).toBeNull();
    pay();
    await waitFor(() => expect(view.create).toHaveBeenCalledWith(expect.objectContaining({ customerEmail: "jeanne@example.test" })));
    expect(document.getElementById("booking-email-error")).toBeNull();
  });

  it("nomme, comme les autres formulaires, une marque invisible laissée à l’intérieur de l’adresse plutôt qu’une adresse incomplète (INTL-05)", async () => {
    mount();
    fillForm();
    // A left-to-right mark before the @, a zero-width space, a word joiner: the address looks complete.
    for (const address of ["jeanne‎@example.test", "jean​ne@gmial.com", "jeanne@exam⁠ple.test"]) {
      fireEvent.change(field("booking-email"), { target: { value: address } });
      fireEvent.blur(field("booking-email"));
      expect(document.getElementById("booking-email-error")?.textContent, address).toBe(content.refusals.invalid_characters);
      pay();
      expect(document.getElementById("booking-email-error")?.textContent, address).toBe(content.refusals.invalid_characters);
      expect(field("booking-email").getAttribute("aria-invalid"), address).toBe("true");
      expect(document.activeElement, address).toBe(field("booking-email"));
      // No correction proposed for an address to type again, nor an address read back before paying.
      expect(document.getElementById("booking-email-suggestion")!.textContent, address).toBe("");
      expect(document.getElementById("booking-confirmation-email"), address).toBeNull();
    }
    expect(view.create).not.toHaveBeenCalled();

    // A badly formed address keeps its own message.
    fireEvent.change(field("booking-email"), { target: { value: "jeanne@gmail" } });
    pay();
    expect(document.getElementById("booking-email-error")!.textContent).toBe(content.form.invalidEmail);

    // Typed again, the address leaves.
    fireEvent.change(field("booking-email"), { target: { value: "jeanne@example.test" } });
    expect(document.getElementById("booking-email-error")).toBeNull();
    pay();
    await waitFor(() => expect(view.create).toHaveBeenCalledWith(expect.objectContaining({ customerEmail: "jeanne@example.test" })));
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
    // L’indicatif est demandé dès le champ, avant toute erreur (INTL-09).
    expect(field("booking-phone").getAttribute("aria-describedby")).toBe("booking-phone-hint");
    expect(document.getElementById("booking-phone-hint")!.textContent).toBe(content.form.phoneHint);
    fillForm();
    fireEvent.change(field("booking-phone"), { target: { value: "0612345678" } });
    pay();
    expect(view.create).not.toHaveBeenCalled();
    expect(document.getElementById("booking-phone-error")!.textContent).toBe(content.form.invalidPhone);
    expect(field("booking-phone").getAttribute("aria-describedby")).toBe("booking-phone-hint booking-phone-error");
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
    expect(field("booking-day").hasAttribute("aria-invalid")).toBe(false);
    expect(screen.getByRole("group", { name: content.form.slotsLegend }).getAttribute("aria-describedby")!.split(" ")).toContain("booking-date-hint");

    // Tarif affiché : « Tarification » est un h2 sous le h1, et aucun titre ne précède le h1.
    expect(screen.getByRole("heading", { level: 2, name: content.pricing.title })).toBeTruthy();
    const levels = headingLevels();
    expect(levels[0]).toBe(1);
    levels.forEach((level, index) => { if (index > 0) expect(level, `${levels}`).toBeLessThanOrEqual(levels[index - 1] + 1); });
  });

  it("marque le jour choisi comme invalide quand il vient d’être fermé (A11Y-10)", async () => {
    mount();
    fillForm();
    expect(field("booking-day").hasAttribute("aria-invalid")).toBe(false);
    // Dates fermées rechargées : lues au rendu suivant de la page (ici, une saisie).
    view.blocked = [{ date: (field("booking-day") as unknown as HTMLSelectElement).value }];
    fireEvent.change(field("booking-details"), { target: { value: "Organisation" } });
    await waitFor(() => expect(field("booking-day").getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById("availability-status")!.textContent).toContain(copy.blocked);
  });

  it("place le focus sur le titre du paiement en attente retrouvé au retour de Stripe", async () => {
    sessionStorage.setItem("booking:pending:v1", JSON.stringify(PENDING));
    mount();
    const card = await screen.findByRole("region", { name: content.pending.title });
    const title = document.getElementById("pending-booking-title")!;
    expect(card.contains(title)).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(title));
  });

  it.each([
    ["paiement en attente", () => sessionStorage.setItem("booking:pending:v1", JSON.stringify(PENDING)), content.pending.title],
    ["paiement confirmé", () => window.history.replaceState(null, "", "/booking?success=true&trackingId=APTDOMSUCCESS1"), content.paymentSuccess],
    ["paiement annulé", () => window.history.replaceState(null, "", "/booking?canceled=true"), content.paymentCanceled],
  ] as const)("%s au retour de Stripe : la carte, région nommée par son titre, ne place aucun titre avant le h1 (A11Y-15)", async (_state, arrive, title) => {
    arrive();
    mount();
    const card = await screen.findByRole("region", { name: title });
    expect(card.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    const levels = headingLevels();
    expect(levels[0], `${levels}`).toBe(1);
    levels.forEach((level, index) => { if (index > 0) expect(level, `${levels}`).toBeLessThanOrEqual(levels[index - 1] + 1); });
  });
});
