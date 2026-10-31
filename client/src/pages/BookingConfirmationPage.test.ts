import { describe, expect, it } from "vitest";
import { buildConfirmationCalendarDescription, confirmationContent, getBookingConfirmationState, getDisplayedConfirmationState, STATUS_STALLED_AFTER_MS } from "./BookingConfirmationPage";

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

  it("sépare l’annonce de mise à jour automatique de sa variante « vérifiez votre email » après 2 min (RES-05)", () => {
    expect(STATUS_STALLED_AFTER_MS).toBe(2 * 60 * 1000);
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const { processing, appointment } = confirmationContent[language];
      expect(processing.description).not.toContain(processing.autoUpdate);
      expect(processing.stalled).not.toBe(processing.autoUpdate);
      expect(appointment.addToCalendar).toBeTruthy();
      expect(appointment.minutes(30)).toContain("30");
      expect(appointment.localTime("22:00")).toContain("22:00");
    }
    expect(confirmationContent.fr.processing.stalled).toContain("vérifiez votre email ou contactez-nous");
    expect(confirmationContent.en.processing.stalled).toContain("check your email or contact us");
  });

  it("ponctue les libellés du fichier agenda comme la langue de la page (RES-05)", () => {
    const details = { trackingId: "APTABC123DEF45", durationMinutes: 30, email: "contact@example.test", phone: "+33 1 23 45 67 89" };
    expect(buildConfirmationCalendarDescription(confirmationContent.fr, { ...details, amount: "150,00 €" }))
      .toBe("Référence : APTABC123DEF45\nDurée : 30 minutes\nMontant réglé : 150,00 €\nNous contacter : contact@example.test · +33 1 23 45 67 89");
    expect(buildConfirmationCalendarDescription(confirmationContent.en, { ...details, amount: "€150.00" }))
      .toBe("Reference: APTABC123DEF45\nDuration: 30 minutes\nAmount paid: €150.00\nContact us: contact@example.test · +33 1 23 45 67 89");
    expect(buildConfirmationCalendarDescription(confirmationContent.de, { ...details, amount: "150,00 €" }).split("\n")[0]).toBe("Referenz: APTABC123DEF45");
    expect(buildConfirmationCalendarDescription(confirmationContent.zh, { ...details, amount: "€150.00" }).split("\n")).toEqual([
      "编号：APTABC123DEF45",
      "时长：30 分钟",
      "已付金额：€150.00",
      "联系我们：contact@example.test · +33 1 23 45 67 89",
    ]);
    for (const language of ["en", "de", "zh"] as const) {
      expect(buildConfirmationCalendarDescription(confirmationContent[language], { ...details, amount: "€150.00" }), language).not.toContain(" :");
    }
  });

  it("provides a neutral and explicit state in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(confirmationContent[language].unknown.title.length).toBeGreaterThan(0);
      expect(confirmationContent[language].unknown.description.length).toBeGreaterThan(0);
      expect(confirmationContent[language].unknown.nextSteps.length).toBeGreaterThan(0);
    }
  });

  it("annonce la facture par e-mail dans les quatre langues sans lien de téléchargement public", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(confirmationContent[language].success.nextSteps).toMatch(/email|E-Mail|电子邮件/i);
      expect(confirmationContent[language].invoice).toMatch(/PDF/i);
    }
  });
});
