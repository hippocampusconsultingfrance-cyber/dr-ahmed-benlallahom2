import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const project = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("garde-fous Turnstile des parcours publics", () => {
  it("préserve le challenge actif lors des re-rendus et signale un widget absent", () => {
    const source = project("client/src/components/TurnstileWidget.tsx");
    expect(source).toContain("const onTokenRef = useRef(onToken)");
    expect(source).toContain("[siteKey, retryNonce]");
    expect(source).toContain("widget_unavailable");
    expect(source).toContain("L’envoi reste bloqué afin de protéger vos données");
  });

  it("bloque les trois soumissions publiques sans jeton Turnstile", () => {
    const widget = project("client/src/components/TurnstileWidget.tsx");
    expect(widget).toContain("const tokenRef = useRef(false)");
    expect(widget).toContain("blockSubmitWithoutToken");
    expect(project("client/src/pages/RecruitmentPage.tsx")).toContain('disabled={status === "sending" || !turnstileToken}');
    expect(project("client/src/pages/VvipOffshorePage.tsx")).toContain('disabled={status === "sending" || !turnstileToken}');
  });
});
