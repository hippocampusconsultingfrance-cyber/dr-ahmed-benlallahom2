import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("illustrations originales des parcours", () => {
  it("utilise les visuels décoratifs sur les sections Services et Réservation", async () => {
    const [services, booking] = await Promise.all([
      readFile(new URL("./ServicesSection.tsx", import.meta.url), "utf8"),
      readFile(new URL("../pages/BookingPage.tsx", import.meta.url), "utf8"),
    ]);

    expect(services).toContain("/assets/medical-compass.svg");
    expect(booking).toContain("/assets/booking-care.svg");
    expect(services).not.toContain("/manus-storage/");
    expect(booking).not.toContain("/manus-storage/");
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

    expect(contextualSources.length).toBeGreaterThan(1);
    expect(context).toContain("logo-hippocampus-consulting_0f90baeb.png");
    expect(context).toContain("photo-wafa-clean_fe6f20ad.png");
    expect(context).not.toMatch(/guérison|guerison|résultat garanti|resultat garanti|traitement garanti|\bguaranteed\s+(?:cure|result)\b/);
  });

  it("contrôle explicitement chaque asset médical public et venture dans son fichier source", async () => {
    const root = resolve(import.meta.dirname, "..");
    const ventureSources = ["data/ventures-fr.ts", "data/ventures-en.ts"];
    const assets: Record<string, string[]> = {
      "profile-placeholder.svg": ["components/AboutSection.tsx"],
      "abl-logo.svg": ["components/Footer.tsx", "components/Navigation.tsx", "components/SEOHead.tsx"],
      "medical-compass.svg": ["components/ServicesSection.tsx"],
      "booking-care.svg": ["pages/BookingPage.tsx"],
      "logo-appel-medical-tunisie_9b8e3246.png": ventureSources,
      "logo-hippocampus-consulting_0f90baeb.png": ventureSources,
      "logo-laska-corporate_35bcff90.png": ventureSources,
      "logo-octopus-talent_27d723c7.png": ventureSources,
      "/assets/team/ahmed-ben-lallahom.webp": ventureSources,
      "/assets/team/amine-hachicha.webp": ventureSources,
      "photo-ines-corrected_b56c31ee.png": ventureSources,
      "/assets/team/lotfi-ben-lallahom.webp": ventureSources,
      "/assets/team/monia-ben-lallahom.webp": ventureSources,
      "/assets/team/omar-ben-lallahom.webp": ventureSources,
      "/assets/team/sonia-siala.webp": ventureSources,
      "photo-wafa-clean_fe6f20ad.png": ventureSources,
      "/assets/team/youssef-ben-lallahom.webp": ventureSources,
    };
    const prohibitedClaims = /guérison|guerison|résultat garanti|resultat garanti|traitement garanti|\bguaranteed\s+(?:cure|result)\b/i;

    for (const [asset, sourceFiles] of Object.entries(assets)) {
      const context = (await Promise.all(sourceFiles.map(file => readFile(resolve(root, file), "utf8")))).join("\n");
      expect(context, asset).toContain(asset);
      expect(context, asset).not.toMatch(prohibitedClaims);
    }
  });
});
