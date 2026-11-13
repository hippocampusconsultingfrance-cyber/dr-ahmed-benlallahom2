import { describe, expect, it, vi } from "vitest";
import {
  checkGoogleDriveOAuthCredentials,
  GOOGLE_DRIVE_OAUTH_REDIRECT_URI,
  GOOGLE_OAUTH_TOKEN_URL,
} from "../scripts/check-google-drive-oauth.mjs";
import {
  buildGoogleDriveAuthorizationUrl,
  createGoogleDriveOAuthState,
} from "./googleDriveExport";

// The check of the real credentials against Google is a manual script (CODE-11), which the
// suite and the CI never run: here it is checked against a stand-in for Google's endpoint.
const CREDENTIALS = {
  GOOGLE_DRIVE_CLIENT_ID: "synthetic-client.apps.googleusercontent.com",
  GOOGLE_DRIVE_CLIENT_SECRET: "synthetic-client-secret",
};

const google = (status: number, body: unknown) =>
  vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json(body, { status })
  );

describe("contrôle manuel des identifiants OAuth Google Drive", () => {
  it("envoie un code d’essai volontairement invalide, et tient les identifiants pour reconnus quand Google refuse ce code (invalid_grant)", async () => {
    const fetchImpl = google(400, {
      error: "invalid_grant",
      error_description: "Malformed auth code.",
    });

    await expect(
      checkGoogleDriveOAuthCredentials({ environment: CREDENTIALS, fetchImpl })
    ).resolves.toEqual({
      ok: true,
      message:
        "Identifiants OAuth Google Drive reconnus : le code d'essai est refusé comme prévu, aucun jeton n'est émis.",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(GOOGLE_OAUTH_TOKEN_URL);
    expect(init.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      client_id: CREDENTIALS.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: CREDENTIALS.GOOGLE_DRIVE_CLIENT_SECRET,
      code: "credential-validation-probe",
      grant_type: "authorization_code",
      redirect_uri: GOOGLE_DRIVE_OAUTH_REDIRECT_URI,
    });
  });

  it("essaie l’adresse de retour que le site donne à Google lors de la connexion de Drive", () => {
    const authorizationUrl = new URL(
      buildGoogleDriveAuthorizationUrl(createGoogleDriveOAuthState())
    );
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      GOOGLE_DRIVE_OAUTH_REDIRECT_URI
    );
  });

  it.each([
    [
      401,
      {
        error: "invalid_client",
        error_description: "The OAuth client was not found.",
      },
      "HTTP 401, invalid_client",
    ],
    [
      400,
      { error: "redirect_uri_mismatch" },
      "HTTP 400, redirect_uri_mismatch",
    ],
    [503, "Service Unavailable", "HTTP 503, réponse sans code d'erreur"],
  ])(
    "signale un refus de Google (HTTP %i) sans jamais recopier le secret",
    async (status, body, said) => {
      const result = await checkGoogleDriveOAuthCredentials({
        environment: CREDENTIALS,
        fetchImpl: google(status, body),
      });

      expect(result).toEqual({
        ok: false,
        message: `Identifiants OAuth Google Drive refusés : ${said}.`,
      });
      expect(result.message).not.toContain(
        CREDENTIALS.GOOGLE_DRIVE_CLIENT_SECRET
      );
    }
  );

  it("ne joint pas Google quand un des identifiants manque", async () => {
    const fetchImpl = google(400, { error: "invalid_grant" });

    for (const environment of [
      {},
      { GOOGLE_DRIVE_CLIENT_ID: CREDENTIALS.GOOGLE_DRIVE_CLIENT_ID },
      { ...CREDENTIALS, GOOGLE_DRIVE_CLIENT_SECRET: "  " },
    ]) {
      await expect(
        checkGoogleDriveOAuthCredentials({ environment, fetchImpl })
      ).resolves.toEqual({
        ok: false,
        message:
          "GOOGLE_DRIVE_CLIENT_ID et GOOGLE_DRIVE_CLIENT_SECRET sont requis.",
      });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
