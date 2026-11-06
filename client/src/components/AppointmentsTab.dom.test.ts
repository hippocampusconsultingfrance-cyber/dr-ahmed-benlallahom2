// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-18 — onglet Réservations monté par React dans un DOM, ses lectures
// passant par React Query comme dans l’application : la liste masque par
// défaut les réservations abandonnées (« Tout afficher » les montre), un
// rendez-vous annulé dit son motif, son montant et sa date de remboursement,
// les heures n’ont pas de secondes, et l’agenda, lu à part par le serveur sur
// des journées de Paris, change de période et s’imprime.

type Row = Record<string, unknown> & { id: number; paymentStatus: string; appointmentStatus: string; stripePaymentIntentId: string | null };
const server = vi.hoisted(() => ({
  rows: [] as Row[],
  agenda: [] as Array<Record<string, unknown>>,
  listInputs: [] as Array<Record<string, unknown>>,
  agendaInputs: [] as Array<{ from: string; to: string }>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/trpc", async () => {
  const { useQueries, useQuery } = await import("@tanstack/react-query");
  /** The server's rule (server/routers/admin/appointments.ts): held, failed, or pending without a payment. */
  const abandoned = (row: Row) => row.appointmentStatus === "held" || row.paymentStatus === "failed" || (row.paymentStatus === "pending" && !row.stripePaymentIntentId);
  const list = async (input: { status?: string; excludeAbandoned?: boolean }) => {
    server.listInputs.push(input);
    const items = server.rows.filter(row => (!input.status || row.paymentStatus === input.status) && (!input.excludeAbandoned || !abandoned(row)));
    return { items, total: items.length };
  };
  const idle = { useMutation: () => ({ mutate: () => undefined, isPending: false }) };
  return {
    trpc: {
      useUtils: () => ({ admin: { appointments: { list: { invalidate: vi.fn() } }, stats: { invalidate: vi.fn() }, attention: { invalidate: vi.fn() } } }),
      useQueries: (build: (t: unknown) => Array<Record<string, unknown>>) => useQueries({
        queries: build({ admin: { appointments: { list: (input: Record<string, unknown>) => input } } })
          .map(input => ({ queryKey: ["appointments.list", input], queryFn: () => list(input) })),
      }),
      admin: {
        appointments: {
          agenda: {
            useQuery: (input: { from: string; to: string }) => useQuery({
              queryKey: ["appointments.agenda", input],
              queryFn: async () => { server.agendaInputs.push(input); return { items: server.agenda, truncated: false }; },
            }),
          },
          updateStatus: idle, refund: idle, refundUnconfirmedSession: idle, retryFulfillment: idle, invoicePdf: idle, updateCustomerEmail: idle,
        },
      },
    },
  };
});

const { default: AppointmentsTab } = await import("./AppointmentsTab");

function booking(id: number, overrides: Partial<Row> = {}): Row {
  return {
    id, trackingId: `APTDOM${String(id).padStart(6, "0")}`, customerName: `Patient ${id}`, customerEmail: `p${id}@test.local`, customerPhone: "+33600000000",
    appointmentDate: "2026-11-20T09:00:00.000Z", finalPrice: "100.00", language: "fr", paymentStatus: "completed", appointmentStatus: "confirmed",
    stripePaymentIntentId: `pi_${id}`, requestDetails: "", deliveries: [], invoiceNumber: null, cancellationReason: null, cancelledAt: null, refundAmount: null, refundedAt: null,
    ...overrides,
  };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(AppointmentsTab)));
}

beforeEach(() => {
  server.rows = [
    booking(1),
    booking(2, {
      paymentStatus: "refunded", appointmentStatus: "cancelled", refundAmount: "150.00", refundedAt: "2026-11-02T14:05:00.000Z", cancelledAt: "2026-11-02T14:05:00.000Z",
      cancellationReason: "Annulation / remboursement par le praticien : Empêchement du praticien",
    }),
    booking(3, { paymentStatus: "pending", appointmentStatus: "held", stripePaymentIntentId: null }),
    booking(4, { paymentStatus: "failed", appointmentStatus: "cancelled", stripePaymentIntentId: null }),
    booking(5, { paymentStatus: "pending", appointmentStatus: "cancelled" }),
  ];
  server.agenda = [];
  server.listInputs = [];
  server.agendaInputs = [];
  vi.stubGlobal("print", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ADM-18 — onglet Réservations", () => {
  it("masque par défaut les réservations abandonnées, et « Tout afficher » les montre", async () => {
    mount();
    expect(await screen.findByText("Patient 1")).toBeTruthy();
    expect(server.listInputs[0]).toMatchObject({ excludeAbandoned: true });
    expect(screen.getByRole("button", { name: "Sans les abandons" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Patient 3")).toBeNull();
    expect(screen.queryByText("Patient 4")).toBeNull();
    // A payment received without a confirmed slot stays listed.
    expect(screen.getByText("Patient 5")).toBeTruthy();
    expect(screen.getByText("3 réservation(s)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Tout afficher" }));
    expect(await screen.findByText("Patient 3")).toBeTruthy();
    expect(screen.getByText("Patient 4")).toBeTruthy();
    expect(server.listInputs.at(-1)).not.toHaveProperty("excludeAbandoned");
  });

  it("dit le motif, le montant et la date du remboursement d’un rendez-vous annulé, et l’heure sans les secondes", async () => {
    mount();
    expect(await screen.findByText("Patient 2")).toBeTruthy();
    expect(screen.getByText("Remboursé 150,00 € le 02/11/2026 15:05 · Annulé le 02/11/2026 15:05 · Motif : Annulation / remboursement par le praticien : Empêchement du praticien", { normalizer: text => text.replace(/\s+/g, " ").trim() })).toBeTruthy();
    expect(screen.getAllByText("20/11/2026 10:00")).toHaveLength(3);
    expect(document.body.textContent).not.toContain("10:00:00");
  });

  it("lit l’agenda à part, par jours de Paris, change de période et l’imprime", async () => {
    server.agenda = [
      { id: 7, trackingId: "APTDOM000007", customerName: "Patient agenda", customerPhone: "+33611223344", appointmentDate: "2026-11-19T23:30:00.000Z", appointmentStatus: "confirmed", duration: 30, language: "fr" },
    ];
    mount();
    const agenda = screen.getByRole("region", { name: "Agenda des consultations" });
    expect(await within(agenda).findByText("Patient agenda", { exact: false })).toBeTruthy();
    // 23:30 UTC on the 19th is 00:30 on 20 November in Paris.
    expect(within(agenda).getByRole("heading", { name: "vendredi 20 novembre" })).toBeTruthy();
    expect(within(agenda).getByText("00:30")).toBeTruthy();
    expect(within(agenda).getByText("+33611223344", { exact: false })).toBeTruthy();
    const week = server.agendaInputs[0]!;
    expect(Date.parse(`${week.to}T00:00:00Z`) - Date.parse(`${week.from}T00:00:00Z`)).toBe(6 * 86_400_000);

    fireEvent.click(within(agenda).getByRole("button", { name: "Aujourd’hui" }));
    await waitFor(() => expect(server.agendaInputs.at(-1)).toEqual({ from: week.from, to: week.from }));
    fireEvent.click(within(agenda).getByRole("button", { name: "30 jours" }));
    await waitFor(() => {
      const month = server.agendaInputs.at(-1)!;
      expect(Date.parse(`${month.to}T00:00:00Z`) - Date.parse(`${month.from}T00:00:00Z`)).toBe(29 * 86_400_000);
    });

    fireEvent.click(within(agenda).getByRole("button", { name: "Imprimer" }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
