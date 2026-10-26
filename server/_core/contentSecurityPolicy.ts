import express, { type Express } from "express";
import { recordPersistentRateLimitAttempt } from "../candidateSecurity";

/**
 * Browser policies of the site. Express sends them on its responses and
 * vercel.json on the pages Vercel serves itself: both must stay identical
 * (server/securityHeaders.test.ts compares them).
 */
export const CSP_REPORT_ROUTE = "/api/csp-report";
const CSP_REPORTING_ENDPOINT = "csp-endpoint";

// Origins are restricted to the application and the third parties genuinely
// required for checkout, sign-in and bot protection.
const CONTENT_SECURITY_POLICY_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com https://clerk.drahmedbenlallahom.com https://*.clerk.accounts.dev https://*.clerk.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' ws: wss: https://api.stripe.com https://challenges.cloudflare.com https://clerk.drahmedbenlallahom.com https://*.clerk.accounts.dev https://*.clerk.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com https://clerk.drahmedbenlallahom.com https://*.clerk.accounts.dev https://*.clerk.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
];

export const CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY_DIRECTIVES.join("; ");

/**
 * Hashes ('sha256-…') of the legitimate inline scripts the observation finds,
 * allowed by the report-only policy only: next to 'unsafe-inline', a hash makes
 * browsers ignore 'unsafe-inline' and block every other inline script, which
 * would enforce the switch before the observation ends. They move to
 * CONTENT_SECURITY_POLICY_DIRECTIVES when 'unsafe-inline' is removed there.
 */
export const OBSERVED_INLINE_SCRIPT_HASHES: readonly string[] = [];

/**
 * SECU-02: the same policy without 'unsafe-inline' in script-src, only
 * observed (reported to CSP_REPORT_ROUTE) before it is enforced. The build has
 * no executable inline script (only application/ld+json data blocks, which
 * CSP does not check), so a report comes from a third party (Clerk, Stripe,
 * Turnstile), a browser extension or an injection. upgrade-insecure-requests
 * is left out: browsers ignore it in a report-only policy and warn about it on
 * every page.
 */
export const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  ...CONTENT_SECURITY_POLICY_DIRECTIVES
    .filter(directive => directive !== "upgrade-insecure-requests")
    .map(directive => directive.startsWith("script-src ") ? [directive.replace(" 'unsafe-inline'", ""), ...OBSERVED_INLINE_SCRIPT_HASHES].join(" ") : directive),
  `report-uri ${CSP_REPORT_ROUTE}`,
  `report-to ${CSP_REPORTING_ENDPOINT}`,
].join("; ");

/** Endpoint named by report-to (Reporting API); report-uri serves the browsers without it. */
export const REPORTING_ENDPOINTS = `${CSP_REPORTING_ENDPOINT}="${CSP_REPORT_ROUTE}"`;

/**
 * The policy with a script-src that allows inline scripts: 'unsafe-inline'
 * after 'self', without the hashes, nonces and 'strict-dynamic' next to which
 * browsers ignore it.
 */
export function withInlineScripts(policy: string) {
  return policy.split("; ").map(directive => {
    const [name, ...sources] = directive.split(" ");
    if (name !== "script-src") return directive;
    const kept = sources.filter(source => source !== "'unsafe-inline'" && source !== "'strict-dynamic'" && !/^'(?:sha256|sha384|sha512|nonce)-/i.test(source));
    kept.splice(kept.indexOf("'self'") + 1, 0, "'unsafe-inline'");
    return [name, ...kept].join(" ");
  }).join("; ");
}

/**
 * The CSP headers Express sends in this environment. Development keeps inline
 * scripts allowed whatever the enforced policy, and observes nothing: Vite's
 * page has an inline script (the React refresh preamble of
 * @vitejs/plugin-react) without which no component loads.
 */
export function contentSecurityPolicyHeaders(nodeEnv = process.env.NODE_ENV): Record<string, string> {
  if (nodeEnv === "development") return { "Content-Security-Policy": withInlineScripts(CONTENT_SECURITY_POLICY) };
  return {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "Content-Security-Policy-Report-Only": CONTENT_SECURITY_POLICY_REPORT_ONLY,
    "Reporting-Endpoints": REPORTING_ENDPOINTS,
  };
}

/** report-uri sends application/csp-report, report-to application/reports+json. */
const CSP_REPORT_CONTENT_TYPES = ["application/csp-report", "application/reports+json"];
/**
 * Each report repeats the policy (about 1.5 KB with its URLs), and a Reporting
 * API batch holds every report of the last minute or so: room for about 40.
 * Only CSP_REPORT_MAX_SUMMARIES of them are logged.
 */
export const CSP_REPORT_MAX_BYTES = 64 * 1024;
/** Per client IP: enough for a visit with a few violations on each page, not to flood the logs. */
export const CSP_REPORT_RATE_LIMIT = { action: "csp_report_ip", maxAttempts: 30, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 };
const CSP_REPORT_MAX_SUMMARIES = 10;

/** What is logged of a violation: no query string, no path of a blocked URL, no IP or user agent. */
export type CspViolationSummary = { directive: string; blocked: string; page: string; source?: string };

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function directiveName(value: unknown): string {
  // CSP level 2 browsers send the whole violated directive ("script-src 'self' …").
  const name = typeof value === "string" ? value.trim().split(/\s+/, 1)[0]!.toLowerCase() : "";
  return /^[a-z-]{1,40}$/.test(name) ? name : "unknown";
}

/** An http(s)/ws(s) URL reduced to its origin, any other URL to its scheme; keywords ("inline", "eval") kept. */
function originOnly(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim();
  const url = parseUrl(text);
  if (!url) return /^[a-z][a-z-]{0,39}$/i.test(text) ? text.toLowerCase() : "unknown";
  return ["http:", "https:", "ws:", "wss:"].includes(url.protocol) ? url.origin : url.protocol;
}

function pageWithoutQuery(value: unknown): string {
  const url = typeof value === "string" ? parseUrl(value.trim()) : null;
  if (!url) return "unknown";
  if (url.protocol !== "http:" && url.protocol !== "https:") return url.protocol;
  return `${url.origin}${url.pathname.slice(0, 200)}`;
}

/**
 * Summaries of the CSP violations of a report body, deduplicated; null when
 * the body is neither format. Other Reporting API report types are skipped.
 */
export function summarizeCspReports(payload: unknown): CspViolationSummary[] | null {
  let violations: Array<{ directive: unknown; blocked: unknown; page: unknown; source: unknown }>;
  if (Array.isArray(payload)) {
    violations = payload
      .filter((report): report is Fields => isFields(report) && report.type === "csp-violation" && isFields(report.body))
      .map(report => {
        const body = report.body as Fields;
        return { directive: body.effectiveDirective, blocked: body.blockedURL, page: body.documentURL ?? report.url, source: body.sourceFile };
      });
  } else if (isFields(payload) && isFields(payload["csp-report"])) {
    const report = payload["csp-report"];
    violations = [{ directive: report["effective-directive"] ?? report["violated-directive"], blocked: report["blocked-uri"], page: report["document-uri"], source: report["source-file"] }];
  } else {
    return null;
  }
  const summaries = new Map<string, CspViolationSummary>();
  for (const violation of violations) {
    const source = originOnly(violation.source);
    const summary: CspViolationSummary = {
      directive: directiveName(violation.directive),
      blocked: originOnly(violation.blocked) ?? "unknown",
      page: pageWithoutQuery(violation.page),
      ...(source ? { source } : {}),
    };
    summaries.set(JSON.stringify(summary), summary);
  }
  return Array.from(summaries.values()).slice(0, CSP_REPORT_MAX_SUMMARIES);
}

export type CspReportDependencies = {
  /** Counts one report of this client; false once it is over the limit. */
  countReport?: (clientIp: string) => Promise<boolean>;
  log?: (message: string, summary: CspViolationSummary) => void;
};

async function countReportOfIp(clientIp: string) {
  const state = await recordPersistentRateLimitAttempt({ ...CSP_REPORT_RATE_LIMIT, subject: clientIp });
  return !state.blocked;
}

const readReportBody = express.raw({ type: CSP_REPORT_CONTENT_TYPES, limit: CSP_REPORT_MAX_BYTES });

/**
 * POST /api/csp-report: receives the browsers' reports of the report-only
 * policy and logs one summary line per violation ("[CspReport]" in the Vercel
 * logs). Answers 204, or 4xx for a body that is not a report, too large
 * (413) or over the per-IP limit (429); never 500, a report is not worth an
 * error. Mounted before clerkMiddleware, like /api/health.
 */
export function registerCspReportRoute(app: Express, { countReport = countReportOfIp, log = (message, summary) => console.warn(message, summary) }: CspReportDependencies = {}) {
  app.post(CSP_REPORT_ROUTE, (req, res) => {
    if (!req.is(CSP_REPORT_CONTENT_TYPES)) {
      res.status(415).end();
      return;
    }
    readReportBody(req, res, async parseError => {
      try {
        if (parseError) {
          res.status((parseError as { type?: string }).type === "entity.too.large" ? 413 : 400).end();
          return;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "");
        } catch {
          res.status(400).end();
          return;
        }
        const summaries = summarizeCspReports(payload);
        if (!summaries) {
          res.status(400).end();
          return;
        }
        if (summaries.length > 0) {
          let allowed = true;
          try {
            allowed = await countReport(req.ip || "unknown");
          } catch (error) {
            // Limiter unavailable (database): the report is still logged.
            console.error("[CspReport] Rate limit unavailable:", error instanceof Error ? error.name : "UnknownError");
          }
          if (!allowed) {
            res.status(429).end();
            return;
          }
          for (const summary of summaries) log("[CspReport] Report-Only violation", summary);
        }
        res.status(204).end();
      } catch (error) {
        console.error("[CspReport] Report dropped:", error instanceof Error ? error.name : "UnknownError");
        if (!res.headersSent) res.status(204).end();
      }
    });
  });
}
