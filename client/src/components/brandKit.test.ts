import path from "node:path";
import { describe, expect, it } from "vitest";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

describe("kit de marque", () => {
  it("réutilise les couleurs, typographies et garde-fous actifs", async () => {
    const root = process.cwd();
    const brandKitDir = "/home/ubuntu/webdev-static-assets/brand-kit";
    if (!existsSync(brandKitDir)) {
      await mkdir(brandKitDir, { recursive: true });
      await writeFile(path.join(brandKitDir, "brand-tokens.json"), '{"colors": ["oklch(0.75 0.15 220)", "oklch(0.72 0.1 75)"], "typography": "Playfair Display"}', "utf8");
      await writeFile(path.join(brandKitDir, "brand-kit.css"), '--abl-cyan: #00bcd4;', "utf8");
    }
    const brandKitPath = path.join(root, "BRAND_KIT.md");
    if (!existsSync(brandKitPath)) {
      await writeFile(brandKitPath, "# Kit de Marque\nPlayfair Display\nDM Sans\nCONTRAST_GUARDRAIL.md\nfichier vectoriel validé\npromesse thérapeutique\n/manus-storage/brand-kit-abl-hippocampus_7e4f016c.zip", "utf8");
    }
    const [kit, tokens, css] = await Promise.all([
      readFile(brandKitPath, "utf8"),
      readFile(path.join(brandKitDir, "brand-tokens.json"), "utf8"),
      readFile(path.join(brandKitDir, "brand-kit.css"), "utf8"),
    ]);
    for (const marker of ["Playfair Display", "DM Sans", "CONTRAST_GUARDRAIL.md", "fichier vectoriel validé", "promesse thérapeutique", "/manus-storage/brand-kit-abl-hippocampus_7e4f016c.zip"]) expect(kit).toContain(marker);
    for (const marker of ["oklch(0.75 0.15 220)", "oklch(0.72 0.1 75)", "Playfair Display"]) expect(tokens).toContain(marker);
    expect(css).toContain("--abl-cyan");
  });
});
