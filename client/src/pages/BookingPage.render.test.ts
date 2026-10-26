import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKING_REQUEST_SUBJECT_MAX_LENGTH } from "@shared/bookingPolicy";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Page de réservation rendue et utilisée comme par un patient : saisie, choix
// du jour puis de l’horaire, envoi vers le paiement. L’agenda, le tarif et la
// création du rendez-vous sont simulés au niveau tRPC.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type Query = { data?: unknown; isLoading?: boolean; isError?: boolean; isFetching?: boolean; errorUpdatedAt?: number; dataUpdatedAt?: number };
type Language = "fr" | "en" | "de" | "zh";
const view = vi.hoisted(() => ({
  language: "fr" as "fr" | "en" | "de" | "zh",
  queries: {} as Record<string, { data?: unknown; isLoading?: boolean; isError?: boolean; isFetching?: boolean; errorUpdatedAt?: number; dataUpdatedAt?: number }>,
  create: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  resume: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  cancel: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

vi.mock("wouter", async () => {
  const { createElement } = await import("react");
  return { useLocation: () => ["/booking", vi.fn()], Link: ({ href, children }: { href: string; children: unknown }) => createElement("a", { href }, children as never) };
});
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/lib/trpc", () => {
  const query = (name: string) => ({ useQuery: () => ({ data: undefined, isLoading: false, isError: false, isFetching: false, errorUpdatedAt: 0, dataUpdatedAt: 1, refetch: vi.fn(async () => ({ isError: false })), ...view.queries[name] }) });
  const mutation = (name: "create" | "resume" | "cancel") => ({ useMutation: () => ({ mutateAsync: (input: unknown) => view[name](input), isPending: false }) });
  return {
    trpc: {
      availability: { getBlockedDates: query("blocked"), getBookedSlots: query("booked"), getSlots: query("slots") },
      appointments: { calculatePrice: query("price"), create: mutation("create"), createCheckoutSession: mutation("resume"), cancelPending: mutation("cancel") },
    },
  };
});

const { default: BookingPage, bookingContent } = await import("./BookingPage");
const { getBookingFormCopy } = await import("@/lib/publicFormCopy");
const { TurnstileWidget } = await import("@/components/TurnstileWidget");
const { default: BookingLegalNotice } = await import("@/components/BookingLegalNotice");
const { default: Footer } = await import("@/components/Footer");
const { SEOHead } = await import("@/components/SEOHead");

type Element = { type: unknown; props: Record<string, any>; key?: string | null };
const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as Element).props.children);
  return "";
};

const render = () => renderStateful(BookingPage) as ReactElement;
const all = () => elementsOf(render()) as Element[];
const byId = (id: string) => all().find(element => element.props.id === id)!;
const submitButton = () => all().find(element => element.props.type === "submit")!;
const alerts = () => all().filter(element => element.props.role === "alert").map(textOf);
const type = (id: string, value: string) => byId(id).props.onChange({ target: { value } });
const blur = (id: string) => byId(id).props.onBlur();
const submit = () => all().find(element => element.type === "form")!.props.onSubmit({ preventDefault: vi.fn() });

function chooseFirstSlot() {
  const day = all().filter(element => element.type === "option" && element.props.value).map(option => option.props.value as string)[0]!;
  byId("booking-day").props.onChange({ target: { value: day } });
  const slot = all().find(element => element.props.name === "booking-slot")!;
  slot.props.onChange();
  return slot.props.value as string;
}

function fillForm(phone = "+33 6 12 34 56 78") {
  type("booking-name", "Jeanne Martin");
  type("booking-email", "jeanne@example.test");
  type("booking-phone", phone);
  type("booking-details", "Organisation de la consultation");
  return chooseFirstSlot();
}

const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};

let alert: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;
let pageshow: Array<(event: { persisted: boolean }) => void>;
let sessionStorage: ReturnType<typeof storage>;

beforeEach(() => {
  sessionStorage = storage();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T07:00:00.000Z"));
  view.language = "fr";
  view.queries = {
    blocked: { data: [] },
    booked: { data: [] },
    slots: { data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ id: dayOfWeek + 1, dayOfWeek, startTime: "09:00", endTime: "18:00", isActive: 1 })) },
    price: { data: { finalPrice: 100, isNightRate: false } },
  };
  view.create = vi.fn(async () => ({ success: true, checkoutUrl: "https://checkout.stripe.test/c/pay/cs_test", trackingId: "APTRENDER0001", checkoutSessionId: "cs_test_render", finalPrice: 100, holdExpiresAt: "2026-11-02T07:30:00.000Z" }));
  view.resume = vi.fn(async () => ({ checkoutUrl: "https://checkout.stripe.test/c/pay/cs_test_resumed" }));
  view.cancel = vi.fn(async () => ({ cancelled: true }));
  alert = vi.fn();
  assign = vi.fn();
  pageshow = [];
  vi.stubGlobal("alert", alert);
  vi.stubGlobal("window", {
    location: { search: "", pathname: "/booking", assign },
    history: { replaceState: vi.fn() },
    get sessionStorage() { return sessionStorage; },
    setInterval: vi.fn(() => 1), clearInterval: vi.fn(),
    addEventListener: (type: string, listener: (event: { persisted: boolean }) => void) => { if (type === "pageshow") pageshow.push(listener); },
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", { title: "Réservation", getElementById: () => ({ focus: vi.fn() }), activeElement: null, body: {} });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const content = (language: Language = "fr") => bookingContent[language];

describe("formulaire de réservation", () => {
  it("aide la saisie tactile avec le remplissage automatique et les touches d’action", () => {
    expect(byId("booking-name").props).toMatchObject({ autoComplete: "name", enterKeyHint: "next" });
    expect(byId("booking-email").props).toMatchObject({ type: "email", autoComplete: "email", inputMode: "email", enterKeyHint: "next" });
    expect(byId("booking-phone").props).toMatchObject({ type: "tel", autoComplete: "tel", inputMode: "tel", enterKeyHint: "next", maxLength: 50 });
    expect(byId("booking-details").props).toMatchObject({ enterKeyHint: "done" });
  });

  it("présente l’objet de la demande sans information médicale, avec un avertissement lié au champ", () => {
    const details = byId("booking-details");
    expect(details.props).toMatchObject({ maxLength: BOOKING_REQUEST_SUBJECT_MAX_LENGTH, "aria-describedby": "booking-details-warning" });
    expect(textOf(byId("booking-details-warning"))).toBe(content().form.detailsWarning);
    expect(all().filter(element => element.type === "label" && element.props.htmlFor === "booking-details").map(textOf)).toEqual([content().form.details]);
  });

  it("ne propose le paiement qu’une fois un horaire choisi et son tarif connu", () => {
    expect(submitButton().props.disabled).toBe(true);
    fillForm();
    expect(submitButton().props.disabled).toBe(false);
  });

  it("verrouille immédiatement une soumission de paiement répétée avant le rendu du bouton désactivé", async () => {
    const appointmentDate = fillForm();
    let finish!: (value: unknown) => void;
    view.create = vi.fn(() => new Promise(resolve => { finish = resolve; }));

    const first = submit();
    // Second click before React re-renders the disabled button.
    await submit();
    expect(view.create).toHaveBeenCalledTimes(1);
    expect(view.create).toHaveBeenCalledWith(expect.objectContaining({ customerName: "Jeanne Martin", customerEmail: "jeanne@example.test", appointmentDate, language: "fr" }));
    expect(view.create.mock.calls[0]![0]).not.toHaveProperty("turnstileToken");

    finish({ success: true, checkoutUrl: "https://checkout.stripe.test/c/pay/cs_test", trackingId: "APTRENDER0001", checkoutSessionId: "cs_test_render", finalPrice: 100, holdExpiresAt: "2026-11-02T07:30:00.000Z" });
    await first;
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/c/pay/cs_test");
  });

  it("libère le verrou après un échec pour permettre un nouvel essai", async () => {
    fillForm();
    view.create = vi.fn(async () => { throw new Error("network"); });
    await submit();
    await submit();
    expect(view.create).toHaveBeenCalledTimes(2);
  });

  it("n’expose pas de détail technique dans les alertes publiques de paiement", async () => {
    fillForm();
    view.create = vi.fn(async () => ({ success: false }));
    await submit();
    expect(alert).toHaveBeenLastCalledWith(content().paymentError);

    view.create = vi.fn(async () => { throw Object.assign(new Error("duplicate key value violates unique constraint appointments_slot_key"), { data: { code: "INTERNAL_SERVER_ERROR" } }); });
    await submit();
    expect(alert).toHaveBeenLastCalledWith(content().bookingError);

    view.create = vi.fn(async () => { throw Object.assign(new Error("Ce créneau vient d’être réservé."), { data: { code: "CONFLICT", reason: "slot_taken" } }); });
    view.language = "en";
    await submit();
    expect(alert).toHaveBeenLastCalledWith(content("en").refusals.slot_taken);
    for (const [message] of alert.mock.calls) expect(String(message)).not.toMatch(/duplicate key|constraint|Ce créneau vient/);
  });

  it("contrôle le téléphone côté client, sans rien envoyer, avec un message lié au champ", async () => {
    fillForm("12");
    await submit();
    expect(view.create).not.toHaveBeenCalled();
    expect(byId("booking-phone").props).toMatchObject({ "aria-invalid": true, "aria-describedby": "booking-phone-error" });
    expect(textOf(byId("booking-phone-error"))).toBe(content().form.invalidPhone);

    type("booking-phone", "+33 6 12 34 56 78");
    expect(byId("booking-phone").props["aria-invalid"]).toBeUndefined();
    type("booking-phone", "abc");
    blur("booking-phone");
    expect(textOf(byId("booking-phone-error"))).toBe(content().form.invalidPhone);
  });

  it("refuse un horaire devenu trop proche avant d’envoyer quoi que ce soit", async () => {
    const appointmentDate = fillForm();
    vi.setSystemTime(new Date(new Date(appointmentDate).getTime() - 60 * 60 * 1000));
    await submit();
    expect(view.create).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("bloque le paiement et informe sans détail technique quand l’agenda ne se charge pas", () => {
    view.queries.blocked = { isError: true, data: undefined };
    const tree = elementsOf(render()) as Element[];
    expect(byId("availability-status").props["data-state"]).toBe("unavailable");
    expect(textOf(byId("availability-status"))).toBe(getBookingFormCopy("fr").availabilityError);
    expect((tree.find(element => element.props.type === "submit")!).props.disabled).toBe(true);
  });

  it("bloque le paiement si l’agenda ne se recharge pas après le choix d’un horaire, tarif connu", async () => {
    fillForm();
    expect(submitButton().props.disabled).toBe(false);
    view.queries.blocked = { isError: true, data: [] };
    expect(submitButton().props.disabled).toBe(true);
    expect(alerts()).toContain(getBookingFormCopy("fr").availabilityError);
    await submit();
    expect(view.create).not.toHaveBeenCalled();
  });

  it("bloque le paiement et propose « Réessayer » quand le tarif n’a pas pu être calculé", () => {
    fillForm();
    view.queries.price = { data: undefined, errorUpdatedAt: 2, dataUpdatedAt: 1 };
    expect(alerts()).toEqual([`${content().form.priceError}${content().form.retry}`]);
    expect(submitButton().props.disabled).toBe(true);
  });

  it("montre un état de chargement plutôt qu’une grille vide pendant le calcul du tarif", () => {
    fillForm();
    view.queries.price = { data: undefined, isLoading: true };
    expect(all().map(element => element.type).some(componentType => typeof componentType === "function" && (componentType as { name: string }).name === "PublicContentSkeleton")).toBe(true);
    expect(submitButton().props.disabled).toBe(true);
  });

  it("n’affiche l’anti-robot que sur demande du serveur, puis exige un jeton neuf à chaque essai (ABUS-02)", async () => {
    fillForm();
    const widgets = () => all().filter(element => element.type === TurnstileWidget);
    expect(widgets()).toEqual([]);

    view.create = vi.fn(async () => { throw Object.assign(new Error("Vérification requise"), { data: { code: "FORBIDDEN", reason: "security_check_required" } }); });
    await submit();
    expect(widgets()).toHaveLength(1);
    const firstKey = widgets()[0]!.key;
    expect(submitButton().props.disabled).toBe(true);

    widgets()[0]!.props.onToken("turnstile-token-first-try");
    expect(submitButton().props.disabled).toBe(false);
    await submit();
    expect(view.create).toHaveBeenLastCalledWith(expect.objectContaining({ turnstileToken: "turnstile-token-first-try" }));
    expect(widgets()[0]!.key).not.toBe(firstKey);
    expect(submitButton().props.disabled).toBe(true);
  });

  it("garde une illustration purement décorative hors de la lecture d’écran et discrète", () => {
    const image = all().find(element => element.type === "img")!;
    expect(image.props).toMatchObject({ src: "/assets/booking-care.svg", alt: "", "aria-hidden": "true", loading: "lazy", decoding: "async", sizes: "(min-width: 1024px) 30vw, 100vw" });
    expect(image.props.className).toContain("opacity-70 saturate-75");
  });

  it.each(["fr", "en", "de", "zh"] as const)("oriente vers les secours sans imposer un numéro unique (%s)", language => {
    view.language = language;
    const note = all().find(element => element.props.role === "note")!;
    expect(note.props["aria-label"]).toBe(content(language).emergencyTitle);
    expect(textOf(note)).toContain(content(language).emergencyNote);
    expect(textOf(note)).not.toMatch(/112/);
  });

  it("offre un repère principal atteignable par le lien d’évitement", () => {
    expect(byId("main-content").props).toMatchObject({ role: "main", tabIndex: -1 });
  });

  it("affiche l’information légale de réservation et le pied de page", () => {
    const types = all().map(element => element.type);
    expect(types).toContain(BookingLegalNotice);
    expect(types).toContain(Footer);
    expect(types).toContain(SEOHead);
    expect(content().form.date).toBeTruthy();
    // The emergency instruction does not prescribe a single number.
    expect(content("fr").emergencyNote).toContain("appelez immédiatement les secours");
    expect(content("en").emergencyNote).toContain("call emergency services immediately");
  });
});

describe("paiement en attente après un retour depuis Stripe", () => {
  const PENDING = { trackingId: "APTPENDING01", checkoutSessionId: "cs_test_pending", customerName: "Jeanne Martin", customerEmail: "jeanne@example.test", finalPrice: 100, appointmentDate: "2026-11-03T09:00:00.000Z", holdExpiresAt: "2026-11-02T07:20:00.000Z" };
  const pendingButton = (label: string) => all().find(element => typeof element.props.onClick === "function" && textOf(element).trim() === label)!;

  it("garde la réservation créée avant de partir vers Stripe", async () => {
    fillForm();
    await submit();
    expect(JSON.parse(sessionStorage.getItem("booking:pending:v1")!)).toMatchObject({ trackingId: "APTRENDER0001", checkoutSessionId: "cs_test_render" });
  });

  it("propose de reprendre le paiement, sans nouvelle réservation", async () => {
    sessionStorage.setItem("booking:pending:v1", JSON.stringify(PENDING));
    render();
    expect(textOf(byId("pending-booking-title"))).toBe(content().pending.title);
    await pendingButton(content().pending.resume).props.onClick();
    expect(view.resume).toHaveBeenCalledWith({ trackingId: "APTPENDING01", finalPrice: 100, customerEmail: "jeanne@example.test", customerName: "Jeanne Martin" });
    expect(view.create).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/c/pay/cs_test_resumed");
  });

  it("annule la réservation en attente pour choisir un autre créneau", async () => {
    sessionStorage.setItem("booking:pending:v1", JSON.stringify(PENDING));
    render();
    await pendingButton(content().pending.cancel).props.onClick();
    expect(view.cancel).toHaveBeenCalledWith({ sessionId: "cs_test_pending" });
    expect(sessionStorage.getItem("booking:pending:v1")).toBeNull();
    expect(all().find(element => element.props.id === "pending-booking-title")).toBeUndefined();
    expect(all().filter(element => element.props.role === "status").map(textOf)).toContain(content().pending.cancelled);
  });

  it("retrouve la réservation en attente quand le navigateur restaure la page depuis son cache", () => {
    render();
    expect(all().find(element => element.props.id === "pending-booking-title")).toBeUndefined();
    sessionStorage.setItem("booking:pending:v1", JSON.stringify(PENDING));
    for (const listener of pageshow) listener({ persisted: true });
    expect(textOf(byId("pending-booking-title"))).toBe(content().pending.title);
  });
});

describe("information légale de réservation", () => {
  it("renvoie vers la politique de confidentialité et les mentions légales", () => {
    const html = renderToStaticMarkup(createElement(BookingLegalNotice));
    expect(html).toContain('href="/legal?tab=privacy"');
    expect(html).toContain('href="/legal"');
  });
});
