// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HIPPOCAMPUS_LEGAL } from "@shared/legalIdentity";

// Les pages légales telles que React les affiche en français, chaque section ouverte par son
// adresse (?tab=). L’identité légale vit dans shared/legalIdentity.ts (source unique partagée
// avec la facture) : la page publiée affiche ce qu’elle contient au moment où elle s’affiche.
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "fr" }),
}));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const { default: LegalPage } = await import("./LegalPage");

const SECTIONS = ["legal", "privacy", "terms"] as const;

/** The text of one section of /legal, opened by its address, its spaces as read. */
function sectionText(tab: (typeof SECTIONS)[number]) {
  window.history.replaceState(null, "", `/legal?tab=${tab}`);
  const { container, unmount } = render(createElement(LegalPage));
  const text = (container.textContent ?? "").replace(/\s+/g, " ");
  unmount();
  return text;
}
const publishedText = () => SECTIONS.map(sectionText).join(" ");

afterEach(() => cleanup());

describe("mentions légales Hippocampus Consulting SARL", () => {
  it("publie les informations d’immatriculation sans divulguer le domicile privé du gérant", () => {
    expect(HIPPOCAMPUS_LEGAL).toMatchObject({
      name: "Hippocampus Consulting SARL",
      rcs: "999 259 252 R.C.S. Paris",
      registeredOffice: "6 rue d’Armaillé, 75017 Paris, France",
      contactEmail: "hippocampusconsultingfrance@gmail.com",
    });
    const legal = sectionText("legal");
    for (const value of [
      HIPPOCAMPUS_LEGAL.name,
      HIPPOCAMPUS_LEGAL.rcs,
      HIPPOCAMPUS_LEGAL.registeredOffice,
    ]) {
      expect(legal).toContain(value);
    }
    expect(publishedText()).not.toContain("96 avenue Bollée");

    // The page reads the shared identity when it renders: a value changed there is the one published.
    const rcs = HIPPOCAMPUS_LEGAL.rcs;
    const identity = HIPPOCAMPUS_LEGAL as { rcs: string };
    identity.rcs = "000 000 000 R.C.S. Essai";
    try {
      expect(sectionText("legal")).toContain("000 000 000 R.C.S. Essai");
    } finally {
      identity.rcs = rcs;
    }
  });

  it("qualifie les prestataires de données et la revue humaine de l’IA", () => {
    const published = publishedText();
    for (const provider of [
      "Google Drive",
      "Vercel",
      "Neon",
      "Clerk",
      "Cloudflare Turnstile",
      "Resend",
      "Stripe",
    ]) {
      expect(published).toContain(provider);
    }
    expect(published).not.toContain("Butterfly Effect Pte. Ltd.");
    expect(published).toContain(
      "aucune décision d’embauche ou de rejet sans revue humaine"
    );
  });
});
