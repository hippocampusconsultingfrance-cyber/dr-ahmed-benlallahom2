import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

/** The esbuild command of `pnpm build` that bundles the Vercel function, and where it writes it. */
function vercelBundleCommand() {
  const script: string = JSON.parse(
    readFileSync(path.join(process.cwd(), "package.json"), "utf8")
  ).scripts.build;
  const command = script.slice(script.indexOf("esbuild server/vercelEntry.ts"));
  return {
    command,
    banner: /--banner:js="([^"]+)"/.exec(command)?.[1],
    outfile: /--outfile=(\S+)/.exec(command)?.[1],
  };
}

/**
 * The Vercel function is one ESM bundle whose banner declares `createRequire`
 * and `require`. A server module importing a binding of the same name at top
 * level makes the whole bundle fail to load (SyntaxError: Identifier has
 * already been declared): every /api route would be down. Bundle it exactly
 * like `pnpm build` and let Node parse it.
 */
describe("bundle de la fonction Vercel (dist/vercel/index.js, re-exporté par api/index.js)", () => {
  it("se charge sans conflit avec la bannière createRequire/require du build", async () => {
    const { command, banner, outfile } = vercelBundleCommand();
    expect(banner).toContain("const require = createRequire(import.meta.url);");
    expect(command).toContain(
      "--platform=node --packages=external --bundle --format=esm"
    );

    const directory = mkdtempSync(path.join(tmpdir(), "vercel-bundle-"));
    try {
      const bundle = path.join(directory, outfile!);
      await build({
        entryPoints: ["server/vercelEntry.ts"],
        platform: "node",
        packages: "external",
        bundle: true,
        format: "esm",
        banner: { js: banner! },
        outfile: bundle,
        logLevel: "silent",
      });
      const check = spawnSync(process.execPath, ["--check", bundle], {
        encoding: "utf8",
      });
      expect(check.stderr).toBe("");
      expect(check.status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);

  /**
   * EXPL-15: every module of the bundle is imported at the function's cold
   * start, so a module importing pdfkit, @vercel/blob or svix at the top would
   * load it before the first request again. Only an import() may load them.
   */
  it("ne charge pdfkit, @vercel/blob et svix qu'à la demande, par import()", async () => {
    const onDemand = ["@vercel/blob", "pdfkit", "svix"];
    const { metafile } = await build({
      entryPoints: ["server/vercelEntry.ts"],
      platform: "node",
      packages: "external",
      bundle: true,
      format: "esm",
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    const imports = Object.entries(metafile.inputs).flatMap(([file, input]) =>
      input.imports
        .filter(({ path: specifier }) =>
          onDemand.some(
            name => specifier === name || specifier.startsWith(`${name}/`)
          )
        )
        .map(({ path: specifier, kind }) => ({ file, specifier, kind }))
    );
    expect(imports.filter(({ kind }) => kind !== "dynamic-import")).toEqual([]);
    expect(
      [...new Set(imports.map(({ specifier }) => specifier))].sort()
    ).toEqual(onDemand);
  }, 30_000);

  /**
   * CODE-13: the build no longer writes the versioned api/index.js, which held
   * a bundle of August. Vercel starts that file, which serves the handler of the
   * bundle the build has just written, whatever that bundle holds.
   */
  it("fait servir par api/index.js, tel qu'il est versionné, le gestionnaire du bundle que le build écrit", () => {
    const { outfile } = vercelBundleCommand();
    expect(outfile).toBe("dist/vercel/index.js");

    const directory = mkdtempSync(path.join(tmpdir(), "vercel-function-"));
    try {
      writeFileSync(
        path.join(directory, "package.json"),
        JSON.stringify({ type: "module" })
      );
      mkdirSync(path.join(directory, "api"));
      copyFileSync(
        path.join(process.cwd(), "api", "index.js"),
        path.join(directory, "api", "index.js")
      );
      // A stand-in for the build's output, at the path the build writes it.
      mkdirSync(path.dirname(path.join(directory, outfile!)), {
        recursive: true,
      });
      writeFileSync(
        path.join(directory, outfile!),
        "export default function handler(req, res) { res.end(`bundle du build : ${req.url}`); }\n"
      );

      // Loaded by Node itself, as on Vercel, outside Vitest's module graph.
      const entry = pathToFileURL(path.join(directory, "api", "index.js")).href;
      const script = `const { default: handler } = await import(${JSON.stringify(entry)}); handler({ url: "/api/health" }, { end: text => console.log(text) });`;
      const run = spawnSync(
        process.execPath,
        ["--input-type=module", "--eval", script],
        { encoding: "utf8" }
      );
      expect(run.stderr).toBe("");
      expect(run.stdout).toBe("bundle du build : /api/health\n");

      // includeFiles only makes sure the bundle file itself is shipped: the
      // packages it imports come from Vercel's tracing of api/index.js, to be
      // checked on a preview deployment.
      const vercel = JSON.parse(
        readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")
      );
      expect(
        globSync(vercel.functions["api/index.js"].includeFiles, {
          cwd: directory,
        })
      ).toContain(outfile);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
