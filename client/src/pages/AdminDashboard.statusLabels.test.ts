import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Statuts d’une réservation écrits en français sur sa carte et dans l’agenda
// de l’onglet Réservations, comme dans les données d’une personne :
// « Remboursé », « Annulé », pas les valeurs « refunded », « cancelled » de la base.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

const view = vi.hoisted(() => ({ items: [] as Array<Record<string, unknown>> }));

const mutation = () => ({ useMutation: () => ({ mutate: vi.fn(), isPending: false }) });
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/trpc", () => {
  const invalidate = { invalidate: vi.fn() };
  return {
    trpc: {
      useUtils: () => ({ admin: { appointments: { list: invalidate }, stats: invalidate, attention: invalidate } }),
      useQueries: (build: (t: unknown) => unknown[]) => build({ admin: { appointments: { list: (input: unknown) => input } } })
        .map(() => ({ data: { items: view.items, total: view.items.length }, isLoading: false, error: null, refetch: vi.fn() })),
      admin: {
        appointments: {
          updateStatus: mutation(),
          refund: mutation(),
          refundUnconfirmedSession: mutation(),
          retryFulfillment: mutation(),
          invoicePdf: mutation(),
          updateCustomerEmail: mutation(),
        },
      },
    },
  };
});

const { default: AppointmentsTab } = await import("@/components/AppointmentsTab");

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    trackingId: "APTLABEL0001",
    customerName: "Patient Test",
    customerEmail: "patient@example.test",
    customerPhone: "+33600000000",
    appointmentDate: new Date(Date.now() + 3 * 24 * 3_600_000).toISOString(),
    finalPrice: "150.00",
    language: "fr",
    paymentStatus: "completed",
    appointmentStatus: "confirmed",
    stripePaymentIntentId: "pi_label",
    requestDetails: "",
    deliveries: [],
    invoiceNumber: null,
    ...overrides,
  };
}

beforeEach(() => {
  view.items = [];
});
afterEach(() => resetStatefulHooks());

describe("statuts d’une réservation en français dans l’onglet Réservations", () => {
  it("carte d’un rendez-vous remboursé et annulé, d’un rendez-vous payé et confirmé, agenda", () => {
    view.items = [
      appointment(),
      appointment({ id: 2, trackingId: "APTLABEL0002", paymentStatus: "refunded", appointmentStatus: "cancelled" }),
      appointment({ id: 3, trackingId: "APTLABEL0003", paymentStatus: "failed", appointmentStatus: "no_show" }),
    ];
    const html = renderToStaticMarkup(createElement(() => renderStateful(AppointmentsTab)));
    /** The badges of a booking's card: what follows its reference, up to the next card. */
    const card = (trackingId: string) => {
      const start = html.lastIndexOf(trackingId);
      const next = html.indexOf("APTLABEL", start + trackingId.length);
      return html.slice(start, next === -1 ? undefined : next);
    };
    const badges = (trackingId: string) => Array.from(card(trackingId).matchAll(/rounded text-xs font-medium[^"]*">\s*([^<]+?)\s*</g), match => match[1]);

    expect(badges("APTLABEL0001")).toEqual(["Payé", "Confirmé"]);
    expect(badges("APTLABEL0002")).toEqual(["Remboursé", "Annulé"]);
    expect(badges("APTLABEL0003")).toEqual(["Échoué", "Absent"]);
    // The agenda of the coming days, as the cards.
    expect(html).toMatch(/Patient Test<\/span><span class="[^"]*">Confirmé</);
    expect(html).not.toMatch(/>\s*(refunded|cancelled|confirmed|completed|failed|no_show)\s*</);
    // The payment filters, in the same words as the badges.
    expect(Array.from(html.matchAll(/<button[^>]*rounded-lg text-sm font-medium[^>]*>([^<]+)<\/button>/g), match => match[1])).toEqual(["Tous", "En attente", "Payé", "Échoué", "Remboursé"]);
  });
});
