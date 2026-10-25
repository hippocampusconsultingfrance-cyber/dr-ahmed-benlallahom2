import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { publicFormCopy } from "../client/src/lib/publicFormCopy";

const project = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("garde-fous Turnstile des parcours publics", () => {
  it("préserve le challenge actif lors des re-rendus sans l’invalider avant sa fin", () => {
    const source = project("client/src/components/TurnstileWidget.tsx");
    expect(source).toContain("const onTokenRef = useRef(onToken)");
    // « armed » ne passe qu'une fois de false à true (chargement différé, PERF-04), avant tout challenge.
    expect(source).toContain("[armed, siteKey, retryNonce]");
    expect(source).not.toMatch(/\[[^\]]*onToken[^\]]*\]\);/);
    expect(source).not.toContain("WIDGET_WATCHDOG_MS");
    expect(source).not.toContain("widget_unavailable");
    // Le message d’échec, traduit dans la langue de la page, dit toujours que l’envoi reste bloqué.
    expect(source).toContain("<TurnstileLoadError copy={copy}");
    expect(publicFormCopy.turnstile.fr.loadError).toContain("L’envoi reste bloqué afin de protéger vos données");
    expect(publicFormCopy.turnstile.en.loadError).toContain("Sending stays blocked to protect your data");
    expect(publicFormCopy.turnstile.de.loadError).toContain("Zum Schutz Ihrer Daten bleibt das Senden gesperrt");
    expect(publicFormCopy.turnstile.zh.loadError).toContain("为保护您的数据，发送仍被阻止");
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
    for (const path of ["client/src/pages/RecruitmentPage.tsx", "client/src/pages/VvipOffshorePage.tsx"]) {
      const page = project(path);
      expect(page, path).toContain("setTurnstileAttempt(value => value + 1)");
      expect(page, path).toContain("<TurnstileWidget key={turnstileAttempt} onToken={setTurnstileToken} />");
    }
  });

  it("renouvelle le contrôle de l’espace candidat après chaque inscription ou demande de lien (REC-03)", () => {
    const page = project("client/src/pages/CandidateAccessPage.tsx");
    expect(page.match(/onSettled: renewTurnstile,/g)).toHaveLength(3);
    expect(page).toContain("<TurnstileWidget key={`${mode}-${turnstileKey}`} onToken={setTurnstileToken} />");
  });
});
