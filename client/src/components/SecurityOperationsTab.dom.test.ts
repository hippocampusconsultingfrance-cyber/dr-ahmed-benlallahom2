// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-15 / ADM-14 — onglet Sécurité monté par React avec un faux tRPC : les
// catégories en phrases traduites, les filtres « Admin seulement » et
// « Avertissements et plus », les connexions candidats réussies masquées par
// défaut, la pagination, puis les sessions administrateur, « Révoquer
// toutes les autres sessions » et les codes de secours.

type EventsInput = { limit: number; adminOnly: boolean; warningsAndAbove: boolean; includeCandidateSignIns: boolean; beforeId?: number };
type Session = { id: string; current: boolean; lastActiveAt: Date; browser: string | null; device: string | null; location: string | null };
type Revocation = { revoked: number; notRevoked: number; securitySessions: number; clerkUnavailable: boolean };

const view = vi.hoisted(() => ({
  language: "fr",
  inputs: [] as EventsInput[],
  respond: (_input: EventsInput) => [] as Array<Record<string, unknown>>,
  recentHigh: 0,
  sessions: [] as Session[],
  sessionsError: null as null | Error,
  sessionsRead: 0,
  revoke: async (): Promise<Revocation> => ({ revoked: 0, notRevoked: 0, securitySessions: 0, clerkUnavailable: false }),
  revocations: 0,
  backupStatus: { remaining: 0, generatedAt: null as Date | null },
  regenerate: async (): Promise<{ codes: string[] }> => ({ codes: [] }),
  regenerations: 0,
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
        recentHighEvents: { useQuery: () => ({ data: { count: view.recentHigh }, isLoading: false, error: null }) },
        sessions: { useQuery: () => ({ data: view.sessionsError ? undefined : view.sessions, isLoading: false, error: view.sessionsError, refetch: async () => { view.sessionsRead += 1; } }) },
        revokeOtherSessions: { useMutation: (options: object) => useMutation({ mutationFn: async () => { view.revocations += 1; return view.revoke(); }, ...options }) },
        backupCodes: { useQuery: () => ({ data: view.backupStatus, isLoading: false, error: null, refetch: async () => undefined }) },
        regenerateBackupCodes: { useMutation: (options: object) => useMutation({ mutationFn: async () => { view.regenerations += 1; return view.regenerate(); }, ...options }) },
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
  view.recentHigh = 0;
  view.sessions = [];
  view.sessionsError = null;
  view.sessionsRead = 0;
  view.revocations = 0;
  view.revoke = async () => ({ revoked: 0, notRevoked: 0, securitySessions: 0, clerkUnavailable: false });
  view.backupStatus = { remaining: 0, generatedAt: null };
  view.regenerate = async () => ({ codes: [] });
  view.regenerations = 0;
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

  it("ne dit le journal vide que lorsque rien n’est masqué, les connexions candidats réussies l’étant par défaut", () => {
    mount();
    expect(screen.getByText("Aucun événement ne correspond à ces filtres.")).toBeTruthy();
    expect(screen.queryByText("Aucun événement de sécurité n’est encore enregistré.")).toBeNull();
    fireEvent.click(filters().getByRole("button", { name: "Connexions candidats réussies" }));
    expect(screen.getByText("Aucun événement de sécurité n’est encore enregistré.")).toBeTruthy();
  });

  it("compte les événements élevés des dernières 24 heures sur tout le journal, quels que soient les filtres et la page", () => {
    view.recentHigh = 3;
    // The page shown holds none: the administrator's own events, older ones.
    view.respond = () => [event(5, "admin_mfa_verify")];
    mount();
    const banner = "3 événement(s) élevé(s) ou critique(s) à examiner sur les dernières 24 heures";
    expect(screen.getByText(banner)).toBeTruthy();
    fireEvent.click(filters().getByRole("button", { name: "Admin seulement" }));
    expect(screen.getByText(banner)).toBeTruthy();
    cleanup();

    view.recentHigh = 0;
    view.respond = () => [event(5, "admin_mfa_verify", { outcome: "failed", severity: "high" })];
    mount();
    expect(screen.getByText("Aucun événement élevé ou critique sur les dernières 24 heures")).toBeTruthy();
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

  it("révoque les autres sessions et dit combien l’ont été, codes de sécurité compris", async () => {
    view.sessions = sessions;
    view.revoke = async () => ({ revoked: 1, notRevoked: 0, securitySessions: 1, clerkUnavailable: false });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Révoquer toutes les autres sessions" }));
    await waitFor(() => expect(screen.getByText("Sessions révoquées : 1 · Codes de sécurité d’autres appareils annulés : 1").getAttribute("role")).toBe("status"));
    expect(view.revocations).toBe(1);
    expect(view.sessionsRead).toBe(1);
  });

  it("renvoie au tableau de bord Clerk pour une session que Clerk n’a pas révoquée, ou quand la révocation échoue", async () => {
    view.sessions = sessions;
    view.revoke = async () => ({ revoked: 1, notRevoked: 1, securitySessions: 0, clerkUnavailable: false });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Révoquer toutes les autres sessions" }));
    await waitFor(() => expect(screen.getByText("Sessions révoquées : 1 · Codes de sécurité d’autres appareils annulés : 0. Certaines sessions n’ont pas pu être révoquées : révoquez-les dans le tableau de bord Clerk (Users, puis Sessions).")).toBeTruthy());
    cleanup();

    // Clerk did not answer: the other devices' security codes are cancelled all the same.
    view.revoke = async () => ({ revoked: 0, notRevoked: 0, securitySessions: 2, clerkUnavailable: true });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Révoquer toutes les autres sessions" }));
    await waitFor(() => expect(screen.getByText("Codes de sécurité d’autres appareils annulés : 2. Clerk n’a pas répondu : révoquez les sessions dans le tableau de bord Clerk (Users, puis Sessions).")).toBeTruthy());
    cleanup();

    view.revoke = async () => { throw new Error("Clerk down"); };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Révoquer toutes les autres sessions" }));
    await waitFor(() => expect(screen.getByText("La révocation a échoué : réessayez, ou révoquez les sessions dans le tableau de bord Clerk (Users, puis Sessions).")).toBeTruthy());
  });

  it("offre la révocation même quand Clerk ne liste que ce navigateur, pour les codes de sécurité des autres appareils", async () => {
    view.sessions = [sessions[0]!];
    view.revoke = async () => ({ revoked: 0, notRevoked: 0, securitySessions: 1, clerkUnavailable: false });
    mount();
    expect(screen.getByText("Aucune autre session active.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Révoquer toutes les autres sessions" });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText("Sessions révoquées : 0 · Codes de sécurité d’autres appareils annulés : 1")).toBeTruthy());
    expect(view.revocations).toBe(1);
    cleanup();

    // Clerk cannot be read: the list says so, the button stays offered.
    view.sessionsError = new Error("Clerk down");
    mount();
    expect(screen.getByText("Impossible de lire les sessions auprès de Clerk : révoquez-les au besoin dans le tableau de bord Clerk (Users, puis Sessions).")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Révoquer toutes les autres sessions" }).hasAttribute("disabled")).toBe(false);
  });
});

describe("ADM-14 — codes de secours", () => {
  const codes = ["K7QM2-XH9TD", "3RZVB-PQ8NC", "MW4HA-2TKXE", "9DFJS-YV6RG", "BN5QT-ZC3HW", "XA7KM-4PRDV", "HT2WC-8NQZB", "6YGVE-KM3TS", "QP9RD-WB5AX", "ZV4NT-7HCMJ"];
  const panel = () => within(screen.getByRole("region", { name: "Codes de secours" }));

  it("génère les dix premiers codes, les montre une seule fois, puis les cache", async () => {
    view.regenerate = async () => ({ codes });
    mount();
    expect(panel().getByText("Aucun code de secours n’a encore été généré.")).toBeTruthy();
    fireEvent.click(panel().getByRole("button", { name: "Générer des codes de secours" }));
    const list = await waitFor(() => panel().getByRole("list", { name: "Nouveaux codes de secours" }));
    expect(within(list).getAllByRole("listitem").map(item => item.textContent)).toEqual(codes);
    expect(panel().getByText("Notez ces codes maintenant : ils ne seront plus affichés. Chacun ne sert qu’une fois, et les anciens codes ne fonctionnent plus.")).toBeTruthy();
    fireEvent.click(panel().getByRole("button", { name: "J’ai noté ces codes" }));
    expect(panel().queryByRole("list")).toBeNull();
    expect(document.body.textContent).not.toContain(codes[0]);
  });

  it("dit combien il en reste, et ne les remplace qu’après confirmation", async () => {
    view.backupStatus = { remaining: 9, generatedAt: new Date("2026-11-10T18:05:00Z") };
    view.regenerate = async () => ({ codes });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    mount();
    expect(panel().getByText("Codes de secours restants : 9 / 10 · générés le 10/11/2026 19:05 (heure de Paris)")).toBeTruthy();
    const replace = panel().getByRole("button", { name: "Remplacer les codes de secours" });
    fireEvent.click(replace);
    expect(confirm).toHaveBeenLastCalledWith("Remplacer les codes de secours ? Les codes actuels cesseront de fonctionner.");
    expect(view.regenerations).toBe(0);
    fireEvent.click(replace);
    await waitFor(() => expect(panel().getAllByRole("listitem")).toHaveLength(10));
    expect(view.regenerations).toBe(1);
    confirm.mockRestore();
  });

  it("dit quand les codes n’ont pas pu être générés", async () => {
    view.regenerate = async () => { throw new Error("database down"); };
    mount();
    fireEvent.click(panel().getByRole("button", { name: "Générer des codes de secours" }));
    await waitFor(() => expect(panel().getByText("Les codes de secours n’ont pas pu être générés : réessayez.").getAttribute("role")).toBe("status"));
  });
});
