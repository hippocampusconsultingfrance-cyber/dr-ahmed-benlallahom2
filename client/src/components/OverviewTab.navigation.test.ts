import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  elementsOf,
  renderStateful,
  resetStatefulHooks,
} from "@/testing/statefulRender";

// Raccourcis de la vue d’ensemble, telle que le tableau de bord la monte :
// « Ouvrir les réservations » du panneau À traiter, les cartes de ce qui
// attend une action et des indicateurs (ADM-06), puis les accès rapides
// Candidatures et Missions, ouvrent chacun leur onglet dans le tableau de bord.

vi.mock("react", async importOriginal =>
  (await import("@/testing/statefulRender")).withStatefulHooks(
    await importOriginal()
  )
);
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { name: "Dr Ahmed", role: "admin" },
    loading: false,
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("@clerk/react", () => ({
  SignInButton: () => null,
  UserButton: () => null,
}));
// The section lives in the address (ADM-09): a navigation to /admin?… changes the search the dashboard reads.
const address = vi.hoisted(() => ({ search: "" }));
vi.mock("wouter", () => ({
  useLocation: () => [
    "/admin",
    (path: string) => {
      address.search = path.split("?")[1] ?? "";
    },
  ],
  useSearch: () => address.search,
  Link: function Link() {
    return null;
  },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    adminSecurity: {
      status: {
        useQuery: () => ({
          isLoading: false,
          data: { verified: true },
          refetch: vi.fn(),
        }),
      },
      begin: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      verify: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    admin: {
      stats: {
        useQuery: () => ({
          data: {
            appointments: {
              today: 3,
              tomorrow: 1,
              upcomingWeek: { count: 6, lastDay: "2026-11-13" },
            },
            medicalQuestions: {
              open: 2,
              oldestReceivedAt: new Date("2026-10-20T08:00:00Z"),
              recentAnswers: { count: 3, averageResponseMs: 3_600_000 },
            },
            unreadMessages: 1,
            gdprRequests: { open: 0, nextDeadline: null },
            documentsToReview: 0,
            applications: { new: 2, lastWeek: 3, lastFourWeeks: 8 },
            bookingConversion: { started: 10, paid: 7 },
            revenue: {
              currentMonth: { month: "2026-11", amount: "300.00" },
              previousMonth: { month: "2026-10", amount: "0.00" },
            },
          },
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

const { default: AdminDashboard } = await import("@/pages/AdminDashboard");
const { default: OverviewTab } = await import("./OverviewTab");
const { default: AppointmentsTab } = await import("./AppointmentsTab");
const { default: MedicalQuestionsAdminTab } = await import(
  "./MedicalQuestionsAdminTab"
);
const { default: ContactsTab } = await import("./ContactsTab");
const { default: GdprTab } = await import("./GdprTab");
// Candidatures and Missions are loaded on demand: the dashboard mounts their lazy components.
const { CandidateDocumentsAdminTab, RecruitmentTab, EmployerBriefsTab } =
  await import("@/pages/adminLazyTabs");
const { default: AdminAttentionPanel } = await import("./AdminAttentionPanel");

const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object))
    return textOf((node as { props: { children?: unknown } }).props.children);
  return "";
};
const render = () => renderStateful(AdminDashboard) as ReactElement;
const sections = (tree: ReactElement) =>
  elementsOf(tree).map(element => element.type);
const currentTab = (tree: ReactElement) =>
  elementsOf(tree)
    .filter(
      element =>
        element.type === "button" && element.props["aria-current"] === "page"
    )
    .map(element => textOf(element).trim());
/** The overview the dashboard mounts, called with the props the dashboard gives it. */
const overview = (tree: ReactElement) =>
  OverviewTab(
    elementsOf(tree).find(element => element.type === OverviewTab)!
      .props as Parameters<typeof OverviewTab>[0]
  );
const shortcut = (label: string) => (tree: ReactElement) =>
  (
    elementsOf(tree).find(
      element =>
        element.type === "button" && textOf(element).trim().startsWith(label)
    )!.props.onClick as () => void
  )();
/** A card of what waits for an action: its figure, then its label. */
const card = (label: string) => (tree: ReactElement) =>
  (
    elementsOf(tree).find(
      element => element.type === "button" && textOf(element).includes(label)
    )!.props.onClick as () => void
  )();
const attentionPanel = (tree: ReactElement) =>
  (
    elementsOf(tree).find(element => element.type === AdminAttentionPanel)!
      .props.onOpenAppointments as () => void
  )();

afterEach(() => resetStatefulHooks());

describe("raccourcis de la vue d’ensemble", () => {
  it("ouvrent Réservations, Questions santé, Messages, RGPD, Documents candidats, Candidatures et Missions dans le tableau de bord", () => {
    for (const [open, label, section] of [
      [attentionPanel, "Réservations", AppointmentsTab],
      [card("Rendez-vous demain"), "Réservations", AppointmentsTab],
      [
        card("Questions santé à répondre"),
        "Questions santé",
        MedicalQuestionsAdminTab,
      ],
      [card("Messages non lus"), "Messages", ContactsTab],
      [card("Demandes RGPD ouvertes"), "RGPD", GdprTab],
      [
        card("Documents candidats à revoir"),
        "Documents candidats",
        CandidateDocumentsAdminTab,
      ],
      [card("Nouvelles candidatures"), "Candidatures", RecruitmentTab],
      [
        card("Délai moyen de réponse aux questions"),
        "Questions santé",
        MedicalQuestionsAdminTab,
      ],
      [shortcut("Candidatures"), "Candidatures", RecruitmentTab],
      [shortcut("Missions"), "Missions", EmployerBriefsTab],
    ] as const) {
      resetStatefulHooks();
      address.search = "";
      const before = render();
      expect(currentTab(before)).toEqual(["Vue d'ensemble"]);
      open(overview(before));

      const after = render();
      expect(currentTab(after)).toEqual([label]);
      expect(sections(after)).toContain(section);
      expect(sections(after)).not.toContain(OverviewTab);
    }
  });
});
