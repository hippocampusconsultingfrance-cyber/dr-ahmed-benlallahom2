import { describe, expect, it } from "vitest";
import { buildGoogleDriveAuthorizationUrl, createGoogleDriveOAuthState, googleDriveCvFileName, googleDriveRetryDelayMs } from "./googleDriveExport";

describe("export Google Drive des CV", () => {
  it("construit un nom de copie traçable sans caractères de chemin dangereux", () => {
    expect(googleDriveCvFileName("CV123", "../CV Dr. Amina?.pdf")).toBe("CV123-.._CV Dr. Amina_.pdf");
  });

  it("applique une reprise exponentielle plafonnée", () => {
    expect(googleDriveRetryDelayMs(1)).toBe(60_000);
    expect(googleDriveRetryDelayMs(2)).toBe(120_000);
    expect(googleDriveRetryDelayMs(10)).toBe(3_600_000);
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
