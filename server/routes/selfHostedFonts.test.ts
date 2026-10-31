import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { listen } from "../testSupport/candidateUploadApp";

// La vraie application Express (createApp), sans base ni Clerk, et sans
// serveur démarré à l'import (VERCEL=1).
vi.hoisted(() => {
  process.env.VERCEL = "1";
});
vi.mock("../db", () => ({ getDb: async () => null }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));

const { createApp } = await import("../_core/index");

const CRON_SECRET = "synthetic-cron-secret-for-self-hosted-fonts";
const GOOGLE_FONTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/;
const json = { "content-type": "application/json" };

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(async () => { await close(); });

describe("polices auto-hébergées (PUB-COOKIE-02 / PERF-05)", () => {
  it("ne mène à Google Fonts depuis aucune route Express : la sonde et chaque module de server/routes", async () => {
    // Lus par les routes à chaque requête ; aucun moniteur de tâche n'est appelé.
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("HEALTHCHECK_URL_REMINDER", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_51N9oXjDummyKeyForSelfHostedFontsTests000000");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${Buffer.from("self-hosted-fonts-test-secret").toString("base64")}`);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // Une réponse par module de server/routes, chacune un refus ou un échec
    // précoce qui n'atteint ni base (getDb rend null) ni service extérieur.
    const routes: Array<{ path: string; init?: RequestInit; status: number }> = [
      { path: "/api/health", status: 503 },
      // clientBriefs.ts
      { path: "/api/client-briefs", init: { method: "POST", headers: json, body: "{}" }, status: 400 },
      // recruitmentApply.ts : sans CV
      { path: "/api/recruitment/apply", init: { method: "POST", headers: json, body: "{}" }, status: 400 },
      // candidateDocuments.ts : sans session candidat, identifiant invalide, sans administrateur
      { path: "/api/candidate/documents", init: { method: "POST", headers: json, body: "{}" }, status: 401 },
      { path: "/api/candidate/documents/0/download", status: 400 },
      { path: "/api/admin/candidate-documents/1/download", status: 403 },
      // scheduled.ts : sans le secret, puis une tâche qui échoue faute de base
      { path: "/api/scheduled/reminder", status: 403 },
      { path: "/api/scheduled/reminder", init: { headers: { authorization: `Bearer ${CRON_SECRET}` } }, status: 500 },
      // stripeWebhook.ts et resendWebhook.ts : signatures refusées
      { path: "/api/stripe/webhook", init: { method: "POST", headers: { ...json, "stripe-signature": "t=1,v1=invalid" }, body: "{}" }, status: 400 },
      {
        path: "/api/webhooks/resend",
        init: { method: "POST", headers: { ...json, "svix-id": "msg_self_hosted_fonts", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,invalid" }, body: "{}" },
        status: 400,
      },
    ];

    for (const { path, init, status } of routes) {
      const response = await fetch(`${baseUrl}${path}`, init);
      expect(response.status, path).toBe(status);
      expect(response.headers.get("content-security-policy"), path).toContain("font-src 'self' data:;");
      expect(Array.from(response.headers.entries()).join("\n"), path).not.toMatch(GOOGLE_FONTS);
      expect(await response.text(), path).not.toMatch(GOOGLE_FONTS);
    }
  });
});
