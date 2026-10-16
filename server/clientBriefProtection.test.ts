import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { secureReference } from "./_core/secureReference";
import { renderSitemapXml } from "./routeSeo";

const serverSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const staticSource = readFileSync(new URL("./_core/static.ts", import.meta.url), "utf8");
const generatedSitemap = renderSitemapXml("2026-10-16");

function clientBriefRoute() {
  const start = serverSource.indexOf('app.post("/api/client-briefs"');
  const end = serverSource.indexOf('app.post("/api/recruitment/apply"');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return serverSource.slice(start, end);
}

describe("formulaire employeur /api/client-briefs", () => {
  it("applique une limitation persistante par IP et par email avec une réponse 429 en français", () => {
    const route = clientBriefRoute();
    expect(route).toContain('enforcePersistentRateLimit({ action: "public_client_brief_ip", subject: clientIp, maxAttempts: 5, windowMs: 60 * 60 * 1000');
    expect(route).toContain('enforcePersistentRateLimit({ action: "public_client_brief_email", subject: parsed.data.email, maxAttempts: 10, windowMs: 24 * 60 * 60 * 1000');
    expect(route).toContain('protectionError.message === "candidate_security_rate_limited"');
    expect(route).toContain("res.status(429).json({ error: \"Trop de demandes ont été envoyées.");
    // Rate limiting must run before anything is stored or the owner is notified.
    expect(route.indexOf("enforcePersistentRateLimit")).toBeLessThan(route.indexOf("INSERT INTO client_briefs"));
    expect(route.indexOf("enforcePersistentRateLimit")).toBeLessThan(route.indexOf("notifyOwner"));
  });

  it("garde le honeypot et n’impose pas Turnstile au formulaire", () => {
    const route = clientBriefRoute();
    expect(route).toContain("if (parsed.data.website.trim())");
    expect(route).not.toContain("verifyCandidateTurnstile");
    expect(route).not.toContain("turnstileToken");
  });

  it("génère des références imprévisibles au lieu de Math.random()", () => {
    expect(serverSource).not.toContain("Math.random()");
    expect(clientBriefRoute()).toContain('const briefId = secureReference("BRIEF", 12);');
    expect(serverSource).toContain('const trackingId = secureReference("CV", 16);');
  });
});

describe("références publiques aléatoires", () => {
  it("respecte le préfixe, la longueur des colonnes (20) et le format accepté par Resend", () => {
    const brief = secureReference("BRIEF", 12);
    const cv = secureReference("CV", 16);
    expect(brief).toMatch(/^BRIEF[A-HJ-NP-Z2-9]{12}$/);
    expect(cv).toMatch(/^CV[A-HJ-NP-Z2-9]{16}$/);
    expect(brief.length).toBeLessThanOrEqual(20);
    expect(cv.length).toBeLessThanOrEqual(20);
    expect(cv).toMatch(/^[A-Za-z0-9_-]{3,64}$/);
  });

  it("ne produit pas de collision sur un large échantillon", () => {
    const references = new Set(Array.from({ length: 5_000 }, () => secureReference("CV", 16)));
    expect(references.size).toBe(5_000);
  });
});

describe("sitemap unique", () => {
  it("ne génère plus de sitemap divergent côté Express", () => {
    expect(serverSource).not.toContain('app.get("/sitemap.xml"');
    expect(serverSource).not.toContain("/venture/novarena");
  });

  it("sert le sitemap.xml généré au build dans dist/public", () => {
    // static.ts is owned elsewhere: only require that dist/public is served as-is.
    expect(staticSource).toMatch(/app\.use\(express\.static\(distPath\b/);
    expect(generatedSitemap).toContain("<urlset");
    expect(generatedSitemap).not.toContain("/venture/novarena");
  });
});
