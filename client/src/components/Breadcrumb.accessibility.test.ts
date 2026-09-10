import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Breadcrumb accessibility", () => {
  it("localises its landmark and marks the current page", async () => {
    const source = await readFile(
      new URL("./Breadcrumb.tsx", import.meta.url),
      "utf8"
    );

    for (const label of [
      "Fil d’Ariane",
      "Breadcrumb",
      "Brotkrümelnavigation",
      "面包屑导航",
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain('aria-current="page"');
    expect(source.match(/aria-hidden="true"/g)).toHaveLength(2);
  });
});
