import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const assetsDirectory = path.resolve("dist/public/static");
const files = await readdir(assetsDirectory);
const javascript = files.filter((file) => file.endsWith(".js"));
const resolveLargest = (predicate) => javascript
  .filter(predicate)
  .sort((a, b) => a.localeCompare(b));
const measure = async (name) => gzipSync(await readFile(path.join(assetsDirectory, name))).byteLength;
const kib = (bytes) => (bytes / 1024).toFixed(1);

const entryCandidates = resolveLargest((file) => /^index-[^.]+\.js$/.test(file));
const entry = entryCandidates
  .map(async (file) => ({ file, gzip: await measure(file) }));
const measuredEntries = await Promise.all(entry);
const mainEntry = measuredEntries.sort((a, b) => b.gzip - a.gzip)[0];
const adminFile = resolveLargest((file) => file.startsWith("AdminDashboard-"))[0];
const publicChunks = resolveLargest((file) => /^(Home|BookingPage|ResourcesPage|PressPage|RecruitmentPage|EmployersPage|WhyHippocampusPage|FAQPage|LegalPage)-/.test(file));

if (!mainEntry || !adminFile) throw new Error("Chunks de production attendus introuvables.");
const adminGzip = await measure(adminFile);
const publicMeasures = await Promise.all(publicChunks.map(async (file) => ({ file, gzip: await measure(file) })));
// Admin : 60 KiB jusqu'en octobre 2026, puis 80 KiB une fois retirés les attributs
// data-loc de jsxLocPlugin (CODE-06), en attendant la décision du propriétaire sur le
// découpage des onglets les plus lourds (voir PERFORMANCE_BUDGET.md).
const budgets = { entry: 160 * 1024, admin: 80 * 1024, public: 30 * 1024 };
const failures = [];
if (mainEntry.gzip > budgets.entry) failures.push(`Entrée ${mainEntry.file}: ${kib(mainEntry.gzip)} KiB > ${kib(budgets.entry)} KiB`);
// Clerk (authentification admin) ne doit jamais revenir dans le chunk d'entrée public (PERF-01).
if (/ClerkProvider|@clerk\/|clerk\.browser/.test(await readFile(path.join(assetsDirectory, mainEntry.file), "utf8"))) failures.push(`Entrée ${mainEntry.file}: contient Clerk`);
if (adminGzip > budgets.admin) failures.push(`Admin ${adminFile}: ${kib(adminGzip)} KiB > ${kib(budgets.admin)} KiB`);
for (const chunk of publicMeasures) if (chunk.gzip > budgets.public) failures.push(`Route ${chunk.file}: ${kib(chunk.gzip)} KiB > ${kib(budgets.public)} KiB`);
// Aucun fichier ne doit garder les repères data-loc="client/src/…:ligne" de l'éditeur visuel
// Manus : du poids pour rien, et les chemins du code source lisibles dans la page (CODE-06).
for (const file of javascript) {
  const sourceLocations = (await readFile(path.join(assetsDirectory, file), "utf8")).match(/data-loc/g)?.length ?? 0;
  if (sourceLocations > 0) failures.push(`${file}: ${sourceLocations} attribut(s) data-loc`);
}

console.table([
  { groupe: "Entrée publique", fichier: mainEntry.file, gzipKiB: kib(mainEntry.gzip), budgetKiB: kib(budgets.entry) },
  { groupe: "Admin lazy", fichier: adminFile, gzipKiB: kib(adminGzip), budgetKiB: kib(budgets.admin) },
  ...publicMeasures.map((chunk) => ({ groupe: "Route publique", fichier: chunk.file, gzipKiB: kib(chunk.gzip), budgetKiB: kib(budgets.public) })),
]);
if (failures.length) throw new Error(`Budget de performance dépassé:\n${failures.join("\n")}`);
