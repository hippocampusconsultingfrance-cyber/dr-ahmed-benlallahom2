import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Accès au tableau de bord rendu comme dans le navigateur : connexion Clerk,
// rôle administrateur, puis double authentification avant toute section ; les
// onglets, dans leur ordre, sans section Actualités.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type User = { name: string; role: "admin" | "user" };
const view = vi.hoisted(() => ({
  auth: { user: null as null | User, loading: false },
  refresh: vi.fn(),
  logout: vi.fn(async () => undefined),
  security: { isLoading: false, data: undefined as undefined | { verified: boolean } },
  securityQueries: [] as Array<{ enabled: boolean }>,
  begin: vi.fn(),
  verify: vi.fn(),
  navigations: [] as string[],
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ ...view.auth, refresh: view.refresh, logout: view.logout }) }));
vi.mock("@clerk/react", () => ({
  SignInButton: function SignInButton({ children }: { children: unknown }) { return children; },
  UserButton: function UserButton() { return null; },
}));
vi.mock("wouter", () => ({ useLocation: () => ["/admin", (path: string) => view.navigations.push(path)] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    adminSecurity: {
      status: { useQuery: (_input: unknown, options: { enabled: boolean }) => { view.securityQueries.push(options); return { ...view.security, refetch: vi.fn() }; } },
      begin: { useMutation: () => ({ mutate: view.begin, isPending: false }) },
      verify: { useMutation: () => ({ mutate: view.verify, isPending: false }) },
    },
  },
}));

const { default: AdminDashboard, OverviewTab, AppointmentsTab, ContactsTab, GdprTab } = await import("./AdminDashboard");
const { default: AdminConfigurationBanner } = await import("@/components/AdminConfigurationBanner");
const { default: MedicalQuestionsAdminTab } = await import("@/components/MedicalQuestionsAdminTab");
const { default: RecruitmentTab } = await import("@/components/RecruitmentTab");
const { SignInButton } = await import("@clerk/react");

const render = () => renderStateful(AdminDashboard) as ReactElement;
const elements = (tree: ReactElement) => elementsOf(tree);
const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as { props: { children?: unknown } }).props.children);
  return "";
};
const allText = (tree: ReactElement) => textOf(tree);
const buttonNamed = (tree: ReactElement, label: string) => elements(tree).find(element => typeof element.props.onClick === "function" && textOf(element).trim() === label);
const renderedTabs = (tree: ReactElement) => elements(tree).map(element => element.type).filter(type => typeof type === "function");
const tabNav = (tree: ReactElement) => elements(tree).find(element => element.props["aria-label"] === "Navigation des sections d’administration")!;
const tabButtons = (tree: ReactElement) => elementsOf(tabNav(tree).props.children).filter(element => element.type === "button");

beforeEach(() => {
  view.auth = { user: { name: "Dr Ahmed", role: "admin" }, loading: false };
  view.security = { isLoading: false, data: { verified: true } };
  view.securityQueries = [];
  view.navigations = [];
  vi.clearAllMocks();
});
afterEach(() => resetStatefulHooks());

describe("accès au tableau de bord", () => {
  it("demande la connexion Clerk au visiteur non connecté, sans rien interroger d’administratif", () => {
    view.auth = { user: null, loading: false };
    const tree = render();

    const signIn = elements(tree).find(element => element.type === SignInButton)!;
    expect(signIn.props).toMatchObject({ mode: "modal", forceRedirectUrl: "/admin" });
    expect(allText(tree)).toContain("Connexion administrateur requise");
    expect(view.securityQueries.at(-1)).toMatchObject({ enabled: false });
    expect(renderedTabs(tree)).not.toContain(OverviewTab);
  });

  it("attend la session sans montrer de section", () => {
    view.auth = { user: null, loading: true };
    const tree = render();
    expect(elements(tree).find(element => element.type === SignInButton)).toBeUndefined();
    expect(renderedTabs(tree)).not.toContain(OverviewTab);
  });

  it("refuse un compte connecté qui n’est pas administrateur et lui propose d’actualiser son accès", () => {
    view.auth = { user: { name: "Visiteur", role: "user" }, loading: false };
    const tree = render();

    expect(allText(tree)).toContain("Accès refusé");
    expect(view.securityQueries.at(-1)).toMatchObject({ enabled: false });
    expect(renderedTabs(tree)).not.toContain(OverviewTab);
    (buttonNamed(tree, "Actualiser l’accès")!.props.onClick as () => void)();
    expect(view.refresh).toHaveBeenCalledTimes(1);
  });

  it("exige la double authentification de l’administrateur avant toute section", () => {
    view.security = { isLoading: false, data: { verified: false } };
    let tree = render();

    expect(view.securityQueries.at(-1)).toMatchObject({ enabled: true });
    expect(allText(tree)).toContain("Validation de sécurité");
    expect(renderedTabs(tree)).not.toContain(OverviewTab);
    expect(renderedTabs(tree)).not.toContain(AdminConfigurationBanner);

    (buttonNamed(tree, "Envoyer un code de sécurité")!.props.onClick as () => void)();
    expect(view.begin).toHaveBeenCalledTimes(1);

    const codeInput = () => elements(render()).find(element => element.props.id === "admin-mfa-code")!;
    const validate = () => buttonNamed(render(), "Valider le code")!;
    expect(validate().props.disabled).toBe(true);
    (codeInput().props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "12a-34 56" } });
    tree = render();
    expect(codeInput().props.value).toBe("123456");
    expect(validate().props.disabled).toBe(false);
    (validate().props.onClick as () => void)();
    expect(view.verify).toHaveBeenCalledWith({ code: "123456" });
  });

  it("n’affiche aucune section pendant la vérification de sécurité", () => {
    view.security = { isLoading: true, data: undefined };
    expect(renderedTabs(render())).not.toContain(OverviewTab);
  });
});

describe("navigation de l’administration", () => {
  it("ouvre la vue d’ensemble avec le bandeau de configuration, une fois la double authentification validée", () => {
    const tree = render();
    expect(renderedTabs(tree)).toEqual(expect.arrayContaining([AdminConfigurationBanner, OverviewTab]));
    expect(renderedTabs(tree)).not.toContain(AppointmentsTab);
  });

  it("présente les onglets dans l’ordre, Questions santé entre Messages et RGPD, sans onglet Blog", () => {
    const labels = tabButtons(render()).map(button => textOf(button).trim());
    expect(labels).toEqual([
      "Vue d'ensemble", "Réservations", "Messages", "Questions santé", "RGPD", "Témoignages", "Disponibilités",
      "Candidatures", "Documents candidats", "Sécurité", "Vivier", "Mailing", "Missions",
    ]);
    const options = elements(render()).filter(element => element.type === "option").map(option => textOf(option));
    expect(options).toEqual(labels);
  });

  it("marque l’onglet courant et affiche sa section", () => {
    const tree = render();
    expect(tabButtons(tree).filter(button => button.props["aria-current"] === "page").map(button => textOf(button).trim())).toEqual(["Vue d'ensemble"]);

    for (const [label, section] of [["Messages", ContactsTab], ["Questions santé", MedicalQuestionsAdminTab], ["RGPD", GdprTab], ["Candidatures", RecruitmentTab]] as const) {
      (tabButtons(render()).find(button => textOf(button).trim() === label)!.props.onClick as () => void)();
      const after = render();
      expect(tabButtons(after).filter(button => button.props["aria-current"] === "page").map(button => textOf(button).trim())).toEqual([label]);
      expect(renderedTabs(after)).toContain(section);
      expect(renderedTabs(after)).not.toContain(OverviewTab);
    }
  });

  it("change de section depuis le sélecteur compact du mobile", () => {
    const select = elements(render()).find(element => element.props.id === "admin-active-tab")!;
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "appointments" } });
    const tree = render();
    expect(elements(tree).find(element => element.props.id === "admin-active-tab")!.props.value).toBe("appointments");
    expect(renderedTabs(tree)).toContain(AppointmentsTab);
  });
});
