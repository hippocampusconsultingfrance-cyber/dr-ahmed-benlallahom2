import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const serverSource = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");

describe("en-têtes de défense HTTP", () => {
  it("déclare une CSP et des politiques de navigateur restrictives", () => {
    expect(serverSource).toContain('"Content-Security-Policy"');
    expect(serverSource).toContain("frame-ancestors 'self'");
    expect(serverSource).toContain('"Referrer-Policy", "strict-origin-when-cross-origin"');
    expect(serverSource).toContain('"Permissions-Policy"');
    expect(serverSource).toContain('"X-Content-Type-Options", "nosniff"');
  });

  it("n’autorise explicitement que Stripe et Turnstile comme origines tierces sensibles", () => {
    expect(serverSource).toContain("https://js.stripe.com");
    expect(serverSource).toContain("https://challenges.cloudflare.com");
    expect(serverSource).toContain("object-src 'none'");
  });
});
