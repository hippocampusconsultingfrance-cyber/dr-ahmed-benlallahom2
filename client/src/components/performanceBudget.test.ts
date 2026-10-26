import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("budget de performance", () => {
  it("définit les budgets des chunks publics et de l’administration différée", async () => {
    const root = process.cwd();
    const [script, protocol, pkg] = await Promise.all([
      readFile(path.join(root, "scripts/check-performance-budgets.mjs"), "utf8"),
      readFile(path.join(root, "PERFORMANCE_BUDGET.md"), "utf8"),
      readFile(path.join(root, "package.json"), "utf8"),
    ]);
    for (const marker of ["entry: 160 * 1024", "admin: 60 * 1024", "public: 30 * 1024", "gzipSync", "AdminDashboard-"]) expect(script).toContain(marker);
    for (const marker of ["160 KiB", "60 KiB", "30 KiB", "WebP responsives", "réduction de mouvement", "131,1 KiB", "41,8 KiB", "non une mesure de performance réseau sur appareil réel"]) expect(protocol).toContain(marker);
    expect(pkg).toContain('"check:performance"');
  });

  it("refuse un build dont un fichier JavaScript garde les repères data-loc de l’éditeur Manus (CODE-06)", () => {
    const script = path.join(process.cwd(), "scripts/check-performance-budgets.mjs");
    // A small production build, laid out like Vite's output, measured from its own directory.
    const build = mkdtempSync(path.join(tmpdir(), "performance-budget-"));
    const assets = path.join(build, "dist/public/static");
    mkdirSync(assets, { recursive: true });
    const check = () => spawnSync(process.execPath, [script], { cwd: build, encoding: "utf8" });
    try {
      writeFileSync(path.join(assets, "index-Ab12Cd34.js"), 'export const App = () => jsx("main", { children: "Accueil" });');
      writeFileSync(path.join(assets, "AdminDashboard-Ef56Gh78.js"), 'export const Admin = () => jsx("section", { children: "Admin" });');
      writeFileSync(path.join(assets, "Home-Ij90Kl12.js"), 'export const Home = () => jsx("h1", { children: "Bienvenue" });');
      const clean = check();
      expect(clean.stderr).toBe("");
      expect(clean.status).toBe(0);

      writeFileSync(path.join(assets, "Home-Ij90Kl12.js"), 'export const Home = () => jsx("h1", { "data-loc": "client/src/pages/Home.tsx:42", children: "Bienvenue" });');
      const withSourceLocations = check();
      expect(withSourceLocations.status).not.toBe(0);
      expect(withSourceLocations.stderr).toContain("Home-Ij90Kl12.js: 1 attribut(s) data-loc");
    } finally {
      rmSync(build, { recursive: true, force: true });
    }
  });
});
