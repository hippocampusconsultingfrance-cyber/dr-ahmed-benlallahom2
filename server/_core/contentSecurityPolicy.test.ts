import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { candidateSecurityRateLimits } from "../../drizzle/schema";
import { listen } from "../testSupport/candidateUploadApp";
import { createMemoryPg, type MemoryPg } from "../testing/memoryPgProxy";
import type { CspReportDependencies } from "./contentSecurityPolicy";

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));
vi.mock("../db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./notification", () => ({ notifyOwner: vi.fn(async () => true) }));

const { CONTENT_SECURITY_POLICY_REPORT_ONLY, CSP_REPORT_MAX_BYTES, CSP_REPORT_RATE_LIMIT, CSP_REPORT_ROUTE, registerCspReportRoute } = await import("./contentSecurityPolicy");

let memory: MemoryPg;
let close: () => Promise<void> = async () => undefined;
const log = vi.fn();

/** The report route alone, with the real persistent limiter on an in-memory database. */
async function startApp(options: Pick<CspReportDependencies, "log"> = {}) {
  const app = express();
  // The client IP is read from X-Forwarded-For, as behind Vercel.
  app.set("trust proxy", true);
  registerCspReportRoute(app, { log: options.log ?? log });
  const listening = await listen(app as never);
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
  return (body: string, contentType: string, ip = "203.0.113.7") => fetch(`${listening.baseUrl}${CSP_REPORT_ROUTE}`, {
    method: "POST",
    headers: { "content-type": contentType, "x-forwarded-for": ip },
    body,
  });
}

const legacyReport = (fields: Record<string, unknown>) => JSON.stringify({ "csp-report": fields });
const loggedText = () => JSON.stringify(log.mock.calls);
const limiterRows = () => memory.rows(candidateSecurityRateLimits).filter(row => row.action === CSP_REPORT_RATE_LIMIT.action);

beforeEach(() => {
  memory = createMemoryPg([candidateSecurityRateLimits]);
  state.memory = memory;
  log.mockReset();
});
afterEach(async () => {
  await close();
  vi.restoreAllMocks();
});

describe("POST /api/csp-report — rapports de la CSP en observation (SECU-02)", () => {
  it("journalise un rapport report-uri réduit à la directive, à l'origine bloquée et à la page sans paramètres", async () => {
    const post = await startApp();
    const response = await post(legacyReport({
      "document-uri": "https://drahmedbenlallahom.com/candidate/verify?token=jeton-secret#formulaire",
      referrer: "https://mail.example/inbox?user=patient@example.test",
      "violated-directive": "script-src-elem",
      "effective-directive": "script-src-elem",
      "original-policy": CONTENT_SECURITY_POLICY_REPORT_ONLY,
      disposition: "report",
      "blocked-uri": "https://evil.example/steal.js?cookie=session",
      "source-file": "https://drahmedbenlallahom.com/static/index-abc.js",
      "line-number": 12,
      "script-sample": "patient@example.test",
      "status-code": 200,
    }), "application/csp-report");

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[CspReport] Report-Only violation", {
      directive: "script-src-elem",
      blocked: "https://evil.example",
      page: "https://drahmedbenlallahom.com/candidate/verify",
      source: "https://drahmedbenlallahom.com",
    });
    for (const personal of ["jeton-secret", "patient@example.test", "mail.example", "steal.js", "cookie=session", "203.0.113.7"]) {
      expect(loggedText()).not.toContain(personal);
    }
  });

  it("garde le seul nom de la directive quand le navigateur envoie la directive entière (CSP niveau 2)", async () => {
    const post = await startApp();
    const response = await post(legacyReport({
      "document-uri": "https://drahmedbenlallahom.com/",
      "violated-directive": "script-src 'self' https://js.stripe.com",
      "blocked-uri": "eval",
    }), "application/csp-report; charset=utf-8");

    expect(response.status).toBe(204);
    expect(log.mock.calls).toEqual([["[CspReport] Report-Only violation", { directive: "script-src", blocked: "eval", page: "https://drahmedbenlallahom.com/" }]]);
  });

  it("lit un lot de l'API Reporting, sans doublon et sans les autres types de rapports", async () => {
    const post = await startApp();
    const stripeInline = {
      type: "csp-violation",
      url: "https://drahmedbenlallahom.com/booking?slot=2026-11-02T09:00",
      user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      body: {
        documentURL: "https://drahmedbenlallahom.com/booking?slot=2026-11-02T09:00",
        blockedURL: "inline",
        effectiveDirective: "script-src-elem",
        sourceFile: "https://js.stripe.com/v3/?session=abc",
        sample: "window.patientEmail='patient@example.test'",
        disposition: "report",
      },
    };
    const extensionHandler = {
      type: "csp-violation",
      url: "https://drahmedbenlallahom.com/faq",
      body: { blockedURL: "data:text/javascript;base64,YWxlcnQoMSk=", effectiveDirective: "script-src-attr", sourceFile: "chrome-extension://abcdefghijklmnop/content.js" },
    };
    const deprecation = { type: "deprecation", url: "https://drahmedbenlallahom.com/", body: { id: "UnloadHandler", message: "Unload event listeners are deprecated" } };

    const response = await post(JSON.stringify([stripeInline, stripeInline, extensionHandler, deprecation]), "application/reports+json");

    expect(response.status).toBe(204);
    expect(log.mock.calls).toEqual([
      ["[CspReport] Report-Only violation", { directive: "script-src-elem", blocked: "inline", page: "https://drahmedbenlallahom.com/booking", source: "https://js.stripe.com" }],
      ["[CspReport] Report-Only violation", { directive: "script-src-attr", blocked: "data:", page: "https://drahmedbenlallahom.com/faq", source: "chrome-extension:" }],
    ]);
    expect(loggedText()).not.toMatch(/patient@example\.test|session=abc|slot=|Macintosh|abcdefghijklmnop/);
    // One request, one attempt counted, whatever the number of reports it carries.
    expect(limiterRows()).toEqual([expect.objectContaining({ attempt_count: 1 })]);
  });

  it("répond 204 sans rien journaliser à un lot qui ne contient aucune violation CSP", async () => {
    const post = await startApp();
    const response = await post(JSON.stringify([{ type: "intervention", url: "https://drahmedbenlallahom.com/", body: { id: "x" } }]), "application/reports+json");

    expect(response.status).toBe(204);
    expect(log).not.toHaveBeenCalled();
    expect(limiterRows()).toEqual([]);
  });

  it("refuse un autre type de contenu (415) et un corps qui n'est pas un rapport (400), sans rien journaliser ni compter", async () => {
    const post = await startApp();
    const report = legacyReport({ "document-uri": "https://drahmedbenlallahom.com/", "effective-directive": "script-src-elem", "blocked-uri": "inline" });

    expect((await post(report, "application/json")).status).toBe(415);
    expect((await post(report, "text/plain")).status).toBe(415);
    expect((await post("{\"csp-report\": ", "application/csp-report")).status).toBe(400);
    expect((await post(JSON.stringify({ report: "csp" }), "application/csp-report")).status).toBe(400);
    expect((await post(JSON.stringify("csp-violation"), "application/reports+json")).status).toBe(400);
    expect(log).not.toHaveBeenCalled();
    expect(limiterRows()).toEqual([]);
  });

  it(`refuse un corps de plus de ${CSP_REPORT_MAX_BYTES / 1024} Ko (413) et accepte un lot juste en dessous`, async () => {
    const post = await startApp();
    const violation = (index: number) => ({ type: "csp-violation", url: `https://drahmedbenlallahom.com/page-${index}`, body: { documentURL: `https://drahmedbenlallahom.com/page-${index}`, blockedURL: "inline", effectiveDirective: "script-src-elem", originalPolicy: CONTENT_SECURITY_POLICY_REPORT_ONLY } });
    const batch = (count: number) => JSON.stringify(Array.from({ length: count }, (_, index) => violation(index)));
    let count = 1;
    while (Buffer.byteLength(batch(count + 1)) <= CSP_REPORT_MAX_BYTES) count += 1;

    const oversized = await post(batch(count + 1), "application/reports+json");
    expect(oversized.status).toBe(413);
    expect(log).not.toHaveBeenCalled();

    const accepted = await post(batch(count), "application/reports+json");
    expect(accepted.status).toBe(204);
    // At most 10 summaries are logged per request.
    expect(log).toHaveBeenCalledTimes(Math.min(count, 10));
  });

  it(`limite à ${CSP_REPORT_RATE_LIMIT.maxAttempts} rapports par IP sur la fenêtre du compteur persistant, sans garder l'IP en clair`, async () => {
    const post = await startApp();
    const report = legacyReport({ "document-uri": "https://drahmedbenlallahom.com/", "effective-directive": "script-src-elem", "blocked-uri": "inline" });

    for (let attempt = 0; attempt < CSP_REPORT_RATE_LIMIT.maxAttempts; attempt += 1) {
      expect((await post(report, "application/csp-report")).status).toBe(204);
    }
    expect(log).toHaveBeenCalledTimes(CSP_REPORT_RATE_LIMIT.maxAttempts);

    const limited = await post(report, "application/csp-report");
    expect(limited.status).toBe(429);
    expect(log).toHaveBeenCalledTimes(CSP_REPORT_RATE_LIMIT.maxAttempts);

    // Another visitor is not affected.
    expect((await post(report, "application/csp-report", "198.51.100.4")).status).toBe(204);
    expect(log).toHaveBeenCalledTimes(CSP_REPORT_RATE_LIMIT.maxAttempts + 1);

    expect(limiterRows()).toHaveLength(2);
    expect(JSON.stringify(limiterRows())).not.toMatch(/203\.0\.113\.7|198\.51\.100\.4/);
  });

  it("répond 204, jamais 500, quand le compteur ou le journal échoue", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const report = legacyReport({ "document-uri": "https://drahmedbenlallahom.com/", "effective-directive": "script-src-elem", "blocked-uri": "inline" });

    // No database: the limiter cannot count, the report is still logged.
    state.memory = null;
    const post = await startApp();
    expect((await post(report, "application/csp-report")).status).toBe(204);
    expect(log).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[CspReport] Rate limit unavailable:", "Error");
    await close();

    const failingLog = vi.fn(() => { throw new TypeError("log sink unavailable"); });
    const postWithFailingLog = await startApp({ log: failingLog });
    expect((await postWithFailingLog(report, "application/csp-report")).status).toBe(204);
    expect(failingLog).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[CspReport] Report dropped:", "TypeError");
  });
});
