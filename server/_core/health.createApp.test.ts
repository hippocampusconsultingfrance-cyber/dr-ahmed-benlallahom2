import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listen } from "../testSupport/candidateUploadApp";

// GET /api/health dans l’application réelle (donc aussi dans la fonction
// Vercel) : monté avant clerkMiddleware, il répond même quand une configuration
// Clerk cassée fait échouer toutes les autres routes /api.

const clerk = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { options: [] as unknown[] };
});

vi.mock("../db", () => ({ getDb: async () => ({ execute: async () => ({ rows: [{ "?column?": 1 }] }) }) }));
vi.mock("./notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  // A Clerk misconfiguration: every route mounted after clerkMiddleware fails.
  clerkMiddleware: (options: unknown) => {
    clerk.options.push(options);
    return (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => res.status(500).json({ error: "clerk_unavailable" });
  },
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  // Outside production the configuration is not enforced: with the database up, the probe answers 200.
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CLERK_PUBLISHABLE_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_browser_key_shared_with_the_server");
  const { createApp } = await import("./index");
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await close();
});

describe("GET /api/health dans createApp", () => {
  it("répond avant clerkMiddleware, quand une configuration Clerk fait échouer les autres routes", async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get("content-type")).toContain("application/json");
    expect(await health.json()).toMatchObject({ status: "ok", checks: { database: { status: "ok" }, configuration: { status: "ok" } } });

    const webhook = await fetch(`${baseUrl}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(webhook.status).toBe(500);
    expect(await webhook.json()).toEqual({ error: "clerk_unavailable" });
  });

  it("donne au serveur la clé publique Clerk du navigateur quand la sienne manque", () => {
    expect(clerk.options).toEqual([expect.objectContaining({ publishableKey: "pk_test_browser_key_shared_with_the_server" })]);
  });
});
