// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Onglet Mailing monté par React dans un DOM, avec un faux tRPC : le retour
// affiché après un envoi ou une relance dit les échecs (ADM-MAIL-02), et la
// relance ne vise que les destinataires en échec de la campagne choisie.

type SendResult = { total: number; sent: number; failed: number };
type RetryResult = { attempted: number; sent: number; failed: number; skipped: number };
const view = vi.hoisted(() => ({
  campaigns: [] as unknown[],
  sendResult: { total: 0, sent: 0, failed: 0 } as SendResult,
  retryResult: { attempted: 0, sent: 0, failed: 0, skipped: 0 } as RetryResult,
  sent: [] as unknown[],
  retried: [] as unknown[],
  toasts: [] as Array<[string, string]>,
}));

vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  const fakeMutation = <T,>(calls: "sent" | "retried", result: () => T) => (options: object) => useMutation({ mutationFn: async (input: unknown) => { view[calls].push(input); return result(); }, ...options });
  return {
    trpc: {
      useUtils: () => ({ admin: { recruitment: { campaigns: { list: { invalidate: () => undefined } } } } }),
      admin: {
        recruitment: {
          campaigns: {
            previewAudience: { useQuery: () => ({ data: [{ id: 7, firstName: "Zoé", lastName: "Kowalska", specialty: "Anesthésie", aiScore: 82 }], isLoading: false }) },
            list: { useQuery: () => ({ data: view.campaigns, isLoading: false }) },
            send: { useMutation: fakeMutation("sent", () => view.sendResult) },
            retryFailed: { useMutation: fakeMutation("retried", () => view.retryResult) },
          },
        },
      },
    },
  };
});
vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "warning", "error", "info"].map(tone => [tone, (message: string) => view.toasts.push([tone, message])])),
}));

const { default: MailingTab } = await import("./MailingTab");
const { LanguageProvider } = await import("@/contexts/LanguageContext");

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(LanguageProvider, null, createElement(MailingTab, { initialSelectedIds: [] }))));
}

function campaign(id: number, retryable: number) {
  return { id, title: `Campagne ${id}`, subject: "Opportunité", language: "fr", recipientCount: 3, status: retryable ? "partially_sent" : "sent", createdAt: "2026-10-20T08:00:00.000Z", delivery: { total: 3, delivered: 3 - retryable, opened: 0, failed: retryable, delayed: 0, retryable } };
}

beforeEach(() => {
  localStorage.setItem("language", "fr");
  view.campaigns = [];
  view.sent = [];
  view.retried = [];
  view.toasts = [];
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Mailing : avertissement en cas d’échec et relance des seuls échecs (ADM-MAIL-02)", () => {
  it.each([
    [{ total: 3, sent: 3, failed: 0 }, "success", "Campagne terminée: 3/3."],
    [{ total: 3, sent: 2, failed: 1 }, "warning", "Campagne envoyée partiellement: 2/3 · 1 encore en échec."],
    [{ total: 3, sent: 0, failed: 3 }, "error", "Aucun email n’a pu être envoyé (3/3)."],
  ] as const)("après l’envoi %o, le retour est « %s »", async (result, tone, message) => {
    view.sendResult = result;
    mount();
    fireEvent.change(screen.getByPlaceholderText("Ex. Anesthésistes – Allemagne 2026"), { target: { value: "Anesthésistes – Canada" } });
    fireEvent.change(screen.getByPlaceholderText("Ex. Opportunité médicale internationale"), { target: { value: "Poste au Canada" } });
    fireEvent.change(screen.getByPlaceholderText(/Présentez la mission/), { target: { value: "Mission de six mois en anesthésie." } });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier avant envoi" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmer l’envoi" }));

    await waitFor(() => expect(view.toasts).toHaveLength(1));
    expect(view.sent).toEqual([expect.objectContaining({ mode: "all_eligible", title: "Anesthésistes – Canada", subject: "Poste au Canada", confirmed: true })]);
    const [[shownTone, shown]] = view.toasts;
    expect(shownTone).toBe(tone);
    expect(shown.startsWith(message)).toBe(true);
    if (result.failed) expect(shown).toContain("seuls les destinataires en échec seront recontactés");
  });

  it("ne propose la relance que pour une campagne avec des échecs, et ne relance que celle-là, après confirmation", async () => {
    view.campaigns = [campaign(41, 2), campaign(42, 0)];
    view.retryResult = { attempted: 2, sent: 1, failed: 1, skipped: 0 };
    mount();
    const retry = screen.getByRole("button", { name: "Relancer les échecs (2)" });
    expect(screen.getAllByRole("button", { name: /Relancer les échecs/ })).toHaveLength(1);

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(retry);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(view.retried).toEqual([]);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(retry);
    await waitFor(() => expect(view.toasts).toEqual([["warning", "Relance terminée: 1/2 · 1 encore en échec."]]));
    expect(view.retried).toEqual([{ campaignId: 41, confirmed: true }]);
  });
});
