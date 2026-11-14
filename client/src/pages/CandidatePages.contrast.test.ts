import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { relativeLuminance, type Oklch } from "@/lib/contrast";

// A11Y-19 : les petits textes gris de l’espace candidat (consigne de mot de
// passe à la connexion et à l’activation, ligne de copyright du pied de page)
// atteignent 4,5:1 sur le fond #030a12 des pages candidat, mesurés sur les
// classes que les pages rendent.

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "fr", setLanguage: () => undefined }),
}));
vi.mock("wouter", async () => {
  const { createElement } = await import("react");
  return {
    useLocation: () => ["/candidate/access", () => undefined],
    Link: ({
      href,
      children,
      className,
    }: {
      href: string;
      children: unknown;
      className?: string;
    }) => createElement("a", { href, className }, children as never),
  };
});
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/LanguageMenu", () => ({ default: () => null }));
vi.mock("@/components/TurnstileWidget", () => ({
  TurnstileWidget: () => null,
}));
vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => ({
    useQuery: () => ({
      data,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: () => undefined,
    }),
  });
  const mutation = {
    useMutation: () => ({
      mutate: () => undefined,
      isPending: false,
      isSuccess: false,
    }),
  };
  return {
    trpc: {
      useUtils: () => ({
        candidatePortal: {
          invalidate: () => undefined,
          me: { setData: () => undefined, invalidate: async () => undefined },
          documents: { invalidate: () => undefined },
          sessions: { invalidate: () => undefined },
        },
      }),
      candidatePortal: {
        me: query({ id: 7, firstName: "Vera" }),
        documents: query([]),
        sessions: query([]),
        activationDetails: query({
          email: "candidat@example.com",
          firstName: "Vera",
          lastName: "Rossi",
        }),
        resolveInvitation: query(undefined),
        logout: mutation,
        revokeSession: mutation,
        revokeAllSessions: mutation,
        login: mutation,
        register: mutation,
        requestPasswordReset: mutation,
        resendVerification: mutation,
        resetPassword: mutation,
        verifyEmail: mutation,
      },
    },
  };
});

const { default: CandidateAccessPage } = await import("./CandidateAccessPage");
const { default: CandidateVerifyPage } = await import("./CandidateVerifyPage");
const { default: CandidatePortalPage } = await import("./CandidatePortalPage");

/** Tailwind 4 slate shades (node_modules/tailwindcss/theme.css). */
const SLATE: Record<string, Oklch> = {
  "300": [0.869, 0.022, 252.894],
  "400": [0.704, 0.04, 256.788],
  "500": [0.554, 0.046, 257.417],
  "600": [0.446, 0.043, 257.281],
};

/** Luminance of the candidate pages' background, #030a12. */
function backgroundLuminance() {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(0x03) + 0.7152 * channel(0x0a) + 0.0722 * channel(0x12)
  );
}

/** Contrast on the page background of the slate text colour the opening tag carries. */
function contrastOf(tag: string) {
  const shade = tag.match(/\btext-slate-(\d+)\b/)?.[1];
  if (!shade || !SLATE[shade])
    throw new Error(`no known slate text colour in ${tag}`);
  const [lighter, darker] = [
    relativeLuminance(SLATE[shade]),
    backgroundLuminance(),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function render(page: () => unknown, search = "") {
  vi.stubGlobal("window", {
    location: { pathname: "/candidate/access", search },
    innerWidth: 1280,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  return renderToStaticMarkup(createElement(page as never));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("A11Y-19 — petits textes gris de l’espace candidat", () => {
  it("rend la consigne de mot de passe lisible à la connexion et à l’activation", () => {
    const login =
      render(CandidateAccessPage).match(
        /<p id="candidate-password-hint"[^>]*>/
      )?.[0] ?? "";
    const activation =
      render(
        CandidateVerifyPage,
        "?email=candidat%40example.com&token=activation-token"
      ).match(/<p id="candidate-activation-password-hint"[^>]*>/)?.[0] ?? "";

    expect(contrastOf(login)).toBeGreaterThanOrEqual(4.5);
    expect(contrastOf(activation)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["l’accès", CandidateAccessPage],
    ["l’activation", CandidateVerifyPage],
    ["le coffre", CandidatePortalPage],
  ] as const)(
    "rend la ligne de copyright lisible sur la page de %s",
    (_label, page) => {
      const copyright =
        render(
          page,
          "?email=candidat%40example.com&token=activation-token"
        ).match(/<p [^>]*>©/)?.[0] ?? "";
      expect(contrastOf(copyright)).toBeGreaterThanOrEqual(4.5);
    }
  );

  it("mesure bien l’ancien gris comme insuffisant", () => {
    expect(contrastOf('<p class="text-xs text-slate-500">')).toBeLessThan(4.5);
  });
});
