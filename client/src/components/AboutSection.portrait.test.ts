import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contentDe } from "@/data/content-de";
import { contentEn } from "@/data/content-en";
import { contentFr } from "@/data/content-fr";
import { contentZh } from "@/data/content-zh";

const root = resolve(import.meta.dirname, "../../..");
const aboutSource = readFileSync(resolve(import.meta.dirname, "AboutSection.tsx"), "utf8");

function readWebpSize(buffer: Buffer): { width: number; height: number } {
  // RIFF....WEBPVP8 (lossy) : largeur/hauteur sur 14 bits aux octets 26-29.
  expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buffer.toString("ascii", 8, 12)).toBe("WEBP");
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8X") {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  throw new Error(`Unexpected WebP chunk ${chunk}`);
}

describe("Section À propos : portrait officiel (M20 / PUB-CONTENT-01)", () => {
  it("affiche la photo du médecin et plus le visuel provisoire", () => {
    expect(aboutSource).toContain('"/assets/team/ahmed-ben-lallahom.webp"');
    expect(aboutSource).not.toContain("profile-placeholder");
    expect(existsSync(resolve(root, "client/public/assets/profile-placeholder.svg"))).toBe(false);
  });

  it("ne publie plus nulle part la mention « portrait officiel à ajouter »", () => {
    const publicAssets = resolve(root, "client/public/assets");
    for (const file of ["abl-logo.svg", "team-placeholder.svg", "venture-placeholder.svg"]) {
      const path = resolve(publicAssets, file);
      if (existsSync(path)) expect(readFileSync(path, "utf8")).not.toMatch(/à ajouter/i);
    }
  });

  it("décrit le portrait avec un texte alternatif localisé (4 langues)", () => {
    expect(aboutSource).toContain("alt={content.about.portraitAlt}");
    for (const content of [contentFr, contentEn, contentDe, contentZh]) {
      expect(content.about.portraitAlt).toMatch(/Ben Lallahom/);
      expect(content.about.portraitAlt.length).toBeGreaterThan(20);
    }
    expect(contentFr.about.portraitAlt).toMatch(/^Portrait du Dr Ahmed Ben Lallahom/);
  });

  it("déclare les dimensions réelles du fichier et limite l'agrandissement du cadre 3:4", () => {
    const { width, height } = readWebpSize(readFileSync(resolve(root, "client/public/assets/team/ahmed-ben-lallahom.webp")));
    expect(aboutSource).toContain(`width={${width}}`);
    expect(aboutSource).toContain(`height={${height}}`);
    expect(aboutSource).toContain("aspect-[3/4]");
    // Cadre de 18rem (288 px) : 384 px de haut pour une source de 320 px, soit un facteur <= 1,2.
    expect(aboutSource).toContain("max-w-[18rem]");
    expect((288 * 4) / 3 / height).toBeLessThanOrEqual(1.2);
  });
});
