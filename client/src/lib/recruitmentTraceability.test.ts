import { describe, expect, it } from "vitest";
import {
  driveBatchRetryToast,
  driveRetryToast,
  reanalysisToast,
  reanalyzeFailedToast,
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

describe("retours des reprises après une panne de prestataire (REC-08, REC-09)", () => {
  it("« Relancer l’analyse » quand le crédit IA manque : avertissement, pas « analyse actualisée »", () => {
    const notice = reanalysisToast({ outcome: "ai_unavailable", error: "ai_gateway_billing_unavailable" });
    expect(notice.tone).toBe("warning");
    expect(notice.message).toContain("compte du fournisseur à vérifier");
    expect(notice.message).toContain("Mettre à jour / reprendre l’IA");
  });

  it("« Mettre à jour / reprendre l’IA » quand le crédit manque toujours : avertissement, pas « analyse traitée »", () => {
    const notice = reanalyzeFailedToast({ queued: 1, processed: 1, aiUnavailable: true });
    expect(notice).toEqual(reanalysisToast({ outcome: "ai_unavailable", error: "ai_gateway_billing_unavailable" }));
    expect(notice.tone).toBe("warning");
    expect(notice.message).toContain("compte du fournisseur à vérifier");
  });

  it("« Mettre à jour / reprendre l’IA » : traitées tout de suite, encore en file, ou rien à reprendre", () => {
    expect(reanalyzeFailedToast({ queued: 10, processed: 1, aiUnavailable: false })).toEqual({ tone: "success", message: "1 analyse traitée immédiatement · 9 encore en file" });
    expect(reanalyzeFailedToast({ queued: 1, processed: 1 })).toEqual({ tone: "success", message: "1 analyse traitée immédiatement" });
    expect(reanalyzeFailedToast({ queued: 3, processed: 0 })).toEqual({ tone: "info", message: "3 analyses remises en file : elles seront traitées au prochain passage." });
    expect(reanalyzeFailedToast({ queued: 0, processed: 0 })).toEqual({ tone: "success", message: "Aucune analyse à mettre à jour ou à reprendre" });
  });

  it("copie Drive quand la connexion est à renouveler : renvoie vers le bouton de reconnexion", () => {
    const notice = driveRetryToast({ outcome: "reconnect_required", error: "google_drive_token_invalid_grant" });
    expect(notice).toEqual({ tone: "warning", message: expect.stringContaining("Reconnexion Google Drive requise") });
  });

  it("relance groupée des copies Drive : dit combien sont parties, combien attendent, et pourquoi", () => {
    expect(driveBatchRetryToast({ requeued: 0, copied: 0, failedAgain: 0 })).toEqual({ tone: "info", message: "Aucune copie Google Drive échouée à relancer." });
    expect(driveBatchRetryToast({ requeued: 5, copied: 3, failedAgain: 0 })).toEqual({ tone: "success", message: "5 copies Google Drive remises en file : 3 copiées maintenant ; 2 au prochain passage du traitement." });
    expect(driveBatchRetryToast({ requeued: 1, copied: 1, failedAgain: 0 })).toEqual({ tone: "success", message: "1 copie Google Drive remise en file : 1 copiée maintenant." });
    expect(driveBatchRetryToast({ requeued: 3, copied: 1, failedAgain: 2 })).toEqual({ tone: "warning", message: "3 copies Google Drive remises en file : 1 copiée, 2 de nouveau en échec. Consultez le détail des dossiers." });
    expect(driveBatchRetryToast({ requeued: 2, copied: 0, failedAgain: 0, reconnectRequired: true })).toMatchObject({ tone: "warning", message: expect.stringContaining("Reconnexion Google Drive requise") });
    expect(driveBatchRetryToast({ requeued: 2, copied: 0, failedAgain: 0, notConnected: true })).toMatchObject({ tone: "warning", message: expect.stringContaining("n’est pas connecté") });
  });
});
