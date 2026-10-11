import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("logos et portraits des ventures", () => {
  it("référence uniquement des fichiers locaux présents dans client/public", async () => {
    const publicRoot = resolve(import.meta.dirname, "../../public");
    for (const file of ["ventures-fr.ts", "ventures-en.ts"]) {
      const source = await readFile(resolve(import.meta.dirname, file), "utf8");
      const images = source.match(/\/assets\/(?:team|logos)\/[a-z0-9-]+\.webp/g) ?? [];

      expect(images.some(image => image.startsWith("/assets/team/")), file).toBe(true);
      expect(images.some(image => image.startsWith("/assets/logos/")), file).toBe(true);
      for (const image of new Set(images)) {
        await expect(access(resolve(publicRoot, image.slice(1))), image).resolves.toBeUndefined();
      }
    }
  });
});
