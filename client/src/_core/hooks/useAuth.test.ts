import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// L’accès administrateur suit la session Clerk : sans session Clerk, aucun
// compte n’est retenu, même si une réponse du serveur traîne en cache ; la
// déconnexion ferme la session MFA côté serveur puis la session Clerk.

const view = vi.hoisted(() => ({
  clerk: { isLoaded: true, isSignedIn: false },
  me: { data: null as unknown, isLoading: false, error: null as unknown },
  meOptions: [] as Array<{ enabled: boolean }>,
  calls: [] as string[],
  serverLogoutFails: false,
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => view.clerk,
  useClerk: () => ({ signOut: vi.fn(async (options: unknown) => { view.calls.push(`clerk.signOut ${JSON.stringify(options)}`); }) }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ auth: { me: { setData: () => view.calls.push("me.setData"), invalidate: async () => { view.calls.push("me.invalidate"); } } } }),
    auth: {
      me: { useQuery: (_input: unknown, options: { enabled: boolean }) => { view.meOptions.push(options); return { ...view.me, refetch: vi.fn() }; } },
      logout: { useMutation: () => ({ mutateAsync: async () => { view.calls.push("server.logout"); if (view.serverLogoutFails) throw new Error("network"); } }) },
    },
  },
}));

const { useAuth } = await import("./useAuth");

function current() {
  let result: ReturnType<typeof useAuth> | undefined;
  function Probe() { result = useAuth(); return null; }
  renderToStaticMarkup(createElement(Probe));
  return result!;
}

const ADMIN = { id: 1, openId: "user_owner", role: "admin", name: "Dr Ahmed", mfaVerified: true };

beforeEach(() => {
  view.clerk = { isLoaded: true, isSignedIn: false };
  view.me = { data: ADMIN, isLoading: false, error: null };
  view.meOptions = [];
  view.calls = [];
  view.serverLogoutFails = false;
});

describe("authentification de l’administration par Clerk", () => {
  it("ne retient aucun compte sans session Clerk et n’interroge pas le serveur", () => {
    const auth = current();
    expect(auth).toMatchObject({ user: null, isAuthenticated: false, loading: false });
    expect(view.meOptions.at(-1)).toMatchObject({ enabled: false });
  });

  it("attend Clerk, puis le compte du serveur, avant de répondre", () => {
    view.clerk = { isLoaded: false, isSignedIn: false };
    expect(current().loading).toBe(true);
    view.clerk = { isLoaded: true, isSignedIn: true };
    view.me = { data: undefined, isLoading: true, error: null };
    expect(current()).toMatchObject({ loading: true, user: null });
  });

  it("donne le compte du serveur une fois la session Clerk ouverte", () => {
    view.clerk = { isLoaded: true, isSignedIn: true };
    expect(current()).toMatchObject({ user: ADMIN, isAuthenticated: true, mfaVerified: true, loading: false });
    expect(view.meOptions.at(-1)).toMatchObject({ enabled: true });
  });

  it("ferme la session MFA du serveur avant la session Clerk, même si le réseau échoue", async () => {
    view.clerk = { isLoaded: true, isSignedIn: true };
    await current().logout();
    expect(view.calls).toEqual(["server.logout", 'clerk.signOut {"redirectUrl":"/"}', "me.setData", "me.invalidate"]);

    view.calls = [];
    view.serverLogoutFails = true;
    await current().logout();
    expect(view.calls).toEqual(["server.logout", 'clerk.signOut {"redirectUrl":"/"}', "me.setData", "me.invalidate"]);
  });
});
