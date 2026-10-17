import { describe, expect, it } from "vitest";
import { confirmationContent, getBookingConfirmationState, getDisplayedConfirmationState } from "./BookingConfirmationPage";

describe("booking confirmation state", () => {
  it("does not treat an absent or unknown Stripe status as a successful payment", () => {
    expect(getBookingConfirmationState("success")).toBe("success");
    expect(getBookingConfirmationState("canceled")).toBe("canceled");
    expect(getBookingConfirmationState(null)).toBe("unknown");
    expect(getBookingConfirmationState("unexpected")).toBe("unknown");
  });

  it("ne prétend jamais « consultation confirmée » sans confirmation du serveur", () => {
    expect(getDisplayedConfirmationState("success", { hasSession: true, state: "confirmed" })).toBe("confirmed");
    expect(getDisplayedConfirmationState("success", { hasSession: true })).toBe("processing");
    expect(getDisplayedConfirmationState("success", { hasSession: true, state: "processing" })).toBe("processing");
    expect(getDisplayedConfirmationState("success", { hasSession: true, state: "attention" })).toBe("attention");
    expect(getDisplayedConfirmationState("success", { hasSession: true, state: "not_paid" })).toBe("unknown");
    expect(getDisplayedConfirmationState("success", { hasSession: true, state: "unknown" })).toBe("unknown");
    // Ancienne URL de succès sans session : vérification en cours, jamais « confirmée ».
    expect(getDisplayedConfirmationState("success", { hasSession: false })).toBe("processing");
    expect(getDisplayedConfirmationState("canceled", { hasSession: false })).toBe("canceled");
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(confirmationContent[language].processing.title).toBeTruthy();
      expect(confirmationContent[language].attention.nextSteps.length).toBeGreaterThan(20);
      expect(confirmationContent[language].contactTitle).toBeTruthy();
    }
    expect(confirmationContent.fr.attention.eyebrow).toBe("Réservation à régulariser");
  });

  it("n’affiche les étapes de confirmation qu’après un paiement, avec des liens de contact", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./BookingConfirmationPage.tsx", import.meta.url), "utf8"));
    expect(source).toContain('{(displayed === "confirmed" || displayed === "processing") && (');
    expect(source).toContain("{isConfirmed && (");
    expect(source).toContain("mailto:${siteConfig.email}");
    expect(source).toContain("trpc.appointments.publicStatus.useQuery(");
  });

  it("provides a neutral and explicit state in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(confirmationContent[language].unknown.title.length).toBeGreaterThan(0);
      expect(confirmationContent[language].unknown.description.length).toBeGreaterThan(0);
      expect(confirmationContent[language].unknown.nextSteps.length).toBeGreaterThan(0);
    }
  });

  it("keeps the confirmation route out of search indexing", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingConfirmationPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain("noIndex");
    // Cartes « email / facture » réservées à un paiement confirmé par le serveur.
    expect(source).toContain("isConfirmed && (");
  });

  it("annonce la facture par e-mail dans les quatre langues sans lien de téléchargement public", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(confirmationContent[language].success.nextSteps).toMatch(/email|E-Mail|电子邮件/i);
      expect(confirmationContent[language].invoice).toMatch(/PDF/i);
    }
  });
});
