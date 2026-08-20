import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("intégration continue GitHub", () => {
  it("contrôle le typage et les tests à chaque changement de la branche principale", async () => {
    const root = process.cwd();
    const [workflow, packageJson] = await Promise.all([
      readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"),
      readFile(path.join(root, "package.json"), "utf8"),
    ]);
    const packageManager = JSON.parse(packageJson).packageManager as string;
    const pnpmVersion = packageManager.match(/^pnpm@([0-9.]+)/)?.[1];
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("pnpm check");
    expect(workflow).toContain("pnpm test");
    expect(workflow).toContain("pnpm audit --prod --audit-level=high");
    expect(pnpmVersion).toBeTruthy();
    expect(workflow).toContain(`version: ${pnpmVersion}`);
  });
});
