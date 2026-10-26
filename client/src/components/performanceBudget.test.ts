import { readFile } from "node:fs/promises";
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
});
