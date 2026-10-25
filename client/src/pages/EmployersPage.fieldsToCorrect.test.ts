import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("wouter", () => ({
  Link: ({ href, children, className }: { href: string; children: unknown; className?: string }) => createElement("a", { href, className }, children as never),
}));

const { default: EmployersPage, employerFieldsToCorrect, employerInvalidFields } = await import("./EmployersPage");
const { reportFieldsToCorrect } = await import("@/lib/formFieldsToCorrect");

const languages = ["fr", "en", "de", "zh"] as const;
const emptyBrief = { organizationName: "", contactName: "", email: "", phone: "", targetEnvironment: "Hôpital / Clinique internationale", specialtyNeeded: "", country: "", requiredCertifications: "", timeline: "", notes: "", website: "" };
const completeBrief = { ...emptyBrief, organizationName: "Clinique du Golfe", contactName: "Dr. Haddad", email: "rh@clinique.example", specialtyNeeded: "Anesthésiste" };

function render(language: (typeof languages)[number]) {
  view.language = language;
  return renderToStaticMarkup(createElement(EmployersPage));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("A11Y-03 — brief employeur refusé avant l’envoi", () => {
  it("retient chaque champ obligatoire vide ou une adresse email invalide, dans l’ordre du formulaire", () => {
    expect(employerInvalidFields(emptyBrief, "")).toEqual(["organizationName", "contactName", "email", "specialtyNeeded", "country"]);
    expect(employerInvalidFields({ ...completeBrief, organizationName: "   " }, "Qatar")).toEqual(["organizationName"]);
    expect(employerInvalidFields({ ...completeBrief, email: "rh@clinique" }, "Qatar")).toEqual(["email"]);
    expect(employerInvalidFields(completeBrief, "")).toEqual(["country"]);
    expect(employerInvalidFields(completeBrief, "Qatar")).toEqual([]);
  });

  it("nomme les champs à compléter au lieu de « Veuillez remplir les champs obligatoires » et place le focus sur le premier", () => {
    const frames: Array<() => void> = [];
    const focused: string[] = [];
    vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => frames.push(callback) });
    vi.stubGlobal("document", { getElementById: (id: string) => ({ focus: () => focused.push(id) }) });

    expect(reportFieldsToCorrect(employerFieldsToCorrect(employerInvalidFields(emptyBrief, ""), "fr"), "fr"))
      .toBe("À compléter ou corriger : Établissement ou entreprise, Nom du responsable, Email, Spécialité médicale ou paramédicale recherchée, Pays / Zone géographique.");
    expect(reportFieldsToCorrect(employerFieldsToCorrect(["email", "country"], "en"), "en")).toBe("Please complete or correct: Professional Email, Country / Region.");
    frames.splice(0).forEach(frame => frame());
    expect(focused).toEqual(["employer-organizationName", "employer-email"]);
  });

  it.each(languages)("rend chaque champ que l’alerte nomme avec l’identifiant qui reçoit le focus, sans erreur avant un envoi (%s)", language => {
    const html = render(language);
    for (const field of employerFieldsToCorrect(employerInvalidFields(emptyBrief, ""), language)) {
      const input = html.match(new RegExp(`<input[^>]*id="${field.focusId}"[^>]*>`))?.[0];
      expect(input, field.label).toBeDefined();
      expect(input).toContain('aria-invalid="false"');
      expect(input).not.toContain("form-field-invalid");
    }
  });
});
