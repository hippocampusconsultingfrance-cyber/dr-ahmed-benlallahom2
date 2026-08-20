import { describe, expect, it } from "vitest";

describe("identifiants OAuth Google Drive", () => {
  it("sont reconnus par le point de terminaison OAuth sans émettre de jeton", async () => {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    expect(clientId).toBeTruthy();
    expect(clientSecret).toBeTruthy();

    const payload = new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      code: "credential-validation-probe",
      grant_type: "authorization_code",
      redirect_uri: "https://drahmedbenlallahom.com/api/google-drive/oauth/callback",
    });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload,
    });
    const result = await response.json() as { error?: string };

    // The deliberately invalid authorization code must be rejected as a grant,
    // never as a client authentication failure. No OAuth token is requested or stored.
    expect(response.status).toBe(400);
    expect(result.error).toBe("invalid_grant");
  }, 15_000);
});
