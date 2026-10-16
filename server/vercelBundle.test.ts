import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

/**
 * The Vercel function is one ESM bundle whose banner declares `createRequire`
 * and `require`. A server module importing a binding of the same name at top
 * level makes the whole bundle fail to load (SyntaxError: Identifier has
 * already been declared): every /api route would be down. Bundle it exactly
 * like `pnpm build` and let Node parse it.
 */
describe("bundle de la fonction Vercel (api/index.js)", () => {
  it("se charge sans conflit avec la bannière createRequire/require du build", async () => {
    const script: string = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")).scripts.build;
    const command = script.slice(script.indexOf("esbuild server/vercelEntry.ts"));
    const banner = /--banner:js="([^"]+)"/.exec(command)?.[1];
    expect(banner).toContain("const require = createRequire(import.meta.url);");
    expect(command).toContain("--platform=node --packages=external --bundle --format=esm");

    const directory = mkdtempSync(path.join(tmpdir(), "vercel-bundle-"));
    try {
      const outfile = path.join(directory, "index.mjs");
      await build({ entryPoints: ["server/vercelEntry.ts"], platform: "node", packages: "external", bundle: true, format: "esm", banner: { js: banner! }, outfile, logLevel: "silent" });
      const check = spawnSync(process.execPath, ["--check", outfile], { encoding: "utf8" });
      expect(check.stderr).toBe("");
      expect(check.status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
