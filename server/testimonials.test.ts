import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("contrats des témoignages", () => {
  it("conserve les champs de protection et de modération dans le schéma", async () => {
    const schema = await readFile(path.resolve(process.cwd(), "drizzle/schema.ts"), "utf8");

    expect(schema).toContain('mysqlTable("testimonials"');
    for (const column of ["authorName", "rating", "title", "content", "specialty", "verified", "featured", "language", "status"]) {
      expect(schema).toContain(column);
    }
  });

  it("ne retourne publiquement que les témoignages approuvés", async () => {
    const router = await readFile(path.resolve(process.cwd(), "server/routers.ts"), "utf8");

    expect(router).toContain('eq(testimonials.status, "approved")');
  });

});
