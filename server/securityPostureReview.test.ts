import { beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications, googleDriveConnections, securityEvents } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER, seedApplication } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// Bilan quotidien de sécurité (cron security-posture) : il nomme un quota Resend
// épuisé et rappelle chaque jour les états que le propriétaire doit corriger,
// même si leur alerte unique a été perdue (ABUS-03, REC-08, REC-09).
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async (_payload: { title: string; content: string }) => true) }));

const { runSecurityPostureReview } = await import("./scheduledJobs");
const { notifyOwner } = await import("./_core/notification");
const { AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR } = await import("./recruitmentAnalysis");

const HOUR_MS = 60 * 60 * 1000;

function db() { return state.db as InMemoryDrizzle; }
const report = () => vi.mocked(notifyOwner).mock.calls.at(-1)?.[0].content ?? "";

function seedQuotaEvent(quota: "daily" | "monthly", createdAt = new Date(Date.now() - HOUR_MS)) {
  db().seed(securityEvents, { actorKind: "system", category: "resend_quota_exceeded", outcome: "failed", severity: "high", metadata: JSON.stringify({ quota, emailKind: "admin_mfa" }), createdAt });
}

function seedDriveConnection(lastError: string | null) {
  db().seed(googleDriveConnections, {
    connectionKey: "recruitment_cv_export", authorizedByOpenId: "user_owner", folderId: "folder-id", lastError,
    refreshTokenCiphertext: "ciphertext", refreshTokenIv: "iv", refreshTokenAuthTag: "tag",
  });
}

function seedDossier(analysisStatus: string, analysisLastError: string | null, status = "new") {
  const row = seedApplication(db(), { email: `candidat${db().rows(cvApplications).length}@test.local` });
  Object.assign(row, { analysisStatus, analysisLastError, status });
}

beforeEach(() => {
  state.db = createInMemoryDrizzle();
  vi.mocked(notifyOwner).mockClear();
});

describe("bilan quotidien de sécurité : quota Resend et états durables", () => {
  it("nomme le quota Resend épuisé au lieu d’un simple nombre d’événements", async () => {
    seedQuotaEvent("daily");
    seedQuotaEvent("daily");
    seedQuotaEvent("monthly");
    seedQuotaEvent("daily", new Date(Date.now() - 30 * HOUR_MS));

    const review = await runSecurityPostureReview();

    expect(review).toMatchObject({ available: true, highSeverityEvents24h: 3, resendQuotaEvents24h: 3 });
    expect(report()).toContain("3 événement(s) de sécurité à gravité élevée");
    expect(report()).toContain("Quota Resend épuisé (quotidien et mensuel) : 3 email(s) refusé(s) faute de quota sur les dernières 24 heures.");
    expect(report()).toContain("Vérifiez la limite de votre offre dans Resend.");
  });

  it("rappelle chaque jour Google Drive à reconnecter et l’analyse IA en attente de crédit, tant que ces états durent", async () => {
    seedDriveConnection("google_drive_token_invalid_grant");
    seedDossier("degraded", AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR);
    seedDossier("degraded", AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR);
    // Already requeued by « Mettre à jour / reprendre l’IA », or analysed: not counted.
    seedDossier("queued", AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR);
    seedDossier("completed", null);
    // Rejected or archived: the button leaves them as they are, so not counted either.
    seedDossier("degraded", AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR, "rejected");
    seedDossier("degraded", AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR, "archived");

    for (let day = 0; day < 2; day += 1) {
      await expect(runSecurityPostureReview()).resolves.toMatchObject({ googleDriveReconnectRequired: true, cvAnalysesAwaitingAiCredit: 2 });
      expect(report()).toContain("Google Drive à reconnecter : Google refuse l’autorisation utilisée pour copier les CV");
      expect(report()).toContain("« Reconnexion Google Drive requise »");
      expect(report()).toContain("Analyse IA des CV indisponible (facturation du fournisseur) : 2 dossier(s) attendent leur analyse.");
      expect(report()).toContain("« Mettre à jour / reprendre l’IA »");
    }
    expect(vi.mocked(notifyOwner)).toHaveBeenCalledTimes(2);
  });

  it("ne rappelle pas l’analyse IA pour des dossiers refusés ou archivés, que « Mettre à jour / reprendre l’IA » laisse de côté", async () => {
    seedDossier("degraded", AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR, "rejected");
    seedDossier("degraded", AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR, "archived");

    await expect(runSecurityPostureReview()).resolves.toMatchObject({ cvAnalysesAwaitingAiCredit: 0 });
    expect(vi.mocked(notifyOwner)).not.toHaveBeenCalled();
  });

  it("n’écrit rien quand Drive est connecté, l’IA disponible et aucun quota atteint", async () => {
    seedDriveConnection("google_drive_upload_500_Backend Error");
    seedDossier("degraded", "other_error");

    await expect(runSecurityPostureReview()).resolves.toMatchObject({ resendQuotaEvents24h: 0, googleDriveReconnectRequired: false, cvAnalysesAwaitingAiCredit: 0 });
    expect(vi.mocked(notifyOwner)).not.toHaveBeenCalled();
  });
});
