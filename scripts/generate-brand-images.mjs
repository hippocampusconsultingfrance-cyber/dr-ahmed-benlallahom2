#!/usr/bin/env node
/**
 * Régénère les images matricielles de la marque à partir du monogramme vectoriel
 * client/public/assets/abl-logo.svg (SEO-01, SEO-05) :
 *  - client/public/assets/og/og-default.png  image de partage 1200x630 (og:image, twitter:image) ;
 *  - client/public/icon-192.png, icon-512.png, icon-maskable-512.png (manifeste) ;
 *  - client/public/apple-touch-icon.png      180x180, fond opaque (iOS refuse le SVG) ;
 *  - client/public/favicon.ico               16/32/48 px (images PNG dans un conteneur ICO).
 * Outil de développement, hors build : à relancer seulement si le logo ou l'identité changent.
 *
 *   CHROMIUM=/chemin/vers/chromium node scripts/generate-brand-images.mjs [dossier-polices...]
 *
 * dossier-polices : dossier(s) contenant playfair-display-latin-600-normal.woff2,
 * playfair-display-latin-400-normal.woff2 et dm-sans-latin-wght-normal.woff2
 * (paquets @fontsource/playfair-display et @fontsource-variable/dm-sans).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { chromium } = require("playwright-core");

const fontDirs = [
  ...process.argv.slice(2),
  path.join(root, "node_modules/@fontsource/playfair-display/files"),
  path.join(root, "node_modules/@fontsource-variable/dm-sans/files"),
].filter(Boolean);
const findFont = name => {
  for (const dir of fontDirs) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Police introuvable : ${name} (dossiers : ${fontDirs.join(", ")})`);
};
const fontUrl = name => `data:font/woff2;base64,${fs.readFileSync(findFont(name)).toString("base64")}`;

const logoSvg = fs.readFileSync(path.join(root, "client/public/assets/abl-logo.svg"), "utf8")
  // Le monogramme demande Georgia/Arial : on fige le rendu avec les polices de la marque.
  .replace(/font-family="Georgia,serif"/g, 'font-family="Playfair Display"')
  .replace(/font-family="Arial,sans-serif"/g, 'font-family="DM Sans"');

const fontFaces = `
  @font-face { font-family: "Playfair Display"; font-weight: 400; src: url(${fontUrl("playfair-display-latin-400-normal.woff2")}) format("woff2"); }
  @font-face { font-family: "Playfair Display"; font-weight: 600; src: url(${fontUrl("playfair-display-latin-600-normal.woff2")}) format("woff2"); }
  @font-face { font-family: "DM Sans"; font-weight: 100 1000; src: url(${fontUrl("dm-sans-latin-wght-normal.woff2")}) format("woff2"); }
`;

const shareCard = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  ${fontFaces}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: "DM Sans", sans-serif; color: #f6f2e9;
    background: radial-gradient(circle at 18% 30%, #123a4f 0%, transparent 55%), linear-gradient(135deg, #071521 0%, #0b2030 55%, #0d2635 100%); }
  .frame { position: absolute; inset: 28px; border: 1px solid rgba(199,166,106,.35); border-radius: 28px; }
  .logo { position: absolute; left: 92px; top: 165px; width: 300px; height: 300px; filter: drop-shadow(0 18px 40px rgba(0,0,0,.45)); }
  .text { position: absolute; left: 450px; right: 72px; top: 132px; }
  .kicker { font-size: 22px; letter-spacing: .32em; text-transform: uppercase; color: #66d9ff; font-weight: 600; }
  h1 { margin-top: 22px; font-family: "Playfair Display", serif; font-weight: 600; font-size: 64px; line-height: 1.08; }
  .role { margin-top: 22px; font-size: 30px; color: #cfe9f3; font-weight: 450; }
  .rule { margin: 30px 0 26px; width: 120px; height: 3px; background: linear-gradient(90deg, #c7a66a, transparent); }
  .org { font-size: 24px; color: #c7a66a; font-weight: 500; white-space: nowrap; }
  .url { position: absolute; left: 450px; bottom: 76px; font-size: 22px; color: #8fb3c4; letter-spacing: .04em; }
</style></head><body>
  <div class="frame"></div>
  <div class="logo">${logoSvg}</div>
  <div class="text">
    <p class="kicker">ABL · Hippocampus</p>
    <h1>Dr Ahmed Ben Lallahom</h1>
    <p class="role">Anesthésie-réanimation · Conseil en santé</p>
    <div class="rule"></div>
    <p class="org">Hippocampus Consulting · Recrutement médical international</p>
  </div>
  <p class="url">drahmedbenlallahom.com</p>
</body></html>`;

const iconPage = ({ size, opaque, padding }) => `<!doctype html><html><head><meta charset="utf-8"><style>
  ${fontFaces}
  html, body { margin: 0; width: ${size}px; height: ${size}px; overflow: hidden; background: ${opaque ? "#071521" : "transparent"}; }
  .logo { position: absolute; inset: ${padding}px; }
  .logo svg { width: 100%; height: 100%; display: block; }
</style></head><body><div class="logo">${logoSvg}</div></body></html>`;

const outputs = [
  { file: "client/public/assets/og/og-default.png", html: shareCard, width: 1200, height: 630 },
  { file: "client/public/icon-512.png", html: iconPage({ size: 512, opaque: false, padding: 0 }), width: 512, height: 512 },
  { file: "client/public/icon-192.png", html: iconPage({ size: 192, opaque: false, padding: 0 }), width: 192, height: 192 },
  // Zone sûre des icônes « maskable » : contenu dans les 80 % centraux.
  { file: "client/public/icon-maskable-512.png", html: iconPage({ size: 512, opaque: true, padding: 52 }), width: 512, height: 512 },
  { file: "client/public/apple-touch-icon.png", html: iconPage({ size: 180, opaque: true, padding: 8 }), width: 180, height: 180 },
];

/** Fichier .ico contenant des images PNG (format accepté par tous les navigateurs actuels). */
function buildIco(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map(png => png.data)]);
}

async function render(browser, { html, width, height, transparent }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const data = await page.screenshot({ omitBackground: transparent, type: "png" });
  await page.close();
  return data;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ["--no-sandbox"] });
try {
  for (const output of outputs) {
    const transparent = !/apple-touch|maskable|og-default/.test(output.file);
    const data = await render(browser, { ...output, transparent });
    const target = path.join(root, output.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    console.log(`${output.file} ${output.width}x${output.height} ${data.length} o`);
  }
  const favicons = [];
  for (const size of [16, 32, 48]) {
    favicons.push({ size, data: await render(browser, { html: iconPage({ size, opaque: false, padding: 0 }), width: size, height: size, transparent: true }) });
  }
  const ico = buildIco(favicons);
  fs.writeFileSync(path.join(root, "client/public/favicon.ico"), ico);
  console.log(`client/public/favicon.ico 16/32/48 ${ico.length} o`);
} finally {
  await browser.close();
}
