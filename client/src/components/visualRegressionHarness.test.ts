import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("harness de régression visuelle", () => {
  it("couvre les routes publiques critiques dans les deux viewports", async () => {
    const source = await readFile(path.resolve(process.cwd(), "scripts/visual-regression.mjs"), "utf8");
    const packageJson = await readFile(path.resolve(process.cwd(), "package.json"), "utf8");

    for (const route of ["/booking", "/booking/confirmation?status=success&trackingId=VISUAL-TEST-2026", "/recruitment", "/recruitment/standard", "/recruitment/vvip-offshore", "/employers", "/why-hippocampus", "/venture/hippocampus-consulting", "/recruitment/unsubscribe", "/faq", "/search", "/resources", "/press", "/testimonials", "/gdpr", "/legal", "/visual-not-found", "/error"]) {
      expect(source).toContain(`"${route}"`);
    }
    const publishedBaselines = source.match(/\/manus-storage\/[a-z0-9-]+_[a-f0-9]+\.png/g) ?? [];
    expect(publishedBaselines).toHaveLength(42);
    for (const multilingualScenario of ["booking-de-desktop", "recruitment-standard-de-mobile", "booking-zh-desktop", "employers-zh-mobile"]) {
      expect(source).toContain(`"${multilingualScenario}"`);
    }
    expect(source).toContain("mismatchLimit = 0.008");
    expect(source).toContain('reducedMotion: "reduce"');
    expect(source).toContain('cookieConsent');
    expect(packageJson).toContain('"test:visual"');
  });
});
