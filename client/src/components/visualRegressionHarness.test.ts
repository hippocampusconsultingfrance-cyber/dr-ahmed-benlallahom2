import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("harness de régression visuelle", () => {
  it("couvre les routes publiques prioritaires dans les deux viewports avec des étalons configurés", async () => {
    const source = await readFile(path.resolve(process.cwd(), "scripts/visual-regression.mjs"), "utf8");

    for (const route of ["/booking", "/booking/confirmation?status=success&trackingId=VISUAL-TEST-2026", "/recruitment", "/employers", "/resources", "/press", "/gdpr"]) {
      expect(source).toContain(`path: "${route}"`);
    }
    for (const scenario of ["home-desktop", "booking-desktop", "booking-confirmation-desktop", "recruitment-desktop", "employers-desktop", "resources-desktop", "press-desktop", "gdpr-desktop", "home-mobile", "booking-mobile", "booking-confirmation-mobile", "recruitment-mobile", "employers-mobile", "resources-mobile", "press-mobile", "gdpr-mobile", "booking-de-desktop", "resources-de-mobile", "booking-zh-desktop", "resources-zh-mobile"]) {
      expect(source).toContain(`"${scenario}": \`${"${baseUrl}"}/manus-storage/`);
    }
    expect(source).toContain('language: "de"');
    expect(source).toContain('language: "zh"');
    expect(source).toContain("VISUAL-TEST-2026");
    expect(source).toContain("reducedMotion: \"reduce\"");
    expect(source).toContain("mismatchLimit = 0.008");
  });
});
