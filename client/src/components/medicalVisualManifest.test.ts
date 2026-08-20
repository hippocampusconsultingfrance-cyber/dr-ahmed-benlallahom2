import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("inventaire des visuels médicaux publics", () => {
  it("relie chaque visuel médical actif à son contexte et interdit les promesses thérapeutiques", async () => {
    const root = process.cwd();
    const [manifest, sourceGuard] = await Promise.all([
      readFile(path.join(root, "MEDICAL_VISUAL_LIBRARY_MANIFEST.md"), "utf8"),
      readFile(path.join(root, "client/src/components/visualIllustrations.test.ts"), "utf8"),
    ]);
    const assets = [
      "hero-bg-ahmed_156f3568.png",
      "hero-ahmed-medical_4adb9653.png",
      "hero-consulting_b0a2cb5b.png",
      "services-medical-compass-1280_0a913727.webp",
      "booking-care-path-1280_c6d0ae6a.webp",
    ];

    for (const asset of assets) expect(manifest).toContain(asset);
    expect(manifest).toContain("VISUAL_ASSET_RIGHTS_REGISTER.md");
    expect(manifest).toContain("aucune promesse thérapeutique");
    expect(sourceGuard).toContain("prohibitedClaims");
  });
});
