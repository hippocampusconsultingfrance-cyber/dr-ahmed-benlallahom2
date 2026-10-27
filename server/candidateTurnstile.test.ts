import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyCandidateTurnstile } from "./candidateTurnstile";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare is never called from the tests: the siteverify answer is simulated. */
function cloudflareAnswers(body: Record<string, unknown>, status = 200) {
  const siteverify = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", siteverify);
  return siteverify;
}

beforeEach(() => vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret-for-tests"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("vérification Turnstile côté serveur, dans tous les environnements", () => {
  it("accepte un jeton que Cloudflare valide pour le site, en lui transmettant le secret, le jeton et l’IP", async () => {
    const siteverify = cloudflareAnswers({ success: true, hostname: "drahmedbenlallahom.com" });

    await expect(verifyCandidateTurnstile({ token: "token-from-the-widget", remoteIp: "203.0.113.7" })).resolves.toBeUndefined();

    expect(siteverify).toHaveBeenCalledTimes(1);
    const [url, init] = siteverify.mock.calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({ secret: "turnstile-secret-for-tests", response: "token-from-the-widget", remoteip: "203.0.113.7" });
  });

  it("refuse un jeton rejeté par Cloudflare ou validé pour un autre site", async () => {
    cloudflareAnswers({ success: false, "error-codes": ["invalid-input-response"] });
    await expect(verifyCandidateTurnstile({ token: "forged-token" })).rejects.toThrow("candidate_turnstile_invalid");

    cloudflareAnswers({ success: true, hostname: "phishing.example" });
    await expect(verifyCandidateTurnstile({ token: "token-from-another-site" })).rejects.toThrow("candidate_turnstile_invalid");
  });

  it("n’accepte plus un jeton obtenu sur l’ancienne préversion Manus, seulement sur le site et en local (CODE-05)", async () => {
    cloudflareAnswers({ success: true, hostname: "drbenlallah-esc8d3hd.manus.space" });
    await expect(verifyCandidateTurnstile({ token: "token-from-the-manus-preview" })).rejects.toThrow("candidate_turnstile_invalid");

    for (const hostname of ["www.drahmedbenlallahom.com", "localhost"]) {
      cloudflareAnswers({ success: true, hostname });
      await expect(verifyCandidateTurnstile({ token: "token-from-the-widget" })).resolves.toBeUndefined();
    }
  });

  it("n’accepte un jeton d’une préproduction *.vercel.app que pour l’hôte exact déclaré dans TURNSTILE_EXTRA_HOSTNAMES (SECU-02)", async () => {
    const preview = "dr-ahmed-git-lot5-hippocampus.vercel.app";
    // Unset by default: a preview's token is refused, like any other host.
    cloudflareAnswers({ success: true, hostname: preview });
    await expect(verifyCandidateTurnstile({ token: "token-from-the-preview" })).rejects.toThrow("candidate_turnstile_invalid");

    vi.stubEnv("TURNSTILE_EXTRA_HOSTNAMES", ` ${preview.toUpperCase()} , staging.drahmedbenlallahom.com,`);
    for (const hostname of [preview, "staging.drahmedbenlallahom.com", "drahmedbenlallahom.com"]) {
      cloudflareAnswers({ success: true, hostname });
      await expect(verifyCandidateTurnstile({ token: "token-from-the-widget" })).resolves.toBeUndefined();
    }
    // Another preview of the same Vercel account is still refused.
    cloudflareAnswers({ success: true, hostname: "another-project.vercel.app" });
    await expect(verifyCandidateTurnstile({ token: "token-from-another-preview" })).rejects.toThrow("candidate_turnstile_invalid");

    // Never a pattern: a wildcard, or anything but a plain host name, accepts nothing.
    vi.stubEnv("TURNSTILE_EXTRA_HOSTNAMES", "*.vercel.app,.vercel.app,vercel.app*,https://other.vercel.app,other.vercel.app:443");
    for (const hostname of ["another-project.vercel.app", "other.vercel.app", "vercel.app"]) {
      cloudflareAnswers({ success: true, hostname });
      await expect(verifyCandidateTurnstile({ token: "token-from-a-preview" })).rejects.toThrow("candidate_turnstile_invalid");
    }
    // A token Cloudflare refuses stays refused on the declared host.
    vi.stubEnv("TURNSTILE_EXTRA_HOSTNAMES", preview);
    cloudflareAnswers({ success: false, hostname: preview, "error-codes": ["invalid-input-response"] });
    await expect(verifyCandidateTurnstile({ token: "forged-token" })).rejects.toThrow("candidate_turnstile_invalid");
  });

  it("refuse sans interroger Cloudflare un envoi sans jeton ou un serveur sans secret", async () => {
    const siteverify = cloudflareAnswers({ success: true, hostname: "drahmedbenlallahom.com" });

    await expect(verifyCandidateTurnstile({ token: "" })).rejects.toThrow("candidate_turnstile_required");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    await expect(verifyCandidateTurnstile({ token: "token-from-the-widget" })).rejects.toThrow("candidate_turnstile_required");

    expect(siteverify).not.toHaveBeenCalled();
  });

  it("refuse quand Cloudflare ne répond pas normalement", async () => {
    cloudflareAnswers({}, 503);
    await expect(verifyCandidateTurnstile({ token: "token-from-the-widget" })).rejects.toThrow("candidate_turnstile_unavailable");
    // Erreur interne de Cloudflare : le jeton n’a pas été jugé (la réservation le dit au patient, ABUS-02).
    cloudflareAnswers({ success: false, "error-codes": ["internal-error"] });
    await expect(verifyCandidateTurnstile({ token: "token-from-the-widget" })).rejects.toThrow("candidate_turnstile_unavailable");
  });

  it("ne tient pas pour refusé un jeton que Cloudflare n’a pas jugé à cause du serveur (secret erroné ou absent, requête mal formée)", async () => {
    for (const code of ["invalid-input-secret", "missing-input-secret", "bad-request"]) {
      cloudflareAnswers({ success: false, "error-codes": [code] });
      await expect(verifyCandidateTurnstile({ token: "token-from-the-widget" })).rejects.toThrow("candidate_turnstile_unavailable");
    }
    // Un jeton expiré ou déjà utilisé, lui, est bien refusé : le patient refait la vérification.
    cloudflareAnswers({ success: false, "error-codes": ["timeout-or-duplicate"] });
    await expect(verifyCandidateTurnstile({ token: "token-from-the-widget" })).rejects.toThrow("candidate_turnstile_invalid");
  });
});
