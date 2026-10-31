import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// EXPL-01 (3) : « paiement reçu, créneau non confirmé » ne promet plus que
// l’équipe a été prévenue ni qu’un email est parti ; la page dit quoi faire.

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/booking/confirmation", () => undefined],
  Link: ({ href, children, className }: { href: string; children: unknown; className?: string }) => createElement("a", { href, className }, children as never),
}));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/LanguageMenu", () => ({ default: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    appointments: {
      cancelPending: { useMutation: () => ({ mutate: vi.fn() }) },
      publicStatus: { useQuery: () => ({ data: { state: "attention" }, isError: false }) },
    },
  },
}));

const { default: BookingConfirmationPage, confirmationContent } = await import("./BookingConfirmationPage");
const { siteConfig } = await import("@/data/site-config");

afterEach(() => { vi.unstubAllGlobals(); });

function renderAttention(language: (typeof view)["language"]) {
  view.language = language;
  vi.stubGlobal("window", { location: { search: "?status=success&trackingId=APTATTN00001&session_id=cs_test_attention_1" }, setTimeout, clearTimeout });
  return renderToStaticMarkup(createElement(BookingConfirmationPage)).replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

describe("paiement reçu mais créneau non confirmé", () => {
  it.each(["fr", "en", "de", "zh"] as const)("demande de nous contacter avec la référence, coordonnées à l’appui (%s)", language => {
    const html = renderAttention(language);
    const { attention } = confirmationContent[language];

    expect(html).toContain('data-state="attention"');
    expect(html).toContain(attention.title);
    expect(html).toContain(attention.nextSteps);
    expect(html).toContain("APTATTN00001");
    expect(html).toContain(`mailto:${siteConfig.email}`);
  });

  it("ne prétend pas que l’équipe est déjà prévenue ni qu’un email a été envoyé", () => {
    expect(renderAttention("fr")).not.toMatch(/a été prévenue|email vous a également été envoyé/);
    expect(confirmationContent.fr.attention.nextSteps).toContain("Contactez-nous avec votre référence de suivi");
    expect(confirmationContent.fr.attention.nextSteps).toContain("intégralement remboursé");
    expect(renderAttention("en")).not.toMatch(/has been notified|has also been sent/);
    expect(confirmationContent.en.attention.nextSteps).toContain("Contact us with your tracking reference");
    expect(renderAttention("de")).not.toMatch(/wurde informiert|E-Mail erhalten/);
    expect(renderAttention("zh")).not.toMatch(/已收到通知|已向您发送/);
  });
});
