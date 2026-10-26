import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Contrôle de CI (CODE-14) : les migrations de drizzle/pg doivent décrire
 * exactement drizzle/schema.ts. `drizzle-kit generate` ne doit rien avoir à
 * générer, et le dire. Son code de sortie ne suffit pas : il répond 0 même
 * quand il échoue sans rien écrire (schéma qui ne se charge pas, instantanés
 * de deux branches en collision, renommage qui attend une réponse au clavier).
 * La CI vérifie ensuite avec git que drizzle/pg n'a pas bougé.
 * Procédure pour ajouter une migration : drizzle/MIGRATION_SOURCE_OF_TRUTH.md.
 */
export const IN_SYNC_MESSAGE = "No schema changes, nothing to migrate";

// Le binaire de drizzle-kit (bin.cjs, non exporté) est à côté de son point d'entrée.
const DRIZZLE_KIT_BIN = path.join(path.dirname(createRequire(import.meta.url).resolve("drizzle-kit")), "bin.cjs");

/**
 * `args` : options passées à drizzle-kit (par défaut, drizzle.config.ts).
 * `bin` : script Node lancé à la place de drizzle-kit (tests).
 */
export function checkMigrationsInSync(args = [], { cwd = process.cwd(), timeoutMs = 120_000, bin = DRIZZLE_KIT_BIN } = {}) {
  return new Promise((resolve, reject) => {
    // Node lance drizzle-kit lui-même, sans pnpm, dans son propre groupe de processus : à la durée
    // limite, tout le groupe est tué. stdin fermé : une question (table renommée ?) échoue au lieu d'attendre.
    const child = spawn(process.execPath, [bin, "generate", ...args], { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    const settle = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { output += chunk; });
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      // Un descendant sorti du groupe garderait les tubes ouverts : on n'attend pas « close ».
      child.stdout.destroy();
      child.stderr.destroy();
      settle({ inSync: false, output: `${output}\ndrizzle-kit arrêté par SIGKILL (durée limite : ${timeoutMs / 1000} s).\n` });
    }, timeoutMs);
    child.once("error", error => {
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => settle({ inSync: code === 0 && output.includes(IN_SYNC_MESSAGE), output }));
  });
}

async function main() {
  const { inSync, output } = await checkMigrationsInSync();
  process.stdout.write(output);
  if (!inSync) {
    console.error(
      `\ndrizzle-kit generate n'a pas répondu « ${IN_SYNC_MESSAGE} » : drizzle/pg ne décrit pas drizzle/schema.ts, ` +
        "ou drizzle-kit a échoué (voir ci-dessus). Procédure : drizzle/MIGRATION_SOURCE_OF_TRUTH.md.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
