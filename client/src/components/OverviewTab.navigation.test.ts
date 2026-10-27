import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Raccourcis de la vue d’ensemble, telle que le tableau de bord la monte :
// « Ouvrir les réservations » du panneau À traiter, puis les accès rapides
// Candidatures et Missions, ouvrent chacun leur onglet dans le tableau de bord.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "Dr Ahmed", role: "admin" }, loading: false, refresh: vi.fn(), logout: vi.fn() }) }));
vi.mock("@clerk/react", () => ({ SignInButton: () => null, UserButton: () => null }));
vi.mock("wouter", () => ({ useLocation: () => ["/admin", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    adminSecurity: {
      status: { useQuery: () => ({ isLoading: false, data: { verified: true }, refetch: vi.fn() }) },
      begin: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      verify: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    admin: { stats: { useQuery: () => ({ data: { appointments: 3, contacts: 1, gdpr: 0, revenue: "300.00" }, isLoading: false, error: null }) } },
  },
}));

const { default: AdminDashboard } = await import("@/pages/AdminDashboard");
const { default: OverviewTab } = await import("./OverviewTab");
const { default: AppointmentsTab } = await import("./AppointmentsTab");
const { default: RecruitmentTab } = await import("./RecruitmentTab");
const { default: EmployerBriefsTab } = await import("./EmployerBriefsTab");
const { default: AdminAttentionPanel } = await import("./AdminAttentionPanel");

const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as { props: { children?: unknown } }).props.children);
  return "";
};
const render = () => renderStateful(AdminDashboard) as ReactElement;
const sections = (tree: ReactElement) => elementsOf(tree).map(element => element.type);
const currentTab = (tree: ReactElement) => elementsOf(tree).filter(element => element.type === "button" && element.props["aria-current"] === "page").map(element => textOf(element).trim());
/** The overview the dashboard mounts, called with the props the dashboard gives it. */
const overview = (tree: ReactElement) => OverviewTab(elementsOf(tree).find(element => element.type === OverviewTab)!.props as Parameters<typeof OverviewTab>[0]);
const shortcut = (label: string) => (tree: ReactElement) => (elementsOf(tree).find(element => element.type === "button" && textOf(element).trim().startsWith(label))!.props.onClick as () => void)();
const attentionPanel = (tree: ReactElement) => (elementsOf(tree).find(element => element.type === AdminAttentionPanel)!.props.onOpenAppointments as () => void)();

afterEach(() => resetStatefulHooks());

describe("raccourcis de la vue d’ensemble", () => {
  it("ouvrent Réservations, Candidatures et Missions dans le tableau de bord", () => {
    for (const [open, label, section] of [[attentionPanel, "Réservations", AppointmentsTab], [shortcut("Candidatures"), "Candidatures", RecruitmentTab], [shortcut("Missions"), "Missions", EmployerBriefsTab]] as const) {
      resetStatefulHooks();
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
