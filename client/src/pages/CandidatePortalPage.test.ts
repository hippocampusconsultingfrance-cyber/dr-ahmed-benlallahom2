import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type MutationOptions = { onSuccess?: (...args: never[]) => unknown };
const view = vi.hoisted(() => ({
  documents: [] as Array<Record<string, unknown>>,
  documentsError: false,
  documentsLoading: false,
  refetchDocuments: vi.fn(),
  location: "/candidate/portal",
  navigations: [] as string[],
  calls: [] as string[],
  mutations: {} as Record<string, MutationOptions>,
}));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr" }), LanguageProvider: ({ children }: { children: unknown }) => children }));
vi.mock("wouter", async () => {
  const { createElement } = await import("react");
  return {
    useLocation: () => [view.location, (path: string) => { view.calls.push(`navigate ${path}`); view.navigations.push(path); }],
    Link: ({ href, children, className }: { href: string; children: unknown; className?: string }) => createElement("a", { href, className }, children as never),
  };
});
vi.mock("@/lib/trpc", () => {
  const query = (data: () => unknown) => () => ({ data: data(), isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
  const mutation = (name: string) => ({ useMutation: (options: MutationOptions = {}) => { view.mutations[name] = options; return { mutate: vi.fn(), isPending: false }; } });
  return {
    trpc: {
      useUtils: () => ({ candidatePortal: { invalidate: vi.fn(), me: { setData: vi.fn(), invalidate: async () => { view.calls.push("me.invalidate"); } }, documents: { invalidate: vi.fn() }, sessions: { invalidate: vi.fn() } } }),
      candidatePortal: {
        me: { useQuery: query(() => ({ id: 7, firstName: "Vera" })) },
        documents: { useQuery: () => ({ ...query(() => view.documents)(), isLoading: view.documentsLoading, isError: view.documentsError, refetch: view.refetchDocuments }) },
        sessions: { useQuery: query(() => []) },
        logout: mutation("logout"),
        revokeSession: mutation("revokeSession"),
        revokeAllSessions: mutation("revokeAllSessions"),
        login: mutation("login"),
        register: mutation("register"),
        requestPasswordReset: mutation("requestPasswordReset"),
        resendVerification: mutation("resendVerification"),
        resetPassword: mutation("resetPassword"),
        verifyEmail: mutation("verifyEmail"),
        activationDetails: { useQuery: query(() => ({ status: "ready", firstName: "Vera" })) },
        resolveInvitation: { useQuery: query(() => undefined) },
      },
    },
  };
});
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/LanguageMenu", () => ({ default: () => null }));
vi.mock("@/components/TurnstileWidget", () => ({ TurnstileWidget: () => null }));

const { default: CandidatePortalPage, candidatePortalCopy, shouldRedirectToCandidateAccess } = await import("./CandidatePortalPage");
const { isPrivateAreaPath } = await import("../lib/privateAreaRoutes");
const { default: App } = await import("../App");
const { default: WhatsAppButton } = await import("@/components/WhatsAppButton");
const { default: CookieConsent } = await import("@/components/CookieConsent");

beforeEach(() => {
  view.documents = [];
  view.documentsError = false;
  view.documentsLoading = false;
  view.refetchDocuments = vi.fn();
  view.location = "/candidate/portal";
  view.navigations = [];
  view.calls = [];
  view.mutations = {};
  vi.stubGlobal("window", { location: { search: "?email=vera%40example.test&token=token-for-the-page-test-0123", href: "https://drahmedbenlallahom.com/candidate/verify" }, requestAnimationFrame: vi.fn(), setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn(), history: { replaceState: vi.fn() } });
  vi.stubGlobal("document", { getElementById: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("candidate portal translations", () => {
  it("provides document, session and upload language in every supported locale", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = candidatePortalCopy[language];
      expect(copy.portal.length, language).toBeGreaterThan(0);
      expect(copy.uploadError.length, language).toBeGreaterThan(0);
      for (const status of ["pending", "reviewed", "rejected", "archived"] as const) expect(copy.status[status].length, `${language}:${status}`).toBeGreaterThan(0);
      expect(copy.categories.identity_document.length, language).toBeGreaterThan(0);
      expect(copy.categories.criminal_record.length, `${language}: legacy rows stay readable`).toBeGreaterThan(0);
      expect(JSON.stringify(copy), language).not.toMatch(/aiConfidence|reviewNote/);
    }
  });
});

describe("CAND-20 — ce que le candidat voit de la revue", () => {
  it("n’affiche ni la note interne ni la synthèse ou la confiance IA, même si elles arrivaient au navigateur", () => {
    view.documents = [{
      id: 12, category: "diploma", categoryOtherLabel: null, originalName: "diplome-vera.pdf", mimeType: "application/pdf", sizeBytes: 2048,
      status: "rejected", reviewedAt: new Date("2026-10-20T10:00:00Z"), createdAt: new Date("2026-10-19T10:00:00Z"),
      aiSummary: "Synthèse IA confidentielle", aiConfidence: 37, aiFlags: "[\"Signature douteuse\"]", reviewNotes: "Note interne : authenticité à vérifier",
    }];
    const html = renderToStaticMarkup(createElement(CandidatePortalPage));

    expect(html).toContain("diplome-vera.pdf");
    expect(html).toContain(candidatePortalCopy.fr.status.rejected);
    for (const hidden of ["Synthèse IA confidentielle", "Signature douteuse", "Note interne", "37 %", "37%"]) expect(html).not.toContain(hidden);
  });
});

describe("états du coffre candidat", () => {
  it("annonce le chargement des documents, puis un coffre vide une fois la liste reçue", () => {
    const { loadingDocuments, noDocuments } = candidatePortalCopy.fr;
    view.documentsLoading = true;
    let html = renderToStaticMarkup(createElement(CandidatePortalPage));
    expect(html).toContain(`role="status" aria-live="polite" aria-label="${loadingDocuments}"`);
    expect(html).not.toContain(noDocuments);

    view.documentsLoading = false;
    html = renderToStaticMarkup(createElement(CandidatePortalPage));
    expect(html).not.toContain(loadingDocuments);
    expect(html).toContain(noDocuments);
  });


  it("annonce l’échec du chargement à la place du coffre et relit les documents sur « Réessayer »", () => {
    view.documentsError = true;
    const html = renderToStaticMarkup(createElement(CandidatePortalPage));
    const alert = html.slice(html.indexOf('role="alert"'));
    expect(alert).toContain("Le coffre ne peut pas être chargé pour le moment. Réessayez dans quelques instants.");
    expect(html).not.toContain('id="candidate-document-file"');
    expect(html).not.toContain(candidatePortalCopy.fr.logout);

    const retry = elementsOf(renderStateful(CandidatePortalPage)).find(element => typeof element.props.onClick === "function" && element.props.children === "Réessayer")!;
    expect(view.refetchDocuments).not.toHaveBeenCalled();
    (retry.props.onClick as () => void)();
    expect(view.refetchDocuments).toHaveBeenCalledTimes(1);
  });
});

describe("CAND-10 — retour vers la connexion", () => {
  it("n’éjecte pas le candidat tant que la session est en cours de vérification", () => {
    expect(shouldRedirectToCandidateAccess({ isLoading: false, isFetching: true, data: null })).toBe(false);
    expect(shouldRedirectToCandidateAccess({ isLoading: true, isFetching: true, data: undefined })).toBe(false);
    expect(shouldRedirectToCandidateAccess({ isLoading: false, isFetching: false, data: { id: 1 } })).toBe(false);
    expect(shouldRedirectToCandidateAccess({ isLoading: false, isFetching: false, data: null })).toBe(true);
  });

  it.each([
    ["la connexion", "./CandidateAccessPage", "login"],
    ["la réinitialisation", "./CandidateResetPasswordPage", "resetPassword"],
    ["l’activation", "./CandidateVerifyPage", "verifyEmail"],
  ] as const)("rafraîchit la session en cache avant d’ouvrir le portail après %s", async (_label, path, mutation) => {
    const { default: Page } = await import(/* @vite-ignore */ path) as { default: () => ReactElement };
    renderStateful(Page);
    await view.mutations[mutation]!.onSuccess!();

    expect(view.calls.indexOf("me.invalidate")).toBeGreaterThan(-1);
    const opened = view.calls.findIndex(call => call === "navigate /candidate/portal");
    expect(opened === -1 || view.calls.indexOf("me.invalidate") < opened).toBe(true);
  });
});

describe("CAND-21 — boutons flottants dans les espaces privés", () => {
  /** The floating widgets of App, as mounted for the current address. */
  async function floatingWidgets(location: string) {
    view.location = location;
    const holder = elementsOf(App()).find(element => typeof element.type === "function" && (element.type as { name: string }).name === "FloatingWidgets")!;
    const widgets = elementsOf((holder.type as () => ReactElement)());
    return {
      whatsApp: widgets.some(element => element.type === WhatsAppButton),
      cookiePreferencesShortcut: widgets.find(element => element.type === CookieConsent)!.props.showPreferencesShortcut,
    };
  }

  it("masque WhatsApp et la pastille cookies sur l’espace candidat et l’administration", async () => {
    for (const path of ["/candidate/access", "/candidate/portal", "/candidate/verify?email=a&token=b", "/admin", "/admin/"]) expect(isPrivateAreaPath(path), path).toBe(true);
    for (const path of ["/", "/booking", "/recruitment/standard", "/candidates", "/administration"]) expect(isPrivateAreaPath(path), path).toBe(false);

    await expect(floatingWidgets("/candidate/portal")).resolves.toEqual({ whatsApp: false, cookiePreferencesShortcut: false });
    await expect(floatingWidgets("/admin")).resolves.toEqual({ whatsApp: false, cookiePreferencesShortcut: false });
    await expect(floatingWidgets("/booking")).resolves.toEqual({ whatsApp: true, cookiePreferencesShortcut: true });
  });
});
