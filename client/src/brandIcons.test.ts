import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_IMAGE } from "@shared/routeMetadata";

const publicDir = resolve(import.meta.dirname, "../public");
const read = (file: string) => readFileSync(resolve(publicDir, file));

/** Largeur, hauteur et type de couleur d'un PNG (chunk IHDR). */
function pngInfo(buffer: Buffer) {
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), colorType: buffer.readUInt8(25) };
}

describe("icônes et image de partage matricielles (SEO-01 / SEO-05)", () => {
  it("fournit une image de partage PNG 1200x630 opaque de moins de 1 Mo", () => {
    const file = new URL(DEFAULT_SHARE_IMAGE.url).pathname.slice(1);
    expect(file).toBe("assets/og/og-default.png");
    expect(pngInfo(read(file))).toMatchObject({ width: 1200, height: 630, colorType: 2 });
    expect(statSync(resolve(publicDir, file)).size).toBeLessThan(1024 * 1024);
  });

  it("fournit favicon.ico (16/32/48), apple-touch-icon opaque 180 px et icônes 192/512", () => {
    const ico = read("favicon.ico");
    expect(ico.readUInt16LE(2)).toBe(1);
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico.readUInt8(6 + 16 * index));
    expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48]);

    // Type de couleur 2 = RVB sans alpha : iOS affiche sinon un fond noir aux coins.
    expect(pngInfo(read("apple-touch-icon.png"))).toMatchObject({ width: 180, height: 180, colorType: 2 });
    expect(pngInfo(read("icon-192.png"))).toMatchObject({ width: 192, height: 192 });
    expect(pngInfo(read("icon-512.png"))).toMatchObject({ width: 512, height: 512 });
    expect(pngInfo(read("icon-maskable-512.png"))).toMatchObject({ width: 512, height: 512, colorType: 2 });
  });

  it("déclare un manifeste dont chaque icône existe", () => {
    const manifest = JSON.parse(read("site.webmanifest").toString("utf8")) as { icons: { src: string; sizes: string; purpose: string }[]; lang: string };
    expect(manifest.lang).toBe("fr");
    expect(manifest.icons.map(icon => icon.purpose)).toEqual(expect.arrayContaining(["any", "maskable"]));
    for (const icon of manifest.icons) {
      const [width] = icon.sizes.split("x").map(Number);
      expect(existsSync(resolve(publicDir, icon.src.slice(1))), icon.src).toBe(true);
      expect(pngInfo(read(icon.src.slice(1))).width).toBe(width);
    }
  });

  it("référence ces fichiers dans le shell HTML, en gardant le SVG comme icône principale", () => {
    const html = readFileSync(resolve(import.meta.dirname, "../index.html"), "utf8");
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/assets/abl-logo.svg" />');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />');
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(html).not.toContain('rel="apple-touch-icon" href="/assets/abl-logo.svg"');
  });
});
