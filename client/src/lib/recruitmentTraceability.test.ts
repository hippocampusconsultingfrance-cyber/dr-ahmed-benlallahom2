import { describe, expect, it } from "vitest";
import {
  recruitmentDriveExportLabel,
  recruitmentDriveExportErrorLabel,
  recruitmentEmailDeliveryErrorLabel,
  recruitmentEmailDeliveryLabel,
} from "./recruitmentTraceability";

describe("libellés de traçabilité des candidatures", () => {
  it("distingue l'acceptation Resend de la distribution effective", () => {
    expect(recruitmentEmailDeliveryLabel("email.sent")).toBe("Accepté par Resend");
    expect(recruitmentEmailDeliveryLabel("email.delivered")).toBe("Distribué");
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
    expect(recruitmentEmailDeliveryErrorLabel("delivery_exception")).toBe("Le service d’e-mail était temporairement indisponible");
  });
});
