import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listen } from "../testSupport/candidateUploadApp";

// La vraie application Express (createApp), Clerk laissant passer, avec la
// configuration Forge de l'ancien hébergeur Manus encore présente : elle ne
// sert plus qu'à l'analyse par LLM (llm.ts), jamais à signer un chemin du
// stockage Manus pour un appelant anonyme (SECU-08).
// The discard port of the machine itself: nothing could leave it even if a request were made.
const FORGE_API_URL = "http://127.0.0.1:9/forge";
vi.hoisted(() => {
  process.env.VERCEL = "1";
  vi.stubEnv("BUILT_IN_FORGE_API_URL", "http://127.0.0.1:9/forge");
  vi.stubEnv(
    "BUILT_IN_FORGE_API_KEY",
    "synthetic-forge-key-for-the-removed-storage-proxy"
  );
});
vi.mock("../db", () => ({ getDb: async () => null }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));

const { createApp } = await import("./index");
const { ENV } = await import("./env");

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => {
  await close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("ancienne route de stockage Manus (SECU-08)", () => {
  it("ne monte plus GET /manus-storage/* : 404, sans redirection ni appel à Forge", async () => {
    expect(ENV.forgeApiUrl).toBe(FORGE_API_URL);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    for (const path of [
      "/manus-storage/cv/candidat.pdf",
      "/manus-storage/logo-abl_2afbc5e0.png",
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
      expect(response.status, path).toBe(404);
      expect(response.headers.get("location"), path).toBeNull();
    }
    // Only the test's own requests: the server asked Forge for no signed URL.
    expect(
      fetchSpy.mock.calls
        .map(([input]) => String(input))
        .filter(url => !url.startsWith(baseUrl))
    ).toEqual([]);
  });
});
