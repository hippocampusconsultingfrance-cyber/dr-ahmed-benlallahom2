// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Porte de double authentification de l’administration, montée par React dans
// un DOM : aucune section tant que le serveur ne déclare pas la session
// vérifiée, demande du code, saisie limitée aux chiffres, code refusé puis
// accepté, et alors seulement les sections. Le statut et les deux appels de
// sécurité passent par React Query comme dans l’application ; les autres
// procédures restent en chargement.

type User = { name: string; role: "admin" | "user" };
const server = vi.hoisted(() => ({
  user: null as null | User,
  verified: false,
  code: "123456",
  statusReads: 0,
  begin: vi.fn(),
  verifyAttempts: [] as string[],
  toasts: [] as Array<[string, string]>,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: server.user, loading: false, refresh: vi.fn(), logout: vi.fn(async () => undefined) }) }));
vi.mock("@clerk/react", () => ({ SignInButton: ({ children }: { children: unknown }) => children, UserButton: () => null }));
vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "error", "warning", "info"].map(kind => [kind, (message: string) => server.toasts.push([kind, message])])),
}));
vi.mock("@/lib/trpc", async () => {
  const { useMutation, useQuery } = await import("@tanstack/react-query");
  const loading = { data: undefined, isLoading: true, isPending: true, isFetching: true, isError: false, error: null, hasNextPage: false, refetch: async () => ({}), fetchNextPage: async () => ({}) };
  const idle = { mutate: () => undefined, mutateAsync: async () => undefined, isPending: false, reset: () => undefined };
  /** Every procedure other than the security ones: still loading, and its mutations do nothing. */
  const procedures = (): unknown => new Proxy(() => undefined, {
    get: (_target, key) => key === "useQuery" || key === "useInfiniteQuery" ? () => loading : key === "useMutation" ? () => idle : procedures(),
  });
  const adminSecurity = {
    // The security tab's journal, still loading.
    events: { useQuery: () => loading },
    status: {
      useQuery: (_input: unknown, options: { enabled: boolean }) => useQuery({
        queryKey: ["adminSecurity.status"],
        queryFn: async () => { server.statusReads += 1; return { verified: server.verified }; },
        enabled: options.enabled,
      }),
    },
    begin: { useMutation: (options: object) => useMutation({ mutationFn: async () => { server.begin(); return { sent: true }; }, ...options }) },
    verify: {
      useMutation: (options: object) => useMutation({
        mutationFn: async ({ code }: { code: string }) => {
          server.verifyAttempts.push(code);
          if (code !== server.code) throw new Error("Code de sécurité invalide ou expiré.");
          server.verified = true;
          return { verified: true };
        },
        ...options,
      }),
    },
  };
  return { trpc: new Proxy({}, { get: (_target, key) => key === "adminSecurity" ? adminSecurity : key === "useUtils" ? () => procedures() : procedures() }) };
});

const { default: AdminDashboard } = await import("./AdminDashboard");
const { LanguageProvider } = await import("@/contexts/LanguageContext");

const NAVIGATION = "Navigation des sections d’administration";

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(AdminDashboard)));
}
/** The dashboard in the site's language provider, as App.tsx mounts it (A11Y-13). */
function mountInSiteLanguage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(LanguageProvider, null, createElement(AdminDashboard))));
}
/** Language a screen reader reads an element in: that of its nearest ancestor saying one. */
const languageOf = (element: Element) => element.closest("[lang]")?.getAttribute("lang");
const codeField = () => document.getElementById("admin-mfa-code") as HTMLInputElement;
const validateButton = () => screen.getByRole("button", { name: "Valider le code" });

beforeEach(() => {
  server.user = { name: "Dr Ahmed", role: "admin" };
  server.verified = false;
  server.code = "123456";
  server.statusReads = 0;
  server.begin = vi.fn();
  server.verifyAttempts = [];
  server.toasts = [];
  // The dashboard reads its section from the address (ADM-09): each test starts on /admin.
  window.history.replaceState(null, "", "/admin");
});
afterEach(() => cleanup());

describe("double authentification de l’administration (navigateur simulé)", () => {
  it("ne montre aucune section avant la validation du code, puis ouvre l’administration", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Validation de sécurité" })).toBeTruthy();
    expect(screen.queryByLabelText(NAVIGATION)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Envoyer un code de sécurité" }));
    await waitFor(() => expect(server.begin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(server.toasts).toContainEqual(["success", "Un code de sécurité a été envoyé à votre email administrateur."]));

    // Only digits are kept, and the code is sent once it has six of them.
    expect(validateButton()).toHaveProperty("disabled", true);
    fireEvent.change(codeField(), { target: { value: "65a-43 21" } });
    expect(codeField().value).toBe("654321");
    expect(validateButton()).toHaveProperty("disabled", false);
    fireEvent.click(validateButton());
    await waitFor(() => expect(server.toasts).toContainEqual(["error", "Code de sécurité invalide ou expiré."]));
    expect(screen.queryByLabelText(NAVIGATION)).toBeNull();
    expect(screen.getByRole("heading", { name: "Validation de sécurité" })).toBeTruthy();

    fireEvent.change(codeField(), { target: { value: "123456" } });
    fireEvent.click(validateButton());
    expect(await screen.findByLabelText(NAVIGATION)).toBeTruthy();
    expect(server.verifyAttempts).toEqual(["654321", "123456"]);
    expect(screen.queryByRole("heading", { name: "Validation de sécurité" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Administration" })).toBeTruthy();
  });

  it("ouvre après le code de sécurité la section que nommait l’adresse, sans la perdre (ADM-09)", async () => {
    window.history.replaceState(null, "", "/admin?tab=testimonials");
    mount();
    expect(await screen.findByRole("heading", { name: "Validation de sécurité" })).toBeTruthy();
    fireEvent.change(codeField(), { target: { value: "123456" } });
    fireEvent.click(validateButton());

    const navigation = await screen.findByLabelText(NAVIGATION);
    expect(navigation.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("Témoignages");
    expect(window.location.pathname + window.location.search).toBe("/admin?tab=testimonials");

    // A section chosen afterwards takes its place in the address, as a new history entry.
    const entries = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: "Disponibilités" }));
    await waitFor(() => expect(window.location.search).toBe("?tab=availability"));
    expect(window.history.length).toBe(entries + 1);
    expect(navigation.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("Disponibilités");
  });

  it("met l’écran du code dans la zone principale, et le code dans un formulaire qu’Entrée envoie (A11Y-12)", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Validation de sécurité" })).toBeTruthy();
    // « Aller au contenu principal » reaches it.
    expect(screen.getByRole("main").contains(codeField())).toBe(true);
    const form = codeField().form!;
    expect(form.contains(validateButton())).toBe(true);
    expect(validateButton().getAttribute("type")).toBe("submit");

    // Entrée in the field submits the form; an incomplete code is not sent.
    fireEvent.change(codeField(), { target: { value: "123" } });
    fireEvent.submit(form);
    expect(server.verifyAttempts).toEqual([]);
    fireEvent.change(codeField(), { target: { value: "123456" } });
    fireEvent.submit(form);
    expect(await screen.findByLabelText(NAVIGATION)).toBeTruthy();
    expect(server.verifyAttempts).toEqual(["123456"]);
  });

  it("ouvre directement l’administration d’une session déjà vérifiée par le serveur, sa barre de sections nommée", async () => {
    server.verified = true;
    mount();
    expect(await screen.findByLabelText(NAVIGATION)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Validation de sécurité" })).toBeNull();
    // A11Y-12: the landmark of the tab bar has a name.
    expect(screen.getByRole("navigation", { name: "Sections" }).contains(screen.getByLabelText(NAVIGATION))).toBe(true);
  });

  it("dit le français de l’administration sur un site en anglais, et l’anglais des onglets traduits (A11Y-13)", async () => {
    window.history.replaceState(null, "", "/admin?tab=security&lang=en");
    mountInSiteLanguage();
    const heading = await screen.findByRole("heading", { name: "Validation de sécurité" });
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(languageOf(heading)).toBe("fr");
    expect(languageOf(codeField())).toBe("fr");

    fireEvent.change(codeField(), { target: { value: "123456" } });
    fireEvent.click(validateButton());
    const navigation = await screen.findByLabelText(NAVIGATION);
    expect(languageOf(navigation)).toBe("fr");
    expect(languageOf(screen.getByRole("heading", { name: "Administration" }))).toBe("fr");
    // The security tab is translated (ADM-07): its text is in the site's language, and says so.
    expect(languageOf(screen.getByRole("status", { name: "Loading security log" }))).toBe("en");

    // A tab written in French only stays French.
    fireEvent.click(screen.getByRole("button", { name: "Disponibilités" }));
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading security log" })).toBeNull());
    expect(screen.getByRole("main").getAttribute("lang")).toBeNull();
    expect(languageOf(screen.getByRole("main"))).toBe("fr");
    expect(screen.getByRole("main").querySelector("[lang]")).toBeNull();
  });

  it("refuse un compte qui n’est pas administrateur sans même interroger la sécurité", async () => {
    server.user = { name: "Visiteur", role: "user" };
    server.verified = true;
    mount();
    expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeTruthy();
    expect(screen.queryByLabelText(NAVIGATION)).toBeNull();
    expect(server.statusReads).toBe(0);
  });
});
