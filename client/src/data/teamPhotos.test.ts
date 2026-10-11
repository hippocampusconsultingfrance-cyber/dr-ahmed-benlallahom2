import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("portraits d'équipe des ventures", () => {
  it("référence uniquement des portraits locaux présents dans client/public", async () => {
    const publicRoot = resolve(import.meta.dirname, "../../public");
    for (const file of ["ventures-fr.ts", "ventures-en.ts"]) {
      const source = await readFile(resolve(import.meta.dirname, file), "utf8");
      const portraits = source.match(/\/assets\/team\/[a-z0-9-]+\.webp/g) ?? [];

      expect(portraits.length, file).toBeGreaterThan(0);
      for (const portrait of new Set(portraits)) {
        await expect(access(resolve(publicRoot, portrait.slice(1))), portrait).resolves.toBeUndefined();
      }
    }
  });
});
