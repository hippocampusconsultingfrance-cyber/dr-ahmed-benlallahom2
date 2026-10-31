import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const assetsDirectory = path.resolve("dist/public/static");
const files = (await readdir(assetsDirectory)).sort((a, b) => a.localeCompare(b));
const javascript = files.filter((file) => file.endsWith(".js"));
const stylesheets = files.filter((file) => file.endsWith(".css"));
const sources = new Map(await Promise.all(javascript.map(async (file) => [file, await readFile(path.join(assetsDirectory, file), "utf8")])));
const measure = async (name) => gzipSync(await readFile(path.join(assetsDirectory, name))).byteLength;
const kib = (bytes) => (bytes / 1024).toFixed(1);

const measuredEntries = await Promise.all(javascript
  .filter((file) => /^index-[^.]+\.js$/.test(file))
  .map(async (file) => ({ file, gzip: await measure(file) })));
const mainEntry = measuredEntries.sort((a, b) => b.gzip - a.gzip)[0];
const adminFile = javascript.find((file) => file.startsWith("AdminDashboard-"));

if (!mainEntry || !adminFile) throw new Error("Chunks de production attendus introuvables.");
// Chaque page chargée à la demande (React.lazy) est un fichier que Vite importe avec
// import("./Page-hash.js") : toutes sont mesurées, quel que soit leur nom. Les autres
// fichiers, hors entrée et dashboard, sont des dépendances partagées par plusieurs
// pages (textes, icônes, catégories de documents…), téléchargées avec chacune d'elles.
const lazyTargets = new Set();
for (const source of sources.values()) {
  for (const match of source.matchAll(/\bimport\(\s*["']\.\/([^"']+\.js)["']\s*\)/g)) lazyTargets.add(match[1]);
}
const routeChunks = javascript.filter((file) => lazyTargets.has(file) && file !== adminFile);
const sharedChunks = javascript.filter((file) => !lazyTargets.has(file) && file !== mainEntry.file && file !== adminFile);
const measureAll = (chunks) => Promise.all(chunks.map(async (file) => ({ file, gzip: await measure(file) })));
const [routeMeasures, sharedMeasures, cssMeasures] = await Promise.all([measureAll(routeChunks), measureAll(sharedChunks), measureAll(stylesheets)]);
const adminGzip = await measure(adminFile);
const cssGzip = cssMeasures.reduce((total, sheet) => total + sheet.gzip, 0);

// Admin : 60 KiB jusqu'en octobre 2026, puis 80 KiB une fois retirés les attributs
// data-loc de jsxLocPlugin (CODE-06), en attendant la décision du propriétaire sur le
// découpage des onglets les plus lourds (voir PERFORMANCE_BUDGET.md).
// Route : le même plafond pour chaque page chargée à la demande, et pour chaque
// dépendance partagée, qui pèse sur toutes les pages qui l'importent. Aucune ne le
// dépasse aujourd'hui (les plus lourdes : LegalPage et RecruitmentPage, environ
// 19 KiB ; candidateDocumentCategories, 17 KiB) : pas d'exception.
// CSS : la feuille de style, chargée avant l'affichage de toute page (27 KiB en
// octobre 2026).
const budgets = { entry: 160 * 1024, admin: 80 * 1024, route: 30 * 1024, shared: 30 * 1024, css: 30 * 1024 };
const failures = [];
if (mainEntry.gzip > budgets.entry) failures.push(`Entrée ${mainEntry.file}: ${kib(mainEntry.gzip)} KiB > ${kib(budgets.entry)} KiB`);
// Clerk (authentification admin) ne doit jamais revenir dans le chunk d'entrée public (PERF-01).
if (/ClerkProvider|@clerk\/|clerk\.browser/.test(sources.get(mainEntry.file))) failures.push(`Entrée ${mainEntry.file}: contient Clerk`);
if (adminGzip > budgets.admin) failures.push(`Admin ${adminFile}: ${kib(adminGzip)} KiB > ${kib(budgets.admin)} KiB`);
for (const chunk of routeMeasures) if (chunk.gzip > budgets.route) failures.push(`Route ${chunk.file}: ${kib(chunk.gzip)} KiB > ${kib(budgets.route)} KiB`);
for (const chunk of sharedMeasures) if (chunk.gzip > budgets.shared) failures.push(`Partagé ${chunk.file}: ${kib(chunk.gzip)} KiB > ${kib(budgets.shared)} KiB`);
if (cssGzip > budgets.css) failures.push(`CSS total (${stylesheets.join(", ")}): ${kib(cssGzip)} KiB > ${kib(budgets.css)} KiB`);
// Aucun fichier ne doit garder les repères data-loc="client/src/…:ligne" de l'éditeur visuel
// Manus : du poids pour rien, et les chemins du code source lisibles dans la page (CODE-06).
for (const [file, source] of sources) {
  const sourceLocations = source.match(/data-loc/g)?.length ?? 0;
  if (sourceLocations > 0) failures.push(`${file}: ${sourceLocations} attribut(s) data-loc`);
}

const bySize = (a, b) => b.gzip - a.gzip;
// Les dépendances partagées les plus légères (icônes, quelques centaines d'octets) sont
// mesurées sans être listées.
const listedShared = sharedMeasures.filter((chunk) => chunk.gzip >= 1024 || chunk.gzip > budgets.shared).sort(bySize);
console.table([
  { groupe: "Entrée publique", fichier: mainEntry.file, gzipKiB: kib(mainEntry.gzip), budgetKiB: kib(budgets.entry) },
  { groupe: "Admin lazy", fichier: adminFile, gzipKiB: kib(adminGzip), budgetKiB: kib(budgets.admin) },
  ...routeMeasures.sort(bySize).map((chunk) => ({ groupe: "Route lazy", fichier: chunk.file, gzipKiB: kib(chunk.gzip), budgetKiB: kib(budgets.route) })),
  ...listedShared.map((chunk) => ({ groupe: "Partagé", fichier: chunk.file, gzipKiB: kib(chunk.gzip), budgetKiB: kib(budgets.shared) })),
  { groupe: "CSS total", fichier: stylesheets.join(", ") || "(aucun)", gzipKiB: kib(cssGzip), budgetKiB: kib(budgets.css) },
]);
console.log(`${routeMeasures.length} route(s) lazy et ${sharedMeasures.length} dépendance(s) partagée(s) mesurées (${sharedMeasures.length - listedShared.length} de moins de 1 KiB non listées).`);
if (failures.length) throw new Error(`Budget de performance dépassé:\n${failures.join("\n")}`);
