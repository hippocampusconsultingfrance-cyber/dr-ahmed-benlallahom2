import { describe, expect, it } from "vitest";
import { PUBLIC_FORM_RATE_LIMITS } from "./routers";

describe("public form rate limits", () => {
  it("keeps the rate limiter outside the deterministic integration fixtures", async () => {
    const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("./routers.ts", import.meta.url), "utf8"));
    expect(source).toContain('process.env.NODE_ENV === "test" || process.env.VITEST === "true"');
  });

  it("keeps contact submissions bounded without blocking ordinary use", () => {
    expect(PUBLIC_FORM_RATE_LIMITS.contact).toMatchObject({
      action: "public_contact_submit",
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      blockMs: 60 * 60 * 1000,
    });
  });

  it("keeps sensitive GDPR requests on a stricter persistent limit", () => {
    expect(PUBLIC_FORM_RATE_LIMITS.gdpr).toMatchObject({
      action: "public_gdpr_submit",
      maxAttempts: 3,
      windowMs: 24 * 60 * 60 * 1000,
      blockMs: 24 * 60 * 60 * 1000,
    });
  });
});
