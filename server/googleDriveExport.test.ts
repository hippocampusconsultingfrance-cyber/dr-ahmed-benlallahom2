import { describe, expect, it } from "vitest";
import { buildGoogleDriveAuthorizationUrl, createGoogleDriveOAuthState, googleDriveCvFileName, googleDriveExportRetryDisposition, googleDriveMutationRowCount, googleDriveRetryDelayMs } from "./googleDriveExport";

describe("export Google Drive des CV", () => {
  it("construit un nom de copie traçable sans caractères de chemin dangereux", () => {
    expect(googleDriveCvFileName("CV123", "../CV Dr. Amina?.pdf")).toBe("CV123-.._CV Dr. Amina_.pdf");
  });

  it("applique une reprise exponentielle plafonnée", () => {
    expect(googleDriveRetryDelayMs(1)).toBe(60_000);
    expect(googleDriveRetryDelayMs(2)).toBe(120_000);
    expect(googleDriveRetryDelayMs(10)).toBe(3_600_000);
  });

  it("reconnaît les résultats de mutation Neon et MySQL", () => {
    expect(googleDriveMutationRowCount({ rowCount: 1 })).toBe(1);
    expect(googleDriveMutationRowCount([{ affectedRows: 1 }])).toBe(1);
    expect(googleDriveMutationRowCount({ rowCount: 0 })).toBe(0);
  });

  it("ne recrée jamais une copie déjà terminée et réarme uniquement un échec terminal", () => {
    expect(googleDriveExportRetryDisposition("completed")).toBe("already_completed");
    expect(googleDriveExportRetryDisposition("running")).toBe("already_running");
    expect(googleDriveExportRetryDisposition("queued")).toBe("accelerate");
    expect(googleDriveExportRetryDisposition("retry")).toBe("accelerate");
    expect(googleDriveExportRetryDisposition("failed")).toBe("reset_failed");
    expect(googleDriveExportRetryDisposition(null)).toBe("create");
  });

  it("demande uniquement le périmètre Drive requis avec un accès hors ligne", () => {
    const authorizationUrl = new URL(buildGoogleDriveAuthorizationUrl(createGoogleDriveOAuthState()));
    expect(authorizationUrl.origin).toBe("https://accounts.google.com");
    expect(authorizationUrl.searchParams.get("access_type")).toBe("offline");
    expect(authorizationUrl.searchParams.get("prompt")).toBe("consent");
    expect(authorizationUrl.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe("https://drahmedbenlallahom.com/api/google-drive/oauth/callback");
  });
});
