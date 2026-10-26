import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { candidateSecurityRateLimits } from "../drizzle/schema";
import { buildPrerenderedPages } from "../scripts/prerender-route-seo";
import { listen } from "./testSupport/candidateUploadApp";
import { createMemoryPg } from "./testing/memoryPgProxy";

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { memory: null as null | { db: unknown } };
});
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
// A Clerk misconfiguration: every route mounted after clerkMiddleware fails.
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => res.status(500).json({ error: "clerk_unavailable" }),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));

const { createApp } = await import("./_core/index");
const { OBSERVED_INLINE_SCRIPT_HASHES } = await import("./_core/contentSecurityPolicy");

const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const vercelPageHeaders = vercel.headers.find(rule => rule.source === "/(.*)")!.headers;

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  state.memory = createMemoryPg([candidateSecurityRateLimits]);
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await close(); });

const report = JSON.stringify({ "csp-report": { "document-uri": "https://drahmedbenlallahom.com/", "effective-directive": "script-src-elem", "blocked-uri": "inline" } });
const postReport = () => fetch(`${baseUrl}/api/csp-report`, { method: "POST", headers: { "content-type": "application/csp-report" }, body: report });

/** "a b; c d" → { a: "b", c: "d" } */
function directives(policy: string) {
  return Object.fromEntries(policy.split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const [name, ...values] = part.split(/\s+/);
    return [name, values.join(" ")];
  }));
}

describe("en-têtes de défense HTTP", () => {
  it("envoie depuis Express exactement les en-têtes que vercel.json donne aux pages", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await postReport();
    expect(vercelPageHeaders.map(header => header.key)).toEqual(expect.arrayContaining(["Content-Security-Policy", "Content-Security-Policy-Report-Only", "Reporting-Endpoints"]));
    for (const { key, value } of vercelPageHeaders) {
      expect(response.headers.get(key), key).toBe(value);
    }
  });

  it("déclare une CSP et des politiques de navigateur restrictives", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await postReport();
    const csp = directives(response.headers.get("content-security-policy") ?? "");
    expect(csp["frame-ancestors"]).toBe("'self'");
    expect(csp["object-src"]).toBe("'none'");
    // Only Stripe, Turnstile and Clerk as third-party script origins.
    expect(csp["script-src"].split(" ").filter(source => !source.startsWith("'"))).toEqual(["https://js.stripe.com", "https://challenges.cloudflare.com", "https://clerk.drahmedbenlallahom.com", "https://*.clerk.accounts.dev", "https://*.clerk.com"]);
    expect(csp["script-src"].split(" ")).toContain("'self'");
    expect(csp["script-src"].split(" ")).not.toContain("'unsafe-eval'");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=(), payment=(self)");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("observe la même CSP sans 'unsafe-inline' pour les scripts, rapportée à /api/csp-report (SECU-02)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await postReport();
    const enforced = directives(response.headers.get("content-security-policy") ?? "");
    const observed = directives(response.headers.get("content-security-policy-report-only") ?? "");

    expect(observed["script-src"]).toBe([enforced["script-src"].replace(" 'unsafe-inline'", ""), ...OBSERVED_INLINE_SCRIPT_HASHES].join(" "));
    expect(observed["script-src"]).not.toContain("unsafe-inline");
    // Next to 'unsafe-inline', a hash or nonce would make browsers ignore it and already block inline scripts.
    if (enforced["script-src"].split(" ").includes("'unsafe-inline'")) {
      expect(enforced["script-src"]).not.toMatch(/'(?:sha256|sha384|sha512|nonce)-|'strict-dynamic'/);
    }
    // Styles stay as enforced; upgrade-insecure-requests means nothing in a report-only policy.
    expect(observed["style-src"]).toBe("'self' 'unsafe-inline'");
    const { "script-src": _enforcedScripts, "upgrade-insecure-requests": _upgrade, ...enforcedRest } = enforced;
    const { "script-src": _observedScripts, "report-uri": reportUri, "report-to": reportTo, ...observedRest } = observed;
    expect(observedRest).toEqual(enforcedRest);

    expect(reportUri).toBe("/api/csp-report");
    expect(response.headers.get("reporting-endpoints")).toBe(`${reportTo}="/api/csp-report"`);
  });

  it("reçoit les rapports avant clerkMiddleware : 204 même quand Clerk fait échouer les autres routes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await postReport();
    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledWith("[CspReport] Report-Only violation", { directive: "script-src-elem", blocked: "inline", page: "https://drahmedbenlallahom.com/" });

    const behindClerk = await fetch(`${baseUrl}/api/client-briefs`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(behindClerk.status).toBe(500);
  });

  it("ne sert aucune page avec un script inline exécutable : la CSP observée n'a besoin d'aucune empreinte", () => {
    const template = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
    const pages = buildPrerenderedPages(template);
    expect(pages.length).toBeGreaterThan(10);
    let dataBlocks = 0;
    for (const page of pages) {
      for (const [, attributes, content] of page.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\btype="application\/ld\+json"/.test(attributes)) {
          dataBlocks += 1;
          continue;
        }
        expect(attributes, page.file).toMatch(/\bsrc="[^"]+"/);
        expect(content.trim(), page.file).toBe("");
      }
      expect(page.html, page.file).not.toMatch(/\son[a-z]+\s*=|javascript:/i);
    }
    // The home page's schema.org data blocks are rendered, and allowed as data.
    expect(dataBlocks).toBeGreaterThan(0);
  });
});
