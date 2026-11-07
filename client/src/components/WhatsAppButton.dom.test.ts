// @vitest-environment happy-dom
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Bouton WhatsApp monté par React à côté d'un formulaire de la page, comme celui de contact de
// l'accueil : il s'efface pendant la saisie et revient ensuite (PUB-12).
const { default: WhatsAppButton, whatsappCopy } = await import("./WhatsAppButton");
const { LanguageProvider } = await import("@/contexts/LanguageContext");

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("bouton WhatsApp pendant la saisie d'un formulaire (PUB-12)", () => {
  it("s'efface tant qu'un champ d'un formulaire a le focus, sans quitter la page", () => {
    localStorage.setItem("language", "fr");
    render(createElement(LanguageProvider, null,
      createElement("form", null, createElement("input", { "aria-label": "Nom" }), createElement("textarea", { "aria-label": "Message" }), createElement("button", { type: "submit" }, "Envoyer")),
      createElement("input", { "aria-label": "Rechercher" }),
      createElement(WhatsAppButton),
    ));
    const whatsApp = screen.getByRole("link", { name: whatsappCopy.fr.label });
    const hidden = () => whatsApp.classList.contains("invisible");
    const focus = (name: string, role = "textbox") => act(() => (screen.getByRole(role, { name }) as HTMLElement).focus());
    expect(hidden()).toBe(false);

    focus("Nom");
    expect(hidden()).toBe(true);
    // D'un champ à l'autre du formulaire, il reste effacé.
    focus("Message");
    expect(hidden()).toBe(true);
    // Le bouton d'envoi, un champ hors formulaire ou la sortie du champ le font revenir.
    focus("Envoyer", "button");
    expect(hidden()).toBe(false);
    focus("Message");
    focus("Rechercher");
    expect(hidden()).toBe(false);
    focus("Nom");
    act(() => (document.activeElement as HTMLElement).blur());
    expect(hidden()).toBe(false);
    expect(whatsApp.isConnected).toBe(true);
  });
});
