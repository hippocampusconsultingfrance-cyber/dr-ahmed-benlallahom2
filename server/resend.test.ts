import { describe, it, expect } from "vitest";
import { Resend } from "resend";

describe("Resend API Key Validation", () => {
  it("should have RESEND_API_KEY configured", () => {
    expect(process.env.RESEND_API_KEY).toBeDefined();
    expect(process.env.RESEND_API_KEY!.length).toBeGreaterThan(10);
    expect(process.env.RESEND_API_KEY!.startsWith("re_")).toBe(true);
  });

  it("should be able to initialize Resend client", () => {
    const resend = new Resend(process.env.RESEND_API_KEY);
    expect(resend).toBeDefined();
    expect(resend.emails).toBeDefined();
  });

  it("should validate API key is active (restricted to sending is OK)", async () => {
    const resend = new Resend(process.env.RESEND_API_KEY);
    // A restricted key (send-only) will return 401 on domains.list
    // but that proves the key IS valid and recognized by Resend
    // An invalid key would return a different error
    const response = await resend.domains.list();
    if (response.error) {
      // "restricted_api_key" means the key is valid but limited to sending emails
      // This is the expected behavior for a send-only key
      expect(response.error.name).toBe("restricted_api_key");
    } else {
      // Full access key - also valid
      expect(response.data).toBeDefined();
    }
  });
});
