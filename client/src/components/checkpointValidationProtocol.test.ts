import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("protocole de validation avant checkpoint", () => {
  it("associe la commande, la matrice visuelle et la capture ciblée", async () => {
    const root = process.cwd();
    const [pkg, protocol] = await Promise.all([
      readFile(path.join(root, "package.json"), "utf8"),
      readFile(path.join(root, "CHECKPOINT_VALIDATION_PROTOCOL.md"), "utf8"),
    ]);
    expect(pkg).toContain('"validate:precheckpoint"');
    for (const marker of ["pnpm validate:precheckpoint", "capture ciblée", "pnpm test:visual", "EXTERNAL_VALIDATION_REGISTER.md", "Ne pas publier"]) expect(protocol).toContain(marker);
  });
});
