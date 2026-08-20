import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("harness de régression visuelle", () => {
  it("couvre les routes publiques prioritaires dans les deux viewports avec des étalons configurés", async () => {
    const source = await readFile(path.resolve(process.cwd(), "scripts/visual-regression.mjs"), "utf8");

    for (const route of ["/booking", "/recruitment", "/employers", "/resources", "/gdpr"]) {
      expect(source).toContain(`path: "${route}"`);
    }
    for (const scenario of ["home-desktop", "booking-desktop", "recruitment-desktop", "employers-desktop", "resources-desktop", "gdpr-desktop", "home-mobile", "booking-mobile", "recruitment-mobile", "employers-mobile", "resources-mobile", "gdpr-mobile"]) {
      expect(source).toContain(`"${scenario}": \`${"${baseUrl}"}/manus-storage/`);
    }
    expect(source).toContain("reducedMotion: \"reduce\"");
    expect(source).toContain("mismatchLimit = 0.008");
  });
});
