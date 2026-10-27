type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  "error-codes"?: string[];
};

const TRUSTED_HOSTS = new Set([
  "drahmedbenlallahom.com",
  "www.drahmedbenlallahom.com",
  "localhost",
  "127.0.0.1",
]);

let extraHostsIgnoredInProductionLogged = false;

/**
 * Hosts accepted besides the site's own (SECU-02), to try the forms of a
 * preproduction to the end: TURNSTILE_EXTRA_HOSTNAMES, exact names separated
 * by commas, set only on Vercel's Preview environment to the preview's host.
 * Empty by default. Never a pattern: an entry that is not a plain host name
 * (`*`, scheme, port, path) is ignored, so no other *.vercel.app passes.
 * Ignored in Vercel's production (VERCEL_ENV=production), where no form is
 * tried on another host: set there by mistake, the logs say it once.
 */
function extraTrustedHosts(): Set<string> {
  const configured = process.env.TURNSTILE_EXTRA_HOSTNAMES ?? "";
  if (process.env.VERCEL_ENV === "production") {
    if (configured.trim() && !extraHostsIgnoredInProductionLogged) {
      extraHostsIgnoredInProductionLogged = true;
      console.warn("[Turnstile] TURNSTILE_EXTRA_HOSTNAMES is ignored in production; remove it from Vercel's Production environment");
    }
    return new Set();
  }
  return new Set(configured.split(",")
    .map(host => host.trim().toLowerCase())
    .filter(host => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(host)));
}

function isTrustedHost(hostname: string): boolean {
  // Read at every check, the site's own host included, so that a production
  // where the variable is set says it at its first protected form.
  const extraHosts = extraTrustedHosts();
  return TRUSTED_HOSTS.has(hostname) || extraHosts.has(hostname);
}

/**
 * Siteverify error codes for which the token itself was not judged: an
 * internal error at Cloudflare, or a request our server got wrong (secret
 * missing, or invalid after a rotation; malformed request).
 */
const UNJUDGED_TOKEN_ERROR_CODES = new Set(["internal-error", "missing-input-secret", "invalid-input-secret", "bad-request"]);

export async function verifyCandidateTurnstile(input: { token?: string; remoteIp?: string | null }): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !input.token) throw new Error("candidate_turnstile_required");

  const body = new URLSearchParams({ secret, response: input.token });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("candidate_turnstile_unavailable");
  const result = await response.json() as TurnstileResponse;
  if (!result.success && result["error-codes"]?.some(code => UNJUDGED_TOKEN_ERROR_CODES.has(code))) throw new Error("candidate_turnstile_unavailable");
  if (!result.success || (result.hostname && !isTrustedHost(result.hostname))) {
    throw new Error("candidate_turnstile_invalid");
  }
}

export function candidateRequestIp(headers: Record<string, unknown>): string | null {
  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || null;
  const realIp = headers["x-real-ip"];
  return typeof realIp === "string" ? realIp.trim() || null : null;
}
