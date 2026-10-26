import { describe, expect, it } from "vitest";
import {
  recruitmentDriveExportLabel,
  recruitmentDriveExportErrorLabel,
  recruitmentCandidatePortalLabel,
  recruitmentEmailDeliveryErrorLabel,
  recruitmentEmailDeliveryLabel,
} from "./recruitmentTraceability";

describe("libellés de traçabilité des candidatures", () => {
  it("distingue l'acceptation Resend de la distribution effective", () => {
    expect(recruitmentEmailDeliveryLabel("email.sent")).toBe("Accepté par Resend");
    expect(recruitmentEmailDeliveryLabel("email.delivered")).toBe("Distribué");
    expect(recruitmentEmailDeliveryLabel("email.delivery_unknown")).toBe("Livraison à confirmer");
    expect(recruitmentEmailDeliveryLabel("email.bounced")).toBe("Adresse rejetée");
  });

  it("rend explicites les reprises Google Drive", () => {
    expect(recruitmentDriveExportLabel("completed")).toBe("Copié dans Drive");
    expect(recruitmentDriveExportLabel("retry")).toBe("Nouvelle tentative prévue");
    expect(recruitmentDriveExportLabel("failed")).toBe("Échec de la copie");
    expect(recruitmentDriveExportErrorLabel("google_drive_token_invalid_grant")).toBe("Connexion Google Drive à renouveler");
    expect(recruitmentDriveExportErrorLabel("google_drive_upload_429")).toBe("Google Drive a refusé temporairement la copie");
  });

  it("explique les échecs d'accusé sans exposer le détail du fournisseur", () => {
    expect(recruitmentEmailDeliveryErrorLabel("provider_rejected")).toBe("Resend a refusé temporairement l’envoi");
    expect(recruitmentEmailDeliveryErrorLabel("delivery_exception")).toContain("aucune relance automatique");
    // ABUS-03: rate limit and used-up quota are told apart from a refusal.
    expect(recruitmentEmailDeliveryErrorLabel("rate_limited")).toContain("rien n’est parti");
    expect(recruitmentEmailDeliveryErrorLabel("quota")).toContain("Quota d’envoi Resend épuisé");
  });

  it("distingue l’invitation de l’activation de l’espace candidat", () => {
    expect(recruitmentCandidatePortalLabel(false, "email.sent")).toBe("Invitation acceptée par Resend");
    expect(recruitmentCandidatePortalLabel(false, "email.delivered")).toBe("Invitation distribuée");
    expect(recruitmentCandidatePortalLabel(true, "email.failed")).toBe("Espace actif");
    expect(recruitmentCandidatePortalLabel(false, "email.delivered", "email.sent")).toBe("Activation acceptée par Resend");
    expect(recruitmentCandidatePortalLabel(false, "email.delivered", "email.failed")).toBe("Échec de l’activation");
    expect(recruitmentCandidatePortalLabel(false, "email.delivery_unknown")).toBe("Invitation à confirmer");
  });
});
