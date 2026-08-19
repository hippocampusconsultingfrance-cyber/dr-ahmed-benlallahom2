import { describe, expect, it } from "vitest";

describe("Cloudflare Turnstile configuration", () => {
  it("exposes a configured secret for server-side verification", () => {
    expect(process.env.TURNSTILE_SECRET_KEY).toBeTruthy();
  });

  const externalSecurityTest = process.env.RUN_EXTERNAL_SECURITY_TESTS === "true" ? it : it.skip;

  externalSecurityTest("accepts the configured secret at the Siteverify endpoint", async () => {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    expect(secret).toBeTruthy();

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: secret!,
        response: "turnstile-configuration-validation",
      }),
    });
    const payload = await response.json() as { success?: boolean; "error-codes"?: string[] };

    expect(response.ok).toBe(true);
    expect(payload.success).toBe(false);
    expect(payload["error-codes"]).not.toContain("invalid-input-secret");
    expect(payload["error-codes"]).not.toContain("missing-input-secret");
  }, 10_000);
});
