import path from "node:path";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("kit de marque", () => {
  it("réutilise les couleurs, typographies et garde-fous actifs", async () => {
    const root = process.cwd();
    const css = await readFile(path.join(root, "client/src/index.css"), "utf8");
    for (const marker of ["Playfair Display", "DM Sans", "oklch(0.75 0.15 220)", "oklch(0.72 0.1 75)"]) {
      expect(css).toContain(marker);
    }
  });
});
