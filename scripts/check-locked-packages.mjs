import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Contrôle de CI (CODE-14) : les paquets que pnpm a installés pour le job quality sont ceux
 * du registre npm, tels que publiés, chacun fixé par son empreinte. L'étape « Check this
 * workflow » le lance juste après l'installation, son empreinte vérifiée, avant vitest, dont il
 * garantit le code : rien du dépôt n'a encore tourné (installation sans scripts ni pnpmfile).
 * Refusés : dans pnpm-lock.yaml, toute résolution autre que {integrity: sha512-…} (une
 * adresse de tarball, un dossier, un dépôt git, un commit), toute dépendance liée à un dossier
 * ou à un fichier du dépôt (link:, file:), tout correctif, pnpmfile ou manifeste étendu qu'il
 * enregistre, toute clé de premier niveau non listée ; dans .npmrc et pnpm-workspace.yaml, un
 * autre registre, qui servirait le paquet d'une empreinte réécrite. Le fichier est lu ligne à
 * ligne, pas en YAML : pnpm ne l'écrit qu'avec des apostrophes, sans guillemet ni échappement,
 * et une ligne qu'un échappement ou un autre agencement ferait lire autrement est refusée.
 * server/ciWorkflow.test.ts en teste chaque refus.
 */
export const LOCKED_PACKAGES_MESSAGE =
  "pnpm-lock.yaml: every package from the registry, pinned by its integrity";

/** The top-level keys of the lockfile pnpm writes for this project; any other (patchedDependencies, pnpmfileChecksum, packageExtensionsChecksum, catalogs…) is refused. */
const LOCKFILE_KEYS = [
  "lockfileVersion",
  "settings",
  "overrides",
  "importers",
  "packages",
  "snapshots",
];

/** The one resolution pnpm writes for a package of the registry. */
const INTEGRITY_RESOLUTION =
  /^ {4}resolution: \{integrity: sha512-[A-Za-z0-9+/]+={0,2}\}$/;

/** A specifier or a version naming a directory or a file of the repository (`version: link:./ci/vitest`, `x@file:../x`). */
const LOCAL_PACKAGE = /(?::\s+|@|')(?:link|file):/;

/** A registry setting, any scope (`registry=`, `@vitest:registry=`, `registry:` in pnpm-workspace.yaml). */
const REGISTRY_SETTING = /registry\s*[=:]/i;

/** The problems of a lockfile, and of pnpm's configuration files (by name), one a line. */
export function lockedPackagesProblems(lockfile, configs = {}) {
  const problems = [];
  lockfile.split("\n").forEach((line, index) => {
    const at = `pnpm-lock.yaml:${index + 1}`;
    if (/["\\]/.test(line))
      problems.push(
        `${at}: a double quote or a backslash, which pnpm does not write`
      );
    if (/resolution/i.test(line) && !INTEGRITY_RESOLUTION.test(line))
      problems.push(`${at}: a resolution other than {integrity: sha512-…}`);
    if (LOCAL_PACKAGE.test(line))
      problems.push(`${at}: a package of the repository (link:, file:)`);
    if (
      /^[^\s#]/.test(line) &&
      !LOCKFILE_KEYS.includes(/^(\w+):(?:\s|$)/.exec(line)?.[1] ?? "")
    )
      problems.push(`${at}: a key other than ${LOCKFILE_KEYS.join(", ")}`);
  });
  for (const [file, text] of Object.entries(configs)) {
    text.split("\n").forEach((line, index) => {
      if (REGISTRY_SETTING.test(line) && !line.trim().startsWith("#"))
        problems.push(`${file}:${index + 1}: a registry setting`);
    });
  }
  return problems;
}

function main() {
  const configs = Object.fromEntries(
    [".npmrc", "pnpm-workspace.yaml"]
      .filter(file => existsSync(file))
      .map(file => [file, readFileSync(file, "utf8")])
  );
  const problems = lockedPackagesProblems(
    readFileSync("pnpm-lock.yaml", "utf8"),
    configs
  );
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  console.log(LOCKED_PACKAGES_MESSAGE);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  main();
