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
// des journées de Paris, change de période, s’imprime et se relit quand un
// rendez-vous change de statut ou est remboursé.

type Row = Record<string, unknown> & { id: number; paymentStatus: string; appointmentStatus: string; stripePaymentIntentId: string | null };
const server = vi.hoisted(() => ({
  rows: [] as Row[],
  agenda: [] as Array<Record<string, unknown>>,
  agendaLimit: null as number | null,
  listInputs: [] as Array<Record<string, unknown>>,
  agendaInputs: [] as Array<{ from: string; to: string }>,
  mutations: [] as Array<{ procedure: string; input: Record<string, unknown> }>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/trpc", async () => {
  const { useQueries, useQuery, useQueryClient } = await import("@tanstack/react-query");
  /** The server's rule (server/routers/admin/appointments.ts): held, failed, or pending without a payment. */
  const abandoned = (row: Row) => row.appointmentStatus === "held" || row.paymentStatus === "failed" || (row.paymentStatus === "pending" && !row.stripePaymentIntentId);
  const list = async (input: { status?: string; excludeAbandoned?: boolean }) => {
    server.listInputs.push(input);
    const items = server.rows.filter(row => (!input.status || row.paymentStatus === input.status) && (!input.excludeAbandoned || !abandoned(row)));
    return { items, total: items.length };
  };
  const idle = { useMutation: () => ({ mutate: () => undefined, isPending: false }) };
  /** The server accepts the change, then the tab's onSuccess runs as after a real answer. */
  const accepted = (procedure: string, result: unknown) => ({
    useMutation: (options?: { onSuccess?: (data: unknown) => void }) => ({
      mutate: (input: Record<string, unknown>) => {
        server.mutations.push({ procedure, input });
        options?.onSuccess?.(result);
      },
      isPending: false,
    }),
  });
  return {
    trpc: {
      useUtils: () => {
        const client = useQueryClient();
        const invalidate = (key: string) => ({ invalidate: () => client.invalidateQueries({ queryKey: [key] }) });
        return { admin: { appointments: { list: invalidate("appointments.list"), agenda: invalidate("appointments.agenda") }, stats: { invalidate: vi.fn() }, attention: { invalidate: vi.fn() } } };
      },
      useQueries: (build: (t: unknown) => Array<Record<string, unknown>>) => useQueries({
        queries: build({ admin: { appointments: { list: (input: Record<string, unknown>) => input } } })
          .map(input => ({ queryKey: ["appointments.list", input], queryFn: () => list(input) })),
      }),
      admin: {
        appointments: {
          agenda: {
            useQuery: (input: { from: string; to: string }) => useQuery({
              queryKey: ["appointments.agenda", input],
              queryFn: async () => {
                server.agendaInputs.push(input);
                // The server's limit, when the period holds more consultations than it.
                const limit = server.agendaLimit ?? 500;
                return { items: server.agenda.slice(0, limit), truncated: server.agenda.length > limit, limit };
              },
            }),
          },
          updateStatus: accepted("updateStatus", {}),
          refund: accepted("refund", { refundAmount: "100.00", patientNotified: true }),
          refundUnconfirmedSession: idle, retryFulfillment: idle, invoicePdf: idle, updateCustomerEmail: idle,
        },
      },
    },
  };
});

const { default: AppointmentsTab } = await import("./AppointmentsTab");
const { LanguageProvider } = await import("@/contexts/LanguageContext");

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
  return render(createElement(QueryClientProvider, { client }, createElement(LanguageProvider, null, createElement(AppointmentsTab))));
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
  server.agendaLimit = null;
  server.listInputs = [];
  server.agendaInputs = [];
  server.mutations = [];
  vi.stubGlobal("print", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
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

  it("dit le motif, le montant et la date du remboursement d’un rendez-vous annulé, et l’heure sans les secondes, en heure de Paris (ADM-07)", async () => {
    mount();
    expect(await screen.findByText("Patient 2")).toBeTruthy();
    expect(screen.getByText("Remboursé 150,00 € le 02/11/2026 15:05 (heure de Paris) · Annulé le 02/11/2026 15:05 (heure de Paris) · Motif : Annulation / remboursement par le praticien : Empêchement du praticien", { normalizer: text => text.replace(/\s+/g, " ").trim() })).toBeTruthy();
    expect(screen.getAllByText("20/11/2026 10:00 (heure de Paris)")).toHaveLength(3);
    expect(document.body.textContent).not.toContain("10:00:00");
  });

  it("écrit les statuts en français, comme le reste de l’onglet, quand le site est en anglais (ADM-07)", async () => {
    localStorage.setItem("language", "en");
    server.agenda = [
      { id: 1, trackingId: "APTDOM000001", customerName: "Patient agenda", customerPhone: "+33611223344", appointmentDate: "2026-11-20T09:00:00.000Z", appointmentStatus: "confirmed", duration: 30, language: "fr" },
    ];
    mount();
    expect(document.documentElement.lang).toBe("en");
    const card = (await screen.findByText("Patient 1")).closest<HTMLElement>(".rounded-lg")!;
    expect(within(card).getByText("Payé")).toBeTruthy();
    expect(within(card).getByText("Confirmé")).toBeTruthy();
    const agenda = screen.getByRole("region", { name: "Agenda des consultations" });
    expect(await within(agenda).findByText("Confirmé")).toBeTruthy();
    expect(screen.queryByText(/^(Paid|Confirmed|Refunded|Cancelled|Awaiting payment)$/)).toBeNull();
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

  it("dit la limite du serveur quand la période compte plus de consultations", async () => {
    server.agendaLimit = 2;
    server.agenda = [1, 2, 3].map(id => ({ id, trackingId: `APTDOM00000${id}`, customerName: `Patient agenda ${id}`, customerPhone: "+33611223344", appointmentDate: `2026-11-2${id}T09:00:00.000Z`, appointmentStatus: "confirmed", duration: 30, language: "fr" }));
    mount();
    const agenda = screen.getByRole("region", { name: "Agenda des consultations" });
    expect(await within(agenda).findByText("Agenda limité aux 2 premières consultations de la période : choisissez une période plus courte.")).toBeTruthy();
    expect(within(agenda).queryByText("Patient agenda 3", { exact: false })).toBeNull();
  });

  it("relit l’agenda quand une consultation est marquée terminée, puis quand une autre est annulée et remboursée", async () => {
    // One consultation already held, one to come.
    server.rows = [booking(1, { appointmentDate: "2026-01-05T09:00:00.000Z" }), booking(2, { appointmentDate: "2099-01-05T09:00:00.000Z" })];
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("prompt", vi.fn(() => "Empêchement du praticien"));
    mount();
    expect(await screen.findByText("Patient 2")).toBeTruthy();
    await waitFor(() => expect(server.agendaInputs).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Terminer" }));
    expect(server.mutations.at(-1)).toEqual({ procedure: "updateStatus", input: { trackingId: "APTDOM000001", appointmentStatus: "completed" } });
    await waitFor(() => expect(server.agendaInputs).toHaveLength(2));

    const upcoming = screen.getByText("Patient 2").closest<HTMLElement>(".rounded-lg")!;
    fireEvent.click(within(upcoming).getByRole("button", { name: "Annuler (praticien) et rembourser" }));
    expect(server.mutations.at(-1)).toEqual({ procedure: "refund", input: { trackingId: "APTDOM000002", reason: "Empêchement du praticien", initiator: "practitioner" } });
    await waitFor(() => expect(server.agendaInputs).toHaveLength(3));
  });
});
