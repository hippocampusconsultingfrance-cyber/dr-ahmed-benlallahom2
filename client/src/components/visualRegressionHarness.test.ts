import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { baselineKeys, fetchBaseline, scenarios } from "../../../scripts/visual-regression.mjs";

const FORGE_ENVIRONMENT = { BUILT_IN_FORGE_API_URL: "https://forge.test/api/", BUILT_IN_FORGE_API_KEY: "synthetic-forge-key" };

describe("harness de régression visuelle", () => {
  it("couvre les routes publiques critiques dans les deux viewports", async () => {
    const source = await readFile(path.resolve(process.cwd(), "scripts/visual-regression.mjs"), "utf8");
    const packageJson = await readFile(path.resolve(process.cwd(), "package.json"), "utf8");

    for (const route of ["/booking", "/booking/confirmation?status=success&trackingId=VISUAL-TEST-2026", "/recruitment", "/recruitment/standard", "/recruitment/vvip-offshore", "/employers", "/why-hippocampus", "/venture/hippocampus-consulting", "/recruitment/unsubscribe", "/faq", "/search", "/resources", "/press", "/testimonials", "/gdpr", "/legal", "/visual-not-found", "/error"]) {
      expect(source).toContain(`"${route}"`);
    }
    // Un étalon publié par scénario, sous sa clé du stockage.
    const publishedBaselines = Object.values(baselineKeys);
    expect(publishedBaselines).toHaveLength(42);
    expect(Object.keys(baselineKeys).sort()).toEqual(scenarios.map(scenario => scenario.id).sort());
    for (const key of publishedBaselines) expect(key).toMatch(/^[a-z0-9-]+_[a-f0-9]+\.png$/);
    for (const multilingualScenario of ["booking-de-desktop", "recruitment-standard-de-mobile", "booking-zh-desktop", "employers-zh-mobile"]) {
      expect(source).toContain(`"${multilingualScenario}"`);
    }
    expect(source).toContain("mismatchLimit = 0.008");
    expect(source).toContain('reducedMotion: "reduce"');
    expect(source).toContain('cookieConsent');
    expect(packageJson).toContain('"test:visual"');
  });

  it("lit un étalon par une URL signée que le script demande lui-même à Forge, sans route du serveur testé (SECU-08)", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const calls: { url: string; authorization: string | null }[] = [];
    const fetchImpl = async (input: URL | string, init?: RequestInit) => {
      calls.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
      return String(input).startsWith("https://forge.test/")
        ? Response.json({ url: "https://signed.test/home-desktop_1d3eca43.png?signature=abc" })
        : new Response(png);
    };

    const baseline = await fetchBaseline(baselineKeys["home-desktop"], { environment: FORGE_ENVIRONMENT, fetchImpl });

    expect(baseline.equals(png)).toBe(true);
    expect(calls).toEqual([
      { url: "https://forge.test/api/v1/storage/presign/get?path=home-desktop_1d3eca43.png", authorization: "Bearer synthetic-forge-key" },
      // The Forge key goes to Forge alone, never with the signed URL.
      { url: "https://signed.test/home-desktop_1d3eca43.png?signature=abc", authorization: null },
    ]);
  });

  it("échoue avec un message clair sans configuration Forge, ou quand Forge refuse de signer", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 }));

    await expect(fetchBaseline("home-desktop_1d3eca43.png", { environment: {}, fetchImpl })).rejects.toThrow("BUILT_IN_FORGE_API_URL et BUILT_IN_FORGE_API_KEY sont requis");
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(fetchBaseline("home-desktop_1d3eca43.png", { environment: FORGE_ENVIRONMENT, fetchImpl })).rejects.toThrow("home-desktop_1d3eca43.png : URL signée refusée par Forge (403).");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
