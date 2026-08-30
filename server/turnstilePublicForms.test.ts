import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const project = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("garde-fous Turnstile des parcours publics", () => {
  it("préserve le challenge actif lors des re-rendus sans l’invalider avant sa fin", () => {
    const source = project("client/src/components/TurnstileWidget.tsx");
    expect(source).toContain("const onTokenRef = useRef(onToken)");
    expect(source).toContain("[siteKey, retryNonce]");
    expect(source).not.toContain("WIDGET_WATCHDOG_MS");
    expect(source).not.toContain("widget_unavailable");
    expect(source).toContain("L’envoi reste bloqué afin de protéger vos données");
  });

  it("bloque toutes les soumissions publiques sensibles sans jeton Turnstile", () => {
    const widget = project("client/src/components/TurnstileWidget.tsx");
    expect(widget).toContain("const tokenRef = useRef(false)");
    expect(widget).toContain("blockSubmitWithoutToken");
    expect(project("client/src/pages/RecruitmentPage.tsx")).toContain('disabled={status === "sending" || !turnstileToken}');
    expect(project("client/src/pages/VvipOffshorePage.tsx")).toContain('disabled={status === "sending" || !turnstileToken}');
    expect(project("client/src/components/ContactSection.tsx")).toContain('disabled={submitMutation.isPending || !turnstileToken}');
    expect(project("client/src/components/GDPRRequestForm.tsx")).toContain('disabled={submitMutation.isPending || !turnstileToken}');
    const routers = project("server/routers.ts");
    expect(routers.match(/verifyCandidateTurnstile/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("renouvelle automatiquement le contrôle recrutement après un échec serveur", () => {
    const page = project("client/src/pages/RecruitmentPage.tsx");
    expect(page).toContain("setTurnstileAttempt(value => value + 1)");
    expect(page).toContain("<TurnstileWidget key={turnstileAttempt} onToken={setTurnstileToken} />");
  });
});
