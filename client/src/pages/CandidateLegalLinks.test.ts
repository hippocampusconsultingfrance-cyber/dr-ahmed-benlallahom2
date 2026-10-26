import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// LEGAL-23 : informations légales de l’espace candidat, vérifiées sur les
// pages rendues : consentement de création d’accès relié aux conditions
// d’utilisation et à la politique de confidentialité, et pied de page légal
// sur chaque page candidat.

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language, setLanguage: () => undefined }) }));
vi.mock("wouter", async () => {
  const { createElement } = await import("react");
  return {
    useLocation: () => ["/candidate/access", () => undefined],
    Link: ({ href, children, className }: { href: string; children: unknown; className?: string }) => createElement("a", { href, className }, children as never),
  };
});
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/LanguageMenu", () => ({ default: () => null }));
vi.mock("@/components/TurnstileWidget", () => ({ TurnstileWidget: () => null }));
vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => ({ useQuery: () => ({ data, isLoading: false, isFetching: false, isError: false, error: null, refetch: () => undefined }) });
  const mutation = { useMutation: () => ({ mutate: () => undefined, mutateAsync: async () => undefined, isPending: false }) };
  return {
    trpc: {
      useUtils: () => ({ candidatePortal: { invalidate: () => undefined, me: { setData: () => undefined, invalidate: async () => undefined }, documents: { invalidate: () => undefined }, sessions: { invalidate: () => undefined } } }),
      candidatePortal: {
        me: query({ id: 7, firstName: "Vera" }),
        documents: query([]),
        sessions: query([]),
        activationDetails: query({ status: "ready", firstName: "Vera" }),
        resolveInvitation: query(undefined),
        logout: mutation, revokeSession: mutation, revokeAllSessions: mutation, login: mutation, register: mutation,
        requestPasswordReset: mutation, resendVerification: mutation, resetPassword: mutation, verifyEmail: mutation, uploadDocument: mutation, deleteDocument: mutation,
      },
    },
  };
});

const { default: CandidateAccessPage, candidateAccessCopy } = await import("./CandidateAccessPage");
const { default: CandidateVerifyPage } = await import("./CandidateVerifyPage");
const { default: CandidateResetPasswordPage } = await import("./CandidateResetPasswordPage");
const { default: CandidatePortalPage } = await import("./CandidatePortalPage");
const { candidateLegalFooterCopy, candidateLegalLinks } = await import("../components/CandidateLegalFooter");

function render(page: () => unknown, search = "") {
  vi.stubGlobal("window", { location: { pathname: "/candidate/access", search }, innerWidth: 1280, addEventListener: () => undefined, removeEventListener: () => undefined });
  return renderToStaticMarkup(createElement(page as never)).replace(/&amp;/g, "&");
}
/** The links of the candidate legal footer, by href. */
function footerLinks(html: string, label: string) {
  const start = html.indexOf(`<nav aria-label="${label}"`);
  if (start < 0) return [];
  return [...html.slice(start, html.indexOf("</nav>", start)).matchAll(/href="([^"]+)"/g)].map(match => match[1]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  view.language = "fr";
});

describe("LEGAL-23 — informations légales de l’espace candidat", () => {
  it("relie le consentement de création d’accès aux conditions d’utilisation et à la politique de confidentialité dans chaque langue", () => {
    expect(candidateLegalLinks).toEqual({ legal: "/legal", privacy: "/legal?tab=privacy", terms: "/legal?tab=terms", cookies: "/legal?tab=privacy#cookies" });
    for (const [language, copy] of Object.entries(candidateAccessCopy)) {
      expect(copy.termsParts, language).toHaveLength(5);
      expect(copy.legalNotice.length, language).toBeGreaterThan(20);
      view.language = language as typeof view.language;
      const html = render(CandidateAccessPage, "?invite=1&email=candidat%40example.com");
      const start = html.indexOf("candidate-consent-panel");
      expect(start, language).toBeGreaterThan(-1);
      // Up to the legal footer, which repeats these links on every page.
      const consent = html.slice(start, html.indexOf("<footer", start));
      expect(consent, language).toContain(`href="${candidateLegalLinks.terms}"`);
      expect(consent, language).toContain(`href="${candidateLegalLinks.privacy}"`);
      expect(html, language).toContain(`href="${candidateLegalLinks.legal}"`);
    }
  });

  it.each(["fr", "en", "de", "zh"] as const)("affiche un pied de page légal sur toutes les pages candidat (%s)", language => {
    view.language = language;
    const label = candidateLegalFooterCopy[language].label;
    const pages = { CandidateAccessPage, CandidateVerifyPage, CandidateResetPasswordPage, CandidatePortalPage };
    for (const [name, page] of Object.entries(pages)) {
      const html = render(page, "?email=candidat%40example.com&token=abc");
      expect(footerLinks(html, label), name).toEqual([candidateLegalLinks.legal, candidateLegalLinks.privacy, candidateLegalLinks.terms, candidateLegalLinks.cookies]);
      expect(html, name).toContain(candidateLegalFooterCopy[language].controller);
    }
  });
});
