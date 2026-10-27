// @vitest-environment happy-dom
import { createElement } from "react";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DATA-01 — écran d’une mission monté par React dans un DOM, ses lectures et
// l’association passant par React Query comme dans l’application : une
// mission supprimée pendant que l’écran est ouvert quitte l’écran (état vide,
// plus de bouton « Shortlister » refusé à chaque clic), même quand React Query
// garde les candidats lus avant le 404 ; supprimée ailleurs et vue à la
// relecture de ses candidats (retour sur l’onglet), elle quitte l’écran tout
// de suite, sans nouvel essai, avec un message, et la liste est relue sans
// elle ; une candidature effacée fait relire les candidats de la mission.

type Brief = { id: number; briefId: string; organizationName: string; specialtyNeeded: string; country: string; targetEnvironment: string; status: string; timeline: null; createdAt: string };
const server = vi.hoisted(() => ({
  briefs: [] as Brief[],
  candidates: new Map<number, Array<{ id: number; firstName: string; lastName: string }>>(),
  associate: vi.fn(),
  candidateReads: [] as number[],
  toasts: [] as Array<[string, string]>,
}));

/** A tRPC refusal as the client receives it: the message and the error's data. */
const refusal = (code: string, reason?: string) => Object.assign(new Error(`Refus du serveur (${reason ?? code}).`), { data: { code, ...(reason ? { reason } : {}) } });

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr" }) }));
vi.mock("sonner", () => ({ toast: Object.fromEntries(["success", "error"].map(kind => [kind, (message: string) => server.toasts.push([kind, message])])) }));
vi.mock("./Candidate360Dialog", () => ({ default: function Candidate360Dialog() { return null; } }));
vi.mock("@/lib/trpc", async () => {
  const { useMutation, useQuery, useQueryClient } = await import("@tanstack/react-query");
  const breakdown = { specialty: 35, mobility: 0, certifications: 0, languages: 0, experience: 0, availability: 0 };
  const readCandidates = async ({ briefId }: { briefId: number }) => {
    server.candidateReads.push(briefId);
    const brief = server.briefs.find(entry => entry.id === briefId);
    if (!brief) throw refusal("NOT_FOUND");
    const candidates = (server.candidates.get(briefId) ?? []).map(candidate => ({
      ...candidate, specialty: "Anesthésie-réanimation", availability: null, association: null, createdAt: "2026-10-20T10:00:00.000Z",
      match: { score: 35, reasons: [{ criterion: "specialty" }], breakdown, certifications: [], languages: [] },
    }));
    return { brief, candidates, shortlistedCount: 0, consentedCount: 0, ranking: { eligible: candidates.length, ranked: candidates.length }, pagination: { page: 0, limit: 25, total: candidates.length, totalPages: 1 } };
  };
  const idle = () => ({ mutate: () => undefined, isPending: false });
  return {
    trpc: {
      useUtils: () => {
        const client = useQueryClient();
        return {
          admin: {
            clientBriefs: {
              list: { invalidate: () => client.invalidateQueries({ queryKey: ["clientBriefs.list"] }) },
              candidates: { invalidate: (input?: object) => client.invalidateQueries({ queryKey: input ? ["clientBriefs.candidates", input] : ["clientBriefs.candidates"] }) },
            },
          },
        };
      },
      admin: {
        clientBriefs: {
          list: { useQuery: () => useQuery({ queryKey: ["clientBriefs.list"], queryFn: async () => server.briefs.map(brief => ({ ...brief })) }) },
          candidates: { useQuery: (input: { briefId: number }, options: { enabled: boolean }) => useQuery({ queryKey: ["clientBriefs.candidates", input], queryFn: () => readCandidates(input), ...options }) },
          updateStatus: { useMutation: idle },
          associateCandidate: { useMutation: (options: object) => useMutation({ mutationFn: (input: { briefId: number; applicationId: number }) => server.associate(input), ...options }) },
          setCandidateConsent: { useMutation: idle },
        },
        recruitment: { exportCsv: { useMutation: idle }, getDownloadUrl: { useMutation: idle } },
      },
    },
  };
});

const { default: EmployerBriefsTab } = await import("./EmployerBriefsTab");

const brief = (id: number, organizationName: string): Brief => ({ id, briefId: `BRIEF-${id}`, organizationName, specialtyNeeded: "Anesthésie-réanimation", country: "Émirats arabes unis", targetEnvironment: "Hôpital", status: "reviewing", timeline: null, createdAt: "2026-10-01T10:00:00.000Z" });
const EMPTY_STATE = "Shortlist assistée";
const MISSION_GONE = "Cette mission n’existe plus : elle a été supprimée entre-temps.";

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  render(createElement(QueryClientProvider, { client }, createElement(EmployerBriefsTab)));
  return client;
}
/** Opens a mission from the list on the left, as the admin does. */
async function openMission(organizationName: string) {
  const card = (await screen.findByText(organizationName)).closest("article")!;
  fireEvent.click(within(card).getByRole("button", { name: "Voir les profils" }));
}
const shortlistButtons = () => screen.queryAllByRole("button", { name: "Shortlister" });

beforeEach(() => {
  server.briefs = [brief(1, "Clinique du Nord"), brief(7, "Hôpital du Golfe")];
  server.candidates = new Map([[1, [{ id: 13, firstName: "Jean", lastName: "Martin" }]], [7, [{ id: 11, firstName: "Amal", lastName: "Haddad" }, { id: 12, firstName: "Lina", lastName: "Saleh" }]]]);
  server.associate = vi.fn(async () => ({ success: true }));
  server.candidateReads = [];
  server.toasts = [];
});
afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
});

describe("mission ou candidature disparue pendant que l’écran est ouvert (navigateur simulé, DATA-01)", () => {
  it("ferme la mission supprimée et affiche l’état vide, sans ses candidats ni ses boutons « Shortlister »", async () => {
    mount();
    // A mission seen first: its candidates stay in React Query's cache.
    await openMission("Clinique du Nord");
    await screen.findByText("Jean Martin");
    await openMission("Hôpital du Golfe");
    await screen.findByText("Amal Haddad");
    expect(shortlistButtons()).toHaveLength(2);
    expect(screen.queryByText(EMPTY_STATE)).toBeNull();

    // The mission is deleted elsewhere: the server refuses the association,
    // its candidates query now answers NOT_FOUND, the list no longer has it.
    server.briefs = server.briefs.filter(entry => entry.id !== 7);
    server.associate = vi.fn(async () => { throw refusal("NOT_FOUND", "association_brief_not_found"); });
    fireEvent.click(shortlistButtons()[0]!);

    await waitFor(() => expect(server.toasts).toEqual([["error", "Cette mission n’existe plus."]]));
    expect(server.associate).toHaveBeenCalledWith(expect.objectContaining({ briefId: 7, applicationId: 11, status: "shortlisted" }));
    expect(await screen.findByText(EMPTY_STATE)).toBeTruthy();
    // Said in the panel too, as when its candidates answer NOT_FOUND.
    expect(screen.getByRole("status").textContent).toBe(MISSION_GONE);
    await waitFor(() => expect(screen.queryByText("Hôpital du Golfe")).toBeNull());
    expect(screen.queryByText("Amal Haddad")).toBeNull();
    // Nor those of the mission seen before.
    expect(screen.queryByText("Jean Martin")).toBeNull();
    expect(shortlistButtons()).toHaveLength(0);
    // Still there, the other mission opens as before, without the message.
    await openMission("Clinique du Nord");
    expect(await screen.findByText("Jean Martin")).toBeTruthy();
    expect(screen.queryByText(MISSION_GONE)).toBeNull();
    expect(shortlistButtons()).toHaveLength(1);
  });

  it("ferme la mission dont la relecture répond NOT_FOUND, sans nouvel essai, avec un message et la liste relue sans elle", async () => {
    // React Query's default: 3 new tries, here without their wait.
    const client = mount(new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } }));
    await openMission("Hôpital du Golfe");
    await screen.findByText("Amal Haddad");
    expect(screen.getByRole("region", { name: "Détails du brief BRIEF-7" })).toBeTruthy();
    const readsBefore = server.candidateReads.length;

    // Deleted while the screen is open, seen at the next reading of its
    // candidates (React Query keeps the data read before the error).
    server.briefs = server.briefs.filter(entry => entry.id !== 7);
    await client.invalidateQueries({ queryKey: ["clientBriefs.candidates"] });

    expect(await screen.findByText(MISSION_GONE)).toBeTruthy();
    expect(screen.getByText(EMPTY_STATE)).toBeTruthy();
    expect(screen.queryByText("Amal Haddad")).toBeNull();
    expect(screen.queryByRole("region", { name: "Détails du brief BRIEF-7" })).toBeNull();
    expect(shortlistButtons()).toHaveLength(0);
    // The list is read again without it.
    await waitFor(() => expect(screen.queryByText("Hôpital du Golfe")).toBeNull());
    // One reading, never tried again.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(server.candidateReads.slice(readsBefore)).toEqual([7]);
    expect(server.associate).not.toHaveBeenCalled();
    expect(server.toasts).toEqual([]);

    // Another mission opens as before, without the message.
    await openMission("Clinique du Nord");
    expect(await screen.findByText("Jean Martin")).toBeTruthy();
    expect(screen.queryByText(MISSION_GONE)).toBeNull();
    expect(shortlistButtons()).toHaveLength(1);
  });

  it("ferme la mission supprimée pendant que l’admin était sur un autre onglet, à son retour", async () => {
    mount(new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } }));
    await openMission("Hôpital du Golfe");
    await screen.findByText("Amal Haddad");

    // Away on another tab while the mission is deleted, then back.
    act(() => focusManager.setFocused(false));
    server.briefs = server.briefs.filter(entry => entry.id !== 7);
    act(() => focusManager.setFocused(true));

    expect(await screen.findByText(MISSION_GONE)).toBeTruthy();
    expect(screen.getByText(EMPTY_STATE)).toBeTruthy();
    expect(screen.queryByText("Amal Haddad")).toBeNull();
    expect(shortlistButtons()).toHaveLength(0);
    await waitFor(() => expect(screen.queryByText("Hôpital du Golfe")).toBeNull());
    expect(screen.getByText("Clinique du Nord")).toBeTruthy();
  });

  it("relit les candidats de la mission après une candidature effacée, et garde la mission à l’écran", async () => {
    mount();
    await openMission("Hôpital du Golfe");
    await screen.findByText("Amal Haddad");
    const readsBefore = server.candidateReads.length;

    // Amal's application is erased meanwhile.
    server.candidates.set(7, [{ id: 12, firstName: "Lina", lastName: "Saleh" }]);
    server.associate = vi.fn(async () => { throw refusal("NOT_FOUND", "association_application_not_found"); });
    fireEvent.click(shortlistButtons()[0]!);

    await waitFor(() => expect(server.toasts).toEqual([["error", "Cette candidature n’existe plus : elle a peut-être été effacée."]]));
    await waitFor(() => expect(screen.queryByText("Amal Haddad")).toBeNull());
    expect(server.candidateReads.slice(readsBefore)).toEqual([7]);
    expect(screen.getByText("Lina Saleh")).toBeTruthy();
    expect(shortlistButtons()).toHaveLength(1);
    expect(screen.queryByText(EMPTY_STATE)).toBeNull();
  });

  it("laisse affichée la mission ouverte depuis, quand le refus concerne celle quittée pendant la requête", async () => {
    mount();
    await openMission("Hôpital du Golfe");
    await screen.findByText("Amal Haddad");

    let answer!: () => void;
    server.associate = vi.fn(() => new Promise((_resolve, reject) => { answer = () => reject(refusal("NOT_FOUND", "association_brief_not_found")); }));
    fireEvent.click(shortlistButtons()[0]!);
    await waitFor(() => expect(server.associate).toHaveBeenCalledTimes(1));
    // The admin opens the other mission before the answer comes back.
    await openMission("Clinique du Nord");
    await screen.findByText("Jean Martin");
    server.briefs = server.briefs.filter(entry => entry.id !== 7);
    answer();

    await waitFor(() => expect(server.toasts).toEqual([["error", "Cette mission n’existe plus."]]));
    await waitFor(() => expect(screen.queryByText("Hôpital du Golfe")).toBeNull());
    expect(screen.getByText("Jean Martin")).toBeTruthy();
    expect(screen.queryByText(EMPTY_STATE)).toBeNull();
  });
});
