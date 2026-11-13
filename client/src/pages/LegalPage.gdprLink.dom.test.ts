// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// La politique de confidentialité montée par React dans un DOM, ouverte par son adresse
// (?tab=privacy), dans les quatre langues : ses droits RGPD (§6) renvoient vers le formulaire
// dédié (/gdpr), plus vers le formulaire de contact (PUB-NAV-01).
const view = vi.hoisted(() => ({
  language: "fr" as "fr" | "en" | "de" | "zh",
}));
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: view.language }),
}));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const { default: LegalPage } = await import("./LegalPage");

afterEach(() => cleanup());

describe("pages orphelines reliées (PUB-NAV-01)", () => {
  it.each(["fr", "en", "de", "zh"] as const)(
    "la politique de confidentialité renvoie vers /gdpr au lieu du formulaire de contact (%s)",
    language => {
      view.language = language;
      window.history.replaceState(null, "", "/legal?tab=privacy");
      const { container } = render(createElement(LegalPage));
      expect(container.querySelectorAll('a[href="/gdpr"]')).toHaveLength(1);
      const text = (container.textContent ?? "").replace(/\s+/g, " ");
      expect(text).not.toContain(
        'formulaire de contact avec la mention "Demande RGPD"'
      );
      expect(text).not.toContain(
        'contact form with the mention "GDPR Request"'
      );
    }
  );
});
