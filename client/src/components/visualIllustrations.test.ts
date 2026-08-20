import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("illustrations originales des parcours", () => {
  it("utilise les visuels décoratifs sur les sections Services et Réservation", async () => {
    const [services, booking] = await Promise.all([
      readFile(new URL("./ServicesSection.tsx", import.meta.url), "utf8"),
      readFile(new URL("../pages/BookingPage.tsx", import.meta.url), "utf8"),
    ]);

    expect(services).toContain("/manus-storage/services-medical-compass-1280_0a913727.webp");
    expect(booking).toContain("/manus-storage/booking-care-path-1280_c6d0ae6a.webp");
    expect(services).toContain('alt=""');
    expect(booking).toContain('alt=""');
  });

  it("les conserve dans des contextes décoratifs sans promesse thérapeutique", async () => {
    const [services, booking] = await Promise.all([
      readFile(new URL("./ServicesSection.tsx", import.meta.url), "utf8"),
      readFile(new URL("../pages/BookingPage.tsx", import.meta.url), "utf8"),
    ]);
    const contexts = `${services}\n${booking}`.toLowerCase();

    expect(contexts).not.toMatch(/guérison|guerison|résultat garanti|resultat garanti|traitement garanti|guaranteed cure/);
    expect(booking).toContain("aria-hidden=\"true\"");
  });

  it("recense tous les contextes sources qui référencent des assets de stockage sans vocabulaire de promesse thérapeutique", async () => {
    const sourceRoot = resolve(import.meta.dirname, "..");
    const files: string[] = [];
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) await visit(path);
        if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name)) && !entry.name.includes(".test.")) files.push(path);
      }
    };
    await visit(sourceRoot);
    const contextualSources = (await Promise.all(files.map(async file => ({ file, source: await readFile(file, "utf8") })))).filter(item => item.source.includes("/manus-storage/"));
    const context = contextualSources.map(item => item.source).join("\n").toLowerCase();

    expect(contextualSources.length).toBeGreaterThan(3);
    expect(context).toContain("services-medical-compass-1280_0a913727.webp");
    expect(context).toContain("booking-care-path-1280_c6d0ae6a.webp");
    expect(context).not.toMatch(/guérison|guerison|résultat garanti|resultat garanti|traitement garanti|\bguaranteed\s+(?:cure|result)\b/);
  });

  it("contrôle explicitement chaque asset médical public et venture dans son fichier source", async () => {
    const root = resolve(import.meta.dirname, "..");
    const ventureSources = ["data/ventures-fr.ts", "data/ventures-en.ts"];
    const assets: Record<string, string[]> = {
      "booking-care-path-1280_c6d0ae6a.webp": ["pages/BookingPage.tsx"],
      "hero-ahmed-medical_4adb9653.png": ["components/AboutSection.tsx"],
      "hero-bg-ahmed_156f3568.png": ["components/HeroSection.tsx"],
      "hero-consulting_b0a2cb5b.png": ["components/ContactSection.tsx", "components/GDPRRequestForm.tsx"],
      "logo-abl_2afbc5e0.png": ["components/Footer.tsx", "components/Navigation.tsx", "components/SEOHead.tsx"],
      "logo-appel-medical-tunisie_9b8e3246.png": ventureSources,
      "logo-hippocampus-consulting_0f90baeb.png": ventureSources,
      "logo-laska-corporate_35bcff90.png": ventureSources,
      "logo-octopus-talent_27d723c7.png": ventureSources,
      "photo-ahmed-new_b06c9b06.png": ventureSources,
      "photo-amine-corrected_5ec26887.png": ventureSources,
      "photo-ines-corrected_b56c31ee.png": ventureSources,
      "photo-lotfi-new_044020b2.png": ventureSources,
      "photo-monia-new_5b1a3785.png": ventureSources,
      "photo-omar-new_805e25bc.png": ventureSources,
      "photo-sonia-new_cbb12509.png": ventureSources,
      "photo-wafa-clean_fe6f20ad.png": ventureSources,
      "photo-youssef-new_dc020979.png": ventureSources,
      "services-medical-compass-1280_0a913727.webp": ["components/ServicesSection.tsx"],
    };
    const prohibitedClaims = /guérison|guerison|résultat garanti|resultat garanti|traitement garanti|\bguaranteed\s+(?:cure|result)\b/i;

    for (const [asset, sourceFiles] of Object.entries(assets)) {
      const context = (await Promise.all(sourceFiles.map(file => readFile(resolve(root, file), "utf8")))).join("\n");
      expect(context, asset).toContain(asset);
      expect(context, asset).not.toMatch(prohibitedClaims);
    }
  });
});
