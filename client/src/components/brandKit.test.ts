import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("kit de marque", () => {
  it("réutilise les couleurs, typographies et garde-fous actifs", async () => {
    const root = process.cwd();
    const [kit, tokens, css] = await Promise.all([
      readFile(path.join(root, "BRAND_KIT.md"), "utf8"),
      readFile("/home/ubuntu/webdev-static-assets/brand-kit/brand-tokens.json", "utf8"),
      readFile("/home/ubuntu/webdev-static-assets/brand-kit/brand-kit.css", "utf8"),
    ]);
    for (const marker of ["Playfair Display", "DM Sans", "CONTRAST_GUARDRAIL.md", "fichier vectoriel validé", "promesse thérapeutique", "/manus-storage/brand-kit-abl-hippocampus_7e4f016c.zip"]) expect(kit).toContain(marker);
    for (const marker of ["oklch(0.75 0.15 220)", "oklch(0.72 0.1 75)", "Playfair Display"]) expect(tokens).toContain(marker);
    expect(css).toContain("--abl-cyan");
  });
});
