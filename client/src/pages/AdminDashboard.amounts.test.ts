import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Montants de l’administration écrits comme les emails et le toast du
// remboursement : « 100,00 € », pas « 100.00€ » (carte d’un rendez-vous, tuile
// des revenus, messages de remboursement, données d’une personne).

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

const view = vi.hoisted(() => ({
  stats: { appointments: 7, contacts: 2, gdpr: 1, revenue: "650.00" as string | number },
  items: [] as Array<Record<string, unknown>>,
}));

const mutation = () => ({ useMutation: () => ({ mutate: vi.fn(), isPending: false }) });
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/AdminAttentionPanel", () => ({ default: () => null }));
vi.mock("@/components/RecruitmentDashboardPanel", () => ({ default: () => null }));
vi.mock("@/lib/trpc", () => {
  const invalidate = { invalidate: vi.fn() };
  return {
    trpc: {
      useUtils: () => ({
        admin: { appointments: { list: invalidate }, stats: invalidate, attention: invalidate, contacts: { list: invalidate }, recruitment: { list: invalidate } },
        medicalQuestions: { admin: { list: invalidate } },
      }),
      useQueries: (build: (t: unknown) => unknown[]) => build({ admin: { appointments: { list: (input: unknown) => input } } })
        .map(() => ({ data: { items: view.items, total: view.items.length }, isLoading: false, error: null, refetch: vi.fn() })),
      admin: {
        stats: { useQuery: () => ({ data: view.stats, isLoading: false, error: null }) },
        appointments: {
          updateStatus: mutation(),
          refund: mutation(),
          refundUnconfirmedSession: mutation(),
          retryFulfillment: mutation(),
          invoicePdf: mutation(),
          updateCustomerEmail: mutation(),
        },
        personalData: { export: mutation(), erase: mutation() },
        recruitment: { erase: mutation() },
      },
    },
  };
});

const { AppointmentsTab, OverviewTab } = await import("./AdminDashboard");
const { PersonalDataResult } = await import("@/components/PersonalDataSearchPanel");

/** Regular spaces, as read on screen (Intl puts no-break spaces around the thousands and before €). */
const shown = (text: string) => text.replace(/\s/g, " ");

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    trackingId: "APTAMOUNT001",
    customerName: "Patient Test",
    customerEmail: "patient@example.test",
    customerPhone: "+33600000000",
    appointmentDate: new Date(Date.now() + 3 * 24 * 3_600_000).toISOString(),
    finalPrice: "150.00",
    language: "fr",
    paymentStatus: "completed",
    appointmentStatus: "confirmed",
    stripePaymentIntentId: "pi_amount",
    requestDetails: "",
    deliveries: [],
    invoiceNumber: null,
    ...overrides,
  };
}

beforeEach(() => {
  view.items = [];
  view.stats = { appointments: 7, contacts: 2, gdpr: 1, revenue: "650.00" };
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("montants au format français dans l’administration", () => {
  it("tuile des revenus : « 650,00 € », comme les emails, quel que soit le format reçu de la base", () => {
    expect(shown(renderToStaticMarkup(createElement(OverviewTab, { onNavigate: vi.fn() })))).toContain(">650,00 €<");
    view.stats = { ...view.stats, revenue: 1250.5 };
    expect(shown(renderToStaticMarkup(createElement(OverviewTab, { onNavigate: vi.fn() })))).toContain(">1 250,50 €<");
    view.stats = { ...view.stats, revenue: 0 };
    expect(shown(renderToStaticMarkup(createElement(OverviewTab, { onNavigate: vi.fn() })))).toContain(">0,00 €<");
  });

  it("carte d’un rendez-vous et messages de remboursement : « 150,00 € »", () => {
    view.items = [appointment(), appointment({ id: 2, trackingId: "APTAMOUNT002", finalPrice: "100.00" })];
    const tree = renderStateful(AppointmentsTab) as ReactElement;
    const html = shown(renderToStaticMarkup(tree));
    expect(html).toContain(">150,00 €<");
    expect(html).toContain(">100,00 €<");
    expect(html).not.toMatch(/\d\.\d\d ?€/);

    const prompt = vi.fn(() => null);
    vi.stubGlobal("window", { prompt, confirm: vi.fn(() => false) });
    const click = (label: string) => (elementsOf(tree).find(element => typeof element.props.onClick === "function" && renderToStaticMarkup(element as ReactElement).includes(label))!.props.onClick as () => void)();
    click("Annuler (praticien) et rembourser");
    click("Annulation patient (remboursement)");
    expect(prompt.mock.calls.map(([message]) => shown(String(message).split("\n")[0]!))).toEqual([
      "Annuler APTAMOUNT001 et rembourser intégralement 150,00 € au patient.",
      "Annulation demandée par le patient (plus de 24 h avant) : remboursement de 150,00 €.",
    ]);
  });

  it("données d’une personne : le rendez-vous et son montant", () => {
    const data = {
      email: "patient@example.test",
      contactMessages: [],
      medicalQuestions: [],
      gdprRequests: [],
      appointments: [{ id: 4, trackingId: "APTAMOUNT004", appointmentDate: new Date(2026, 8, 10), finalPrice: "100.00", paymentStatus: "completed", appointmentStatus: "completed", invoiceNumber: null }],
      recruitment: { applications: [], candidateAccountWithoutApplication: false },
      // Totals per table and rows an erasure would touch (RGPD-12).
      totals: { contactMessages: 0, medicalQuestions: 0, gdprRequests: 0, appointments: 1, recruitmentApplications: 0 },
      erasableRows: 1,
    };
    const html = shown(renderToStaticMarkup(createElement(PersonalDataResult, { data: data as never, onChanged: vi.fn() })));
    expect(html).toContain("· 100,00 €");
    expect(html).not.toContain("100.00");
  });
});
