import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Page de retour de Stripe rendue avec le statut renvoyé par le serveur : les
// étapes et la carte « facture » n’apparaissent qu’après un paiement, la
// facture n’a aucun lien de téléchargement, la page n’est pas indexée et le
// statut n’est demandé au serveur qu’avec une session Stripe vérifiable.

type Status = { state: string; appointment?: { appointmentDate: string; durationMinutes: number; amountEur: number } };
const view = vi.hoisted(() => ({
  status: undefined as Status | undefined,
  queries: [] as Array<{ input: unknown; options: { enabled: boolean } }>,
  seo: [] as Array<Record<string, unknown>>,
  cancelPending: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  clearPendingBooking: (() => undefined) as (...args: unknown[]) => void,
  clearBookingDraft: (() => undefined) as () => void,
}));

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));
vi.mock("@/lib/pendingBooking", () => ({ clearPendingBooking: (...args: unknown[]) => view.clearPendingBooking(...args), clearBookingDraft: () => view.clearBookingDraft() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr" }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/booking/confirmation", () => undefined],
  Link: ({ href, children, className }: { href: string; children: unknown; className?: string }) => createElement("a", { href, className }, children as never),
}));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/LanguageMenu", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: (props: Record<string, unknown>) => { view.seo.push(props); return null; } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    appointments: {
      cancelPending: { useMutation: () => ({ mutate: (...args: unknown[]) => view.cancelPending(...args) }) },
      publicStatus: {
        useQuery: (input: unknown, options: { enabled: boolean }) => {
          view.queries.push({ input, options });
          return { data: options.enabled ? view.status : undefined, isError: false };
        },
      },
    },
  },
}));

const { default: BookingConfirmationPage, confirmationContent } = await import("./BookingConfirmationPage");
const { siteConfig } = await import("@/data/site-config");
const copy = confirmationContent.fr;

const VALID_RETURN = "?status=success&trackingId=APTRENDER0001&session_id=cs_test_render_0001";
const CONFIRMED: Status = { state: "confirmed", appointment: { appointmentDate: "2026-11-02T09:00:00.000Z", durationMinutes: 30, amountEur: 150 } };

function render(search: string, status?: Status) {
  view.status = status;
  view.queries = [];
  view.seo = [];
  vi.stubGlobal("window", { location: { search }, setTimeout, clearTimeout });
  return renderToStaticMarkup(createElement(BookingConfirmationPage)).replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]!);

afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("page de confirmation de réservation", () => {
  it("annonce l’email et la facture PDF une fois le paiement confirmé par le serveur, sans lien vers la facture", () => {
    const html = render(VALID_RETURN, CONFIRMED);

    expect(html).toContain('data-state="confirmed"');
    expect(html).toContain(copy.success.title);
    expect(html).toContain(copy.invoice);
    expect(html).toContain(copy.email);
    for (const step of copy.steps) expect(html).toContain(step);
    expect(hrefs(html).filter(link => /invoice|facture|\.pdf/i.test(link))).toEqual([]);
    expect(hrefs(html)).toEqual(expect.arrayContaining([`mailto:${siteConfig.email}`, "/booking", "/"]));
  });

  it("montre les étapes mais pas la carte facture tant que la confirmation est en cours", () => {
    const html = render(VALID_RETURN, { state: "processing" });

    expect(html).toContain('data-state="processing"');
    for (const step of copy.steps) expect(html).toContain(step);
    expect(html).not.toContain(copy.invoice);
    expect(html).not.toContain(copy.success.title);
  });

  it.each([
    ["un paiement interrompu", "?status=canceled&trackingId=APTRENDER0001&session_id=cs_test_render_0001", "canceled"],
    ["une adresse sans statut", "?trackingId=APTRENDER0001", "unknown"],
    ["un serveur qui ne trouve pas de paiement", VALID_RETURN, "unknown"],
  ])("ne montre ni étapes ni facture pour %s", (_label, search, state) => {
    const html = render(search, search === VALID_RETURN ? { state: "not_paid" } : CONFIRMED);

    expect(html).toContain(`data-state="${state}"`);
    expect(html).not.toContain(copy.invoice);
    expect(html).not.toContain(copy.stepsTitle);
    expect(html).not.toContain(copy.success.title);
    expect(html).toContain(`mailto:${siteConfig.email}`);
  });

  it("ne demande le statut au serveur qu’avec une référence et une session Stripe vérifiables", () => {
    render(VALID_RETURN, CONFIRMED);
    expect(view.queries.at(-1)).toEqual({ input: { trackingId: "APTRENDER0001", sessionId: "cs_test_render_0001" }, options: expect.objectContaining({ enabled: true }) });

    for (const search of [
      "?status=success&trackingId=APTRENDER0001",
      "?status=success&trackingId=not-a-reference&session_id=cs_test_render_0001",
      "?status=success&trackingId=APTRENDER0001&session_id=pi_not_a_session",
      "?status=canceled&trackingId=APTRENDER0001&session_id=cs_test_render_0001",
    ]) {
      const html = render(search, CONFIRMED);
      expect(view.queries.at(-1)!.options.enabled, search).toBe(false);
      expect(html, search).not.toContain('data-state="confirmed"');
    }
  });

  it("reste hors de l’index des moteurs de recherche", () => {
    render(VALID_RETURN, CONFIRMED);
    expect(view.seo).toEqual([expect.objectContaining({ noIndex: true })]);
  });

  it("affiche l’information légale de réservation et le pied de page", async () => {
    const { default: BookingLegalNotice } = await import("@/components/BookingLegalNotice");
    const { default: Footer } = await import("@/components/Footer");
    view.status = CONFIRMED;
    vi.stubGlobal("window", { location: { search: VALID_RETURN }, setTimeout, clearTimeout });
    view.cancelPending = vi.fn();
    const types = elementsOf(renderStateful(BookingConfirmationPage)).map(element => element.type);
    expect(types).toContain(BookingLegalNotice);
    expect(types).toContain(Footer);
  });
});

describe("retour de Stripe et réservation en attente", () => {
  const visit = (search: string) => {
    vi.stubGlobal("window", { location: { search }, setTimeout, clearTimeout });
    renderStateful(BookingConfirmationPage);
  };

  it("libère le créneau d’un paiement interrompu, puis oublie la réservation en attente de cette session", () => {
    view.status = undefined;
    view.cancelPending = vi.fn();
    view.clearPendingBooking = vi.fn();
    view.clearBookingDraft = vi.fn();
    visit("?status=canceled&trackingId=APTRENDER0001&session_id=cs_test_render_0001");

    expect(view.cancelPending).toHaveBeenCalledTimes(1);
    const [input, options] = view.cancelPending.mock.calls[0] as [unknown, { onSuccess: () => void }];
    expect(input).toEqual({ sessionId: "cs_test_render_0001" });
    expect(view.clearPendingBooking).not.toHaveBeenCalled();
    options.onSuccess();
    expect(view.clearPendingBooking).toHaveBeenCalledWith({ checkoutSessionId: "cs_test_render_0001" });
    // The form entries stay for a new attempt.
    expect(view.clearBookingDraft).not.toHaveBeenCalled();
  });

  it("oublie la réservation en attente et la saisie après un paiement", () => {
    view.status = CONFIRMED;
    view.cancelPending = vi.fn();
    view.clearPendingBooking = vi.fn();
    view.clearBookingDraft = vi.fn();
    visit(VALID_RETURN);

    expect(view.cancelPending).not.toHaveBeenCalled();
    expect(view.clearPendingBooking).toHaveBeenCalledWith({ trackingId: "APTRENDER0001" });
    expect(view.clearBookingDraft).toHaveBeenCalledTimes(1);
  });
});
