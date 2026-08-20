import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("documentation des composants", () => {
  it("référence les composants partagés et les garde-fous d’évolution essentiels", async () => {
    const guide = await readFile(path.resolve(process.cwd(), "COMPONENTS_GUIDE.md"), "utf8");

    expect(guide).toContain("PublicContentSkeleton.tsx");
    expect(guide).toContain("AdminStatePanel.tsx");
    expect(guide).toContain("SEOHead.tsx");
    expect(guide).toContain("useLanguage()");
    expect(guide).toContain("aide à la revue humaine");
  });
});
