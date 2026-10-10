import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readText = (file: string) => readFileSync(path.join(root, file), "utf8");
const readJson = (file: string) => JSON.parse(readText(file));
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(part => Number.parseInt(part, 10));
  const b = right.split(".").map(part => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function lockedVersions(lockfile: string, packageName: string): string[] {
  const pattern = new RegExp(`^  '?${escapeRegExp(packageName)}@(\\d+\\.\\d+\\.\\d+)[^:]*'?:`, "gm");
  return Array.from(new Set(Array.from(lockfile.matchAll(pattern), match => match[1])));
}

describe("hygiène des dépendances et du dépôt", () => {
  it("installe en production exactement les versions du lockfile testé", () => {
    const vercel = readJson("vercel.json");
    expect(vercel.installCommand).toBe("pnpm install --frozen-lockfile");
    expect(vercel.installCommand).not.toContain("--no-frozen-lockfile");
  });

  it("ne déclare plus les paquets ajoutés par erreur et laisse packageManager épingler pnpm", () => {
    const pkg = readJson("package.json");
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(declared).not.toHaveProperty("add");
    expect(declared).not.toHaveProperty("pnpm");
    expect(pkg.packageManager).toMatch(/^pnpm@[0-9.]+\+sha512\./);
  });

  it("garde les overrides du lockfile alignés sur package.json pour que l'installation figée réussisse", () => {
    const overrides = readJson("package.json").pnpm.overrides as Record<string, string>;
    const lockfile = readText("pnpm-lock.yaml");
    const lockOverrides = lockfile.match(/^overrides:\n((?: {2}.+\n)+)/m)?.[1] ?? "";
    expect(lockOverrides.trim().split("\n")).toHaveLength(Object.keys(overrides).length);
    for (const [name, version] of Object.entries(overrides)) {
      expect(lockOverrides).toMatch(new RegExp(`^  '?${escapeRegExp(name)}'?: ${escapeRegExp(version)}$`, "m"));
    }
  });

  it("verrouille des versions corrigées de l'outillage de test et des dépendances de rendu Markdown", () => {
    const lockfile = readText("pnpm-lock.yaml");
    const minimumPatched: Record<string, string> = {
      vitest: "3.2.6",
      tinypool: "2.1.2",
      dompurify: "3.4.16",
      katex: "0.18.2",
    };

    expect(lockedVersions(lockfile, "vitest").length).toBeGreaterThan(0);
    for (const [name, minimum] of Object.entries(minimumPatched)) {
      for (const version of lockedVersions(lockfile, name)) {
        expect(compareVersions(version, minimum), `${name}@${version} doit être >= ${minimum}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("ne conserve ni pages mortes ni scripts ponctuels hérités de Manus", () => {
    const removedFiles = [
      "client/src/pages/BookingPage-old.tsx",
      "client/src/pages/ComponentShowcase.tsx",
      "add-dr-lf-testimonials.mjs",
      "add-dr-lf-testimonials.ts",
      "add-real-testimonial.mjs",
      "add-second-testimonial.mjs",
      "add-third-testimonial.mjs",
      "add-testimonials-fixed.sh",
      "add-testimonials.sh",
      "seed-testimonials.mjs",
      "update-testimonials.mjs",
      "webhook-update.txt",
    ];
    for (const file of removedFiles) expect(existsSync(path.join(root, file)), file).toBe(false);
  });
});
