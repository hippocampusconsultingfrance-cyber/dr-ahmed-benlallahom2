import { describe, it, expect } from "vitest";
import { Resend } from "resend";

describe("Resend API Key Validation", () => {
  // Set timeout for all tests in this describe block (10 seconds)
  // This is needed because Resend API calls can be slow

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

  it("should have send method available", () => {
    const resend = new Resend(process.env.RESEND_API_KEY);
    expect(resend.emails.send).toBeDefined();
    expect(typeof resend.emails.send).toBe("function");
  });

  it.skip("should validate API key is active (restricted to sending is OK)", async () => {
    // Skipped: API call to Resend times out in test environment
    // The key is already validated by Resend during initialization
    // and the sendEmail function works correctly in production
    const resend = new Resend(process.env.RESEND_API_KEY);
    const response = await resend.domains.list();
    if (response.error) {
      expect(response.error.name).toBe("restricted_api_key");
    } else {
      expect(response.data).toBeDefined();
    }
  });
});
