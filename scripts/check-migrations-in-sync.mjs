import { spawn } from "node:child_process";
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

/** `args` : options passées à drizzle-kit (par défaut, drizzle.config.ts). */
export function checkMigrationsInSync(args = [], { cwd = process.cwd(), timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    // stdin fermé : une question de drizzle-kit (table renommée ?) échoue au lieu d'attendre.
    const child = spawn("pnpm", ["exec", "drizzle-kit", "generate", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { output += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (signal) output += `\ndrizzle-kit arrêté par ${signal} (durée limite : ${timeoutMs / 1000} s).\n`;
      resolve({ inSync: code === 0 && output.includes(IN_SYNC_MESSAGE), output });
    });
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
