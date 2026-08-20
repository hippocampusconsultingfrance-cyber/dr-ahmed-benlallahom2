import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("harness de régression visuelle", () => {
  it("couvre les routes publiques prioritaires dans les deux viewports avec des étalons configurés", async () => {
    const source = await readFile(path.resolve(process.cwd(), "scripts/visual-regression.mjs"), "utf8");

    for (const route of ["/booking", "/booking/confirmation?status=success&trackingId=VISUAL-TEST-2026", "/recruitment", "/recruitment/standard", "/recruitment/vvip-offshore", "/recruitment/unsubscribe", "/venture/hippocampus-consulting", "/why-hippocampus", "/error", "/employers", "/resources", "/press", "/faq", "/search", "/visual-not-found", "/legal", "/testimonials", "/gdpr"]) {
      expect(source).toContain(`path: "${route}"`);
    }
    for (const scenario of ["home-desktop", "booking-desktop", "booking-confirmation-desktop", "recruitment-desktop", "recruitment-standard-desktop", "vvip-offshore-desktop", "venture-hippocampus-desktop", "why-hippocampus-desktop", "recruitment-unsubscribe-desktop", "service-error-desktop", "employers-desktop", "resources-desktop", "press-desktop", "faq-desktop", "search-desktop", "not-found-desktop", "legal-desktop", "testimonials-desktop", "gdpr-desktop", "home-mobile", "booking-mobile", "booking-confirmation-mobile", "recruitment-mobile", "recruitment-standard-mobile", "vvip-offshore-mobile", "venture-hippocampus-mobile", "why-hippocampus-mobile", "recruitment-unsubscribe-mobile", "service-error-mobile", "employers-mobile", "resources-mobile", "press-mobile", "faq-mobile", "search-mobile", "not-found-mobile", "legal-mobile", "testimonials-mobile", "gdpr-mobile", "booking-de-desktop", "resources-de-mobile", "booking-zh-desktop", "resources-zh-mobile"]) {
      expect(source).toContain(`"${scenario}": \`${"${baseUrl}"}/manus-storage/`);
    }
    expect(source).toContain('language: "de"');
    expect(source).toContain('language: "zh"');
    expect(source).toContain("VISUAL-TEST-2026");
    expect(source).toContain("reducedMotion: \"reduce\"");
    expect(source).toContain("mismatchLimit = 0.008");
    expect(source).toContain('readySelector: \'[data-visual-state="resolved"]\'');
  });
});
