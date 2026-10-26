type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  "error-codes"?: string[];
};

const TRUSTED_HOSTS = new Set([
  "drahmedbenlallahom.com",
  "www.drahmedbenlallahom.com",
  "drbenlallah-esc8d3hd.manus.space",
  "localhost",
  "127.0.0.1",
]);

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
  // Cloudflare could not validate the token on its side: the token itself was not judged.
  if (!result.success && result["error-codes"]?.includes("internal-error")) throw new Error("candidate_turnstile_unavailable");
  if (!result.success || (result.hostname && !TRUSTED_HOSTS.has(result.hostname))) {
    throw new Error("candidate_turnstile_invalid");
  }
}

export function candidateRequestIp(headers: Record<string, unknown>): string | null {
  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || null;
  const realIp = headers["x-real-ip"];
  return typeof realIp === "string" ? realIp.trim() || null : null;
}
