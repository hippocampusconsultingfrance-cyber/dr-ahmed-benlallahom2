import { describe, expect, it } from "vitest";
import { BOOKING_RATE_LIMIT_MESSAGE, PUBLIC_FORM_RATE_LIMITS, publicFormRateLimitSubject } from "./routers";

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

  it("bounds public bookings separately per IP and per email, with a French message", () => {
    expect(PUBLIC_FORM_RATE_LIMITS.bookingIp).toMatchObject({
      action: "public_booking_create_ip",
      scope: "ip",
      maxAttempts: 6,
      windowMs: 60 * 60 * 1000,
      blockMs: 60 * 60 * 1000,
    });
    expect(PUBLIC_FORM_RATE_LIMITS.bookingEmail).toMatchObject({
      action: "public_booking_create_email",
      scope: "email",
      maxAttempts: 5,
      windowMs: 60 * 60 * 1000,
      blockMs: 60 * 60 * 1000,
    });
    expect(PUBLIC_FORM_RATE_LIMITS.bookingIp.blockedMessage).toBe(BOOKING_RATE_LIMIT_MESSAGE);
    expect(PUBLIC_FORM_RATE_LIMITS.bookingEmail.blockedMessage).toBe(BOOKING_RATE_LIMIT_MESSAGE);
    expect(BOOKING_RATE_LIMIT_MESSAGE).toMatch(/^Trop de tentatives de réservation/);
  });

  it("keeps the historical IP + email key for contact and GDPR forms", () => {
    expect(PUBLIC_FORM_RATE_LIMITS.contact.scope).toBe("ip_email");
    expect(PUBLIC_FORM_RATE_LIMITS.gdpr.scope).toBe("ip_email");
    expect(publicFormRateLimitSubject("ip_email", "abc", "a@example.com")).toBe("abc:a@example.com");
    expect(publicFormRateLimitSubject("ip_email", null, "a@example.com")).toBe("unknown:a@example.com");
  });

  it("never pools every visitor without an IP into one shared booking counter", () => {
    expect(publicFormRateLimitSubject("ip", "abc", "a@example.com")).toBe("ip:abc");
    expect(publicFormRateLimitSubject("ip", null, "a@example.com")).toBeNull();
    expect(publicFormRateLimitSubject("email", null, "a@example.com")).toBe("email:a@example.com");
  });

  it("protects appointments.create before any agenda access, without depending on Turnstile", async () => {
    const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("./routers.ts", import.meta.url), "utf8"));
    const createBlock = source.slice(source.indexOf("    create: publicProcedure"), source.indexOf("createCheckoutSession: publicProcedure"));
    expect(createBlock).toContain("customerEmail: z.string().email()");
    expect(createBlock).toContain('enforcePublicFormRateLimit({ kind: "bookingIp"');
    expect(createBlock).toContain('enforcePublicFormRateLimit({ kind: "bookingEmail"');
    expect(createBlock).toContain(">= MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL");
    expect(createBlock).not.toContain("verifyCandidateTurnstile");
    expect(createBlock.indexOf('kind: "bookingIp"')).toBeLessThan(createBlock.indexOf("await getDb()"));
    expect(createBlock.indexOf(">= MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL")).toBeLessThan(createBlock.indexOf("INSERT INTO appointments"));
  });
});
