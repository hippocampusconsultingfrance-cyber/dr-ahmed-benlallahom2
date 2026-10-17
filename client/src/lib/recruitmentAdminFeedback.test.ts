import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { driveRetryToast, googleDriveConnectionState, reanalysisToast, recruitmentAnalysisErrorLabel } from "./recruitmentTraceability";

const mailingTab = readFileSync(new URL("../components/MailingTab.tsx", import.meta.url), "utf8");
const briefsTab = readFileSync(new URL("../components/EmployerBriefsTab.tsx", import.meta.url), "utf8");
const recruitmentTab = readFileSync(new URL("../components/RecruitmentTab.tsx", import.meta.url), "utf8");

describe("retours honnêtes dans l’administration du recrutement", () => {
  it("« Relancer l’analyse » n’affiche un succès que si l’analyse a abouti (ADM-REC-02)", () => {
    expect(reanalysisToast({ outcome: "completed" }).tone).toBe("success");
    const failed = reanalysisToast({ outcome: "retry_scheduled", error: "Failed after 2 attempts. Last error: GatewayInternalServerError" });
    expect(failed.tone).toBe("warning");
    expect(failed.message).toContain("n’a pas répondu");
    expect(failed.message).not.toContain("Gateway");
    expect(reanalysisToast({ outcome: "failed", error: "cv_validation_pdf_encrypted" }).tone).toBe("error");
    expect(recruitmentAnalysisErrorLabel("AI Gateway requires a valid credit card (402)")).toContain("fournisseur");
    expect(recruitmentTab).toContain("recruitmentAnalysisErrorLabel(application.analysisLastError)");
  });

  it("Google Drive révoqué : en-tête « Reconnexion requise » et avertissement (ADM-DRIVE-01)", () => {
    expect(googleDriveConnectionState({ connected: true, lastError: "google_drive_token_invalid_grant" })).toEqual({ label: "Reconnexion Google Drive requise", needsAttention: true });
    expect(googleDriveConnectionState({ connected: true, lastError: null }).label).toBe("Google Drive connecté");
    expect(googleDriveConnectionState({ connected: false }).label).toBe("Connecter Google Drive");
    const toast = driveRetryToast({ outcome: "retry_scheduled", error: "google_drive_token_invalid_grant" });
    expect(toast.tone).toBe("warning");
    expect(toast.message).toContain("Reconnexion Google Drive requise");
    expect(driveRetryToast({ outcome: "completed" }).tone).toBe("success");
    expect(recruitmentTab).toContain("googleDriveConnectionState(driveExportStatus.data).label");
  });

  it("Mailing : avertissement en cas d’échec et relance des seuls échecs (ADM-MAIL-02)", () => {
    expect(mailingTab).toContain("if (failed === 0) toast.success(");
    expect(mailingTab).toContain("toast.warning(");
    expect(mailingTab).toContain("campaigns.retryFailed.useMutation");
    for (const language of ["fr", "en", "de", "zh"]) {
      const line = mailingTab.split("\n").find(entry => entry.startsWith(`  ${language}: { title:`));
      expect(line, language).toContain("retryFailed:");
      expect(line, language).toContain("campaignPartial:");
    }
  });

  it("Missions : panneau de détail, retrait de la shortlist et clôture (ADM-BRIEF-01/02)", () => {
    for (const field of ["selectedBrief.contactName", "mailto:${selectedBrief.email}", "selectedBrief.phone", "selectedBrief.requiredCertifications", "selectedBrief.notes", "formatDate(selectedBrief.createdAt)"]) {
      expect(briefsTab).toContain(field);
    }
    expect(briefsTab).toContain('status: "declined"');
    expect(briefsTab).toContain('status: "contract_signed"');
    expect(briefsTab).toContain("closeBrief(brief.id)");
    expect(briefsTab).toContain("{copy.shareReminder}");
    for (const language of ["fr", "en", "de", "zh"]) {
      const line = briefsTab.split("\n").find(entry => entry.startsWith(`  ${language}: { title:`));
      expect(line, language).toContain("removeFromShortlist:");
      expect(line, language).toContain("details:");
      // LEGAL-22: reminder to inform the candidate before any transmission.
      expect(line, language).toContain("shareReminder:");
    }
  });
});
