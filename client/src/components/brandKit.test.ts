import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("kit de marque", () => {
  it("référence les tokens, signatures et formats de diffusion du projet", async () => {
    const kit = await readFile(path.resolve(process.cwd(), "BRAND_KIT.md"), "utf8");

    expect(kit).toContain("ABL / HIPPOCAMPUS");
    expect(kit).toContain("Hippocampus Consulting");
    expect(kit).toContain("bg-primary");
    expect(kit).toContain("Playfair Display");
    expect(kit).toContain("1080 × 1350 px");
  });
});
