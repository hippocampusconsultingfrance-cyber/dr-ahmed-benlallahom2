import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("budget de performance", () => {
  it("refuse un chunk d’entrée au-delà de 160 KiB gzip ou qui embarque Clerk, et un dashboard administratif au-delà de 80 KiB", () => {
    const script = path.join(process.cwd(), "scripts/check-performance-budgets.mjs");
    const build = mkdtempSync(path.join(tmpdir(), "performance-budget-"));
    const assets = path.join(build, "dist/public/static");
    mkdirSync(assets, { recursive: true });
    const check = () => spawnSync(process.execPath, [script], { cwd: build, encoding: "utf8" });
    // Random bytes, which gzip cannot shrink: the gzip size of the chunk is about its length.
    const incompressible = (kib: number) => randomBytes(kib * 1024);
    try {
      writeFileSync(path.join(assets, "index-Ab12Cd34.js"), 'export const App = () => jsx("main", { children: "Accueil" });');
      writeFileSync(path.join(assets, "AdminDashboard-Ef56Gh78.js"), incompressible(70));
      writeFileSync(path.join(assets, "Home-Ij90Kl12.js"), 'export const Home = () => jsx("h1", { children: "Bienvenue" });');
      expect(check().status).toBe(0);

      writeFileSync(path.join(assets, "AdminDashboard-Ef56Gh78.js"), incompressible(85));
      const heavyAdmin = check();
      expect(heavyAdmin.status).not.toBe(0);
      expect(heavyAdmin.stderr).toMatch(/Admin AdminDashboard-Ef56Gh78\.js: \d+\.\d KiB > 80\.0 KiB/);

      writeFileSync(path.join(assets, "AdminDashboard-Ef56Gh78.js"), incompressible(70));
      writeFileSync(path.join(assets, "index-Ab12Cd34.js"), 'import { ClerkProvider } from "@clerk/clerk-react";');
      expect(check().stderr).toContain("Entrée index-Ab12Cd34.js: contient Clerk");

      writeFileSync(path.join(assets, "index-Ab12Cd34.js"), incompressible(165));
      expect(check().stderr).toMatch(/Entrée index-Ab12Cd34\.js: \d+\.\d KiB > 160\.0 KiB/);
    } finally {
      rmSync(build, { recursive: true, force: true });
    }
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
