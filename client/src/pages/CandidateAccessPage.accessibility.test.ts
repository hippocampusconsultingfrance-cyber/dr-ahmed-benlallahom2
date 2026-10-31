import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import superjson from "superjson";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import CandidateAccessPage, { candidateAccessCopy, candidateModeFocusTarget } from "./CandidateAccessPage";
import CandidateResetPasswordPage from "./CandidateResetPasswordPage";
import CandidateVerifyPage from "./CandidateVerifyPage";

/** Premier rendu d’une page candidat (par défaut /candidate/access) pour un visiteur qui a choisi le thème clair sur le site. */
function renderInLightTheme(search = "", page: () => unknown = CandidateAccessPage, path = "/candidate/access") {
  vi.stubGlobal("localStorage", { getItem: (key: string) => (key === "language" ? "fr" : key === "theme" ? "light" : null), setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("window", { location: { pathname: path, search }, innerWidth: 1280 });
  const queryClient = new QueryClient();
  const trpcClient = trpc.createClient({ links: [httpBatchLink({ url: "http://localhost/api/trpc", transformer: superjson })] });
  return renderToStaticMarkup(
    createElement(trpc.Provider, { client: trpcClient, queryClient },
      createElement(QueryClientProvider, { client: queryClient },
        createElement(Router, { ssrPath: path },
          createElement(ThemeProvider, { defaultTheme: "dark", switchable: true },
            createElement(LanguageProvider, null, createElement(page as never)))))),
  );
}
/** Opening tags of the elements carrying `attribute`. */
const tagsWith = (html: string, attribute: string) => html.match(new RegExp(`<[a-z]+\\b[^>]*\\b${attribute}[^>]*>`, "g")) ?? [];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("accessibilité du parcours candidat", () => {
  it("replace le focus sur le premier champ utile après un changement de mode", () => {
    expect(candidateModeFocusTarget("login")).toBe("candidate-email");
    expect(candidateModeFocusTarget("register")).toBe("candidate-first-name");
    expect(candidateModeFocusTarget("forgot")).toBe("candidate-email");
    expect(candidateModeFocusTarget("activation")).toBe("candidate-email");
  });

  it("annonce le mode actif et associe les aides aux champs concernés", () => {
    for (const [search, active] of [["", "login"], ["?invite=1&email=candidat%40example.com", "register"]] as const) {
      const modes = tagsWith(renderInLightTheme(search), "aria-pressed=");
      expect(modes, active).toHaveLength(4);
      expect(modes.filter(tag => tag.includes('aria-pressed="true"')), active).toHaveLength(1);
    }
    const login = renderInLightTheme();
    const password = tagsWith(login, 'id="candidate-password"')[0]!;
    expect(password).toContain('aria-describedby="candidate-password-hint"');
    expect(login).toContain('id="candidate-password-hint"');
  });

  it("expose directement la cible du lien d’accès au contenu principal", () => {
    const pages = [
      ["/candidate/access", CandidateAccessPage],
      ["/candidate/verify", CandidateVerifyPage],
      ["/candidate/reset-password", CandidateResetPasswordPage],
    ] as const;
    for (const [path, page] of pages) {
      const main = tagsWith(renderInLightTheme("?email=candidat%40example.com&token=abc", page, path), 'id="main-content"');
      expect(main, path).toHaveLength(1);
      expect(main[0], path).toContain('tabindex="-1"');
    }
  });

  it("garde les jetons sombres sur son fond sombre quand le visiteur est en thème clair (A11Y-02)", () => {
    // Connexion, puis création d'accès ouverte par un ancien lien d'invitation.
    for (const [search, title] of [["", candidateAccessCopy.fr.loginTitle], ["?invite=1&email=candidat%40example.com", candidateAccessCopy.fr.registerTitle]]) {
      const html = renderInLightTheme(search);
      expect(html, search || "connexion").toContain(title);
      const mainClasses = html.match(/<main\b[^>]*\bclass="([^"]*)"/)?.[1].split(/\s+/) ?? [];
      expect(mainClasses, search || "connexion").toEqual(expect.arrayContaining(["theme-dark-island", "dark"]));
    }
  });
});
