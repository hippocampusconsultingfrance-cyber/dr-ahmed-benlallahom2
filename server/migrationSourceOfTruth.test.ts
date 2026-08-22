import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("source de vérité des migrations Drizzle", () => {
  it("aligne la documentation avec la sortie déclarée dans la configuration", () => {
    const config = readFileSync(new URL("../drizzle.config.ts", import.meta.url), "utf8");
    const guide = readFileSync(new URL("../drizzle/MIGRATION_SOURCE_OF_TRUTH.md", import.meta.url), "utf8");
    expect(config).toContain('out: "./drizzle"');
    expect(guide).toContain("drizzle.config.ts");
    expect(guide).toContain("source de vérité");
    expect(guide).toContain("drizzle/migrations/");
  });
});
