import { readFile } from "node:fs/promises";
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

/** Premier rendu de /candidate/access pour un visiteur qui a choisi le thème clair sur le site. */
function renderInLightTheme(search = "") {
  vi.stubGlobal("localStorage", { getItem: (key: string) => (key === "language" ? "fr" : key === "theme" ? "light" : null), setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("window", { location: { pathname: "/candidate/access", search }, innerWidth: 1280 });
  const queryClient = new QueryClient();
  const trpcClient = trpc.createClient({ links: [httpBatchLink({ url: "http://localhost/api/trpc", transformer: superjson })] });
  return renderToStaticMarkup(
    createElement(trpc.Provider, { client: trpcClient, queryClient },
      createElement(QueryClientProvider, { client: queryClient },
        createElement(Router, { ssrPath: "/candidate/access" },
          createElement(ThemeProvider, { defaultTheme: "dark", switchable: true },
            createElement(LanguageProvider, null, createElement(CandidateAccessPage)))))),
  );
}

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

  it("annonce le mode actif et associe les aides aux champs concernés", async () => {
    const source = await readFile(new URL("./CandidateAccessPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('aria-pressed={mode === "login"}');
    expect(source).toContain('aria-pressed={mode === "register"}');
    expect(source).toContain('aria-pressed={mode === "forgot"}');
    expect(source).toContain('aria-pressed={mode === "activation"}');
    expect(source).toContain('aria-describedby="candidate-password-hint"');
  });

  it("expose directement la cible du lien d’accès au contenu principal", async () => {
    const sources = await Promise.all([
      readFile(new URL("./CandidateAccessPage.tsx", import.meta.url), "utf8"),
      readFile(new URL("./CandidateVerifyPage.tsx", import.meta.url), "utf8"),
      readFile(new URL("./CandidateResetPasswordPage.tsx", import.meta.url), "utf8"),
    ]);

    for (const source of sources) {
      expect(source).toContain('id="main-content"');
      expect(source).toContain("tabIndex={-1}");
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
