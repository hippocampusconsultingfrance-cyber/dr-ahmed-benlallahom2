// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-15 / ADM-14 — onglet Sécurité monté par React avec un faux tRPC : les
// catégories en phrases traduites, les filtres « Admin seulement » et
// « Avertissements et plus », les connexions candidats réussies masquées par
// défaut, la pagination, puis les sessions administrateur et « Révoquer
// toutes les autres sessions ».

type EventsInput = { limit: number; adminOnly: boolean; warningsAndAbove: boolean; includeCandidateSignIns: boolean; beforeId?: number };
type Session = { id: string; current: boolean; lastActiveAt: Date; browser: string | null; device: string | null; location: string | null };

const view = vi.hoisted(() => ({
  language: "fr",
  inputs: [] as EventsInput[],
  respond: (_input: EventsInput) => [] as Array<Record<string, unknown>>,
  sessions: [] as Session[],
  sessionsRead: 0,
  revoke: async (): Promise<{ revoked: number; notRevoked: number; securitySessions: number }> => ({ revoked: 0, notRevoked: 0, securitySessions: 0 }),
  revocations: 0,
}));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  return {
    trpc: {
      adminSecurity: {
        events: {
          useQuery: (input: EventsInput) => {
            const last = view.inputs.at(-1);
            if (JSON.stringify(last) !== JSON.stringify(input)) view.inputs.push(input);
            return { data: view.respond(input), isLoading: false, error: null };
          },
        },
        sessions: { useQuery: () => ({ data: view.sessions, isLoading: false, error: null, refetch: async () => { view.sessionsRead += 1; } }) },
        revokeOtherSessions: { useMutation: (options: object) => useMutation({ mutationFn: async () => { view.revocations += 1; return view.revoke(); }, ...options }) },
      },
    },
  };
});

const { default: SecurityOperationsTab, SECURITY_LOG_PAGE_SIZE } = await import("./SecurityOperationsTab");

const createdAt = new Date("2026-11-12T09:30:00Z");
const event = (id: number, category: string, extra: Record<string, unknown> = {}) => ({ id, actorKind: "admin", category, outcome: "allowed", severity: "info", createdAt, counts: null, ...extra });

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(SecurityOperationsTab)));
}

const filters = () => within(screen.getByRole("group", { name: "Filtres du journal" }));

beforeEach(() => {
  view.language = "fr";
  view.inputs = [];
  view.respond = () => [];
  view.sessions = [];
  view.sessionsRead = 0;
  view.revocations = 0;
  view.revoke = async () => ({ revoked: 0, notRevoked: 0, securitySessions: 0 });
});
afterEach(cleanup);

describe("ADM-15 — journal de sécurité lisible", () => {
  it("nomme chaque évènement par une phrase dans la langue de l’administration, sans code technique", () => {
    view.respond = () => [
      event(3, "admin_mfa_verify", { outcome: "failed", severity: "high" }),
      event(2, "admin_mfa_verify"),
      event(1, "candidate_login_rate_limited", { actorKind: "anonymous", outcome: "blocked", severity: "warning" }),
    ];
    mount();
    expect(screen.getByText("Code de sécurité admin erroné ou expiré")).toBeTruthy();
    expect(screen.getByText("Connexion admin validée par le code de sécurité")).toBeTruthy();
    expect(screen.getByText("Trop d’essais de connexion candidat — bloqué")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/admin mfa|candidate login|_/);
    cleanup();

    view.language = "en";
    mount();
    expect(screen.getByText("Wrong or expired admin security code")).toBeTruthy();
    expect(screen.getByText("Too many candidate sign-in attempts — blocked")).toBeTruthy();
  });

  it("masque par défaut les connexions candidats réussies, et filtre sur l’administrateur et la gravité", () => {
    mount();
    expect(view.inputs).toEqual([{ limit: SECURITY_LOG_PAGE_SIZE + 1, adminOnly: false, warningsAndAbove: false, includeCandidateSignIns: false }]);
    for (const name of ["Admin seulement", "Avertissements et plus", "Connexions candidats réussies"]) expect(filters().getByRole("button", { name }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(filters().getByRole("button", { name: "Admin seulement" }));
    expect(view.inputs.at(-1)).toMatchObject({ adminOnly: true, warningsAndAbove: false, includeCandidateSignIns: false });
    expect(filters().getByRole("button", { name: "Admin seulement" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(filters().getByRole("button", { name: "Avertissements et plus" }));
    expect(view.inputs.at(-1)).toMatchObject({ adminOnly: true, warningsAndAbove: true });

    fireEvent.click(filters().getByRole("button", { name: "Connexions candidats réussies" }));
    expect(view.inputs.at(-1)).toMatchObject({ includeCandidateSignIns: true });
    // A filter that finds nothing says so, rather than « nothing recorded yet ».
    expect(screen.getByText("Aucun événement ne correspond à ces filtres.")).toBeTruthy();
  });

  it("pagine le journal par 50, des plus récents aux plus anciens, et revient à la première page quand un filtre change", () => {
    // 51 events on the first page (ids 120 to 70): 50 shown, the 51st says an older page exists.
    view.respond = input => input.beforeId === undefined
      ? Array.from({ length: SECURITY_LOG_PAGE_SIZE + 1 }, (_, index) => event(120 - index, "admin_blocked_period_added"))
      : Array.from({ length: 3 }, (_, index) => event(input.beforeId! - 1 - index, "admin_bookings_suspended"));
    mount();
    expect(screen.getAllByText("Période bloquée dans les disponibilités")).toHaveLength(SECURITY_LOG_PAGE_SIZE);
    const pages = () => within(screen.getByRole("navigation", { name: "Pages du journal" }));
    expect(pages().getByRole("button", { name: "Événements plus récents" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(pages().getByRole("button", { name: "Événements plus anciens" }));
    // The page after the last event shown (71), the one beyond the page not skipped.
    expect(view.inputs.at(-1)).toMatchObject({ beforeId: 71 });
    expect(screen.getAllByText("Réservations en ligne suspendues")).toHaveLength(3);
    expect(pages().getByRole("button", { name: "Événements plus anciens" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(pages().getByRole("button", { name: "Événements plus récents" }));
    expect(view.inputs.at(-1)).not.toHaveProperty("beforeId");
    fireEvent.click(pages().getByRole("button", { name: "Événements plus anciens" }));
    fireEvent.click(filters().getByRole("button", { name: "Admin seulement" }));
    expect(view.inputs.at(-1)).toEqual({ limit: SECURITY_LOG_PAGE_SIZE + 1, adminOnly: true, warningsAndAbove: false, includeCandidateSignIns: false });
  });
});

describe("ADM-14 — sessions administrateur", () => {
  const sessions: Session[] = [
    { id: "sess_this", current: true, lastActiveAt: new Date("2026-11-12T09:30:00Z"), browser: "Firefox 140", device: "Macintosh", location: "Paris, FR" },
    { id: "sess_lost", current: false, lastActiveAt: new Date("2026-11-10T18:05:00Z"), browser: "Safari 19", device: "iPhone", location: "Lyon, FR" },
  ];

  it("liste les appareils connectés, celui-ci signalé, avec leur dernière activité à l’heure de Paris", () => {
    view.sessions = sessions;
    mount();
    const panel = within(screen.getByRole("region", { name: "Sessions administrateur actives" }));
    expect(panel.getByText("Firefox 140 · Macintosh · Paris, FR")).toBeTruthy();
    expect(panel.getByText("Cette session")).toBeTruthy();
    expect(panel.getByText("Safari 19 · iPhone · Lyon, FR")).toBeTruthy();
    expect(panel.getByText("Dernière activité 10/11/2026 19:05 (heure de Paris)")).toBeTruthy();
  });

  it("révoque les autres sessions et dit combien l’ont été", async () => {
    view.sessions = sessions;
    view.revoke = async () => ({ revoked: 1, notRevoked: 0, securitySessions: 1 });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Révoquer toutes les autres sessions" }));
    await waitFor(() => expect(screen.getByText("Sessions révoquées : 1").getAttribute("role")).toBe("status"));
    expect(view.revocations).toBe(1);
    expect(view.sessionsRead).toBe(1);
  });

  it("renvoie au tableau de bord Clerk pour une session que Clerk n’a pas révoquée, ou quand la révocation échoue", async () => {
    view.sessions = sessions;
    view.revoke = async () => ({ revoked: 1, notRevoked: 1, securitySessions: 0 });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Révoquer toutes les autres sessions" }));
    await waitFor(() => expect(screen.getByText(/^Sessions révoquées : 1\. Certaines sessions n’ont pas pu être révoquées : révoquez-les dans le tableau de bord Clerk \(Users, puis Sessions\)\.$/)).toBeTruthy());
    cleanup();

    view.revoke = async () => { throw new Error("Clerk down"); };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Révoquer toutes les autres sessions" }));
    await waitFor(() => expect(screen.getByText("La révocation a échoué : réessayez, ou révoquez les sessions dans le tableau de bord Clerk (Users, puis Sessions).")).toBeTruthy());
  });

  it("n’offre pas la révocation quand ce navigateur est la seule session", () => {
    view.sessions = [sessions[0]!];
    mount();
    expect(screen.getByRole("button", { name: "Révoquer toutes les autres sessions" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Aucune autre session active.")).toBeTruthy();
  });
});
