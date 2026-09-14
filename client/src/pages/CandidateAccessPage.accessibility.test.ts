import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { candidateModeFocusTarget } from "./CandidateAccessPage";

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
});
