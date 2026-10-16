import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.join(process.cwd(), "client/src");
const read = (relative: string) => readFileSync(path.join(srcRoot, relative), "utf8");

/** Résout les imports statiques locaux d'un fichier source (alias @/ et chemins relatifs). */
function staticLocalImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const imports: string[] = [];
  // Imports statiques uniquement : `import(...)` dynamique (React.lazy) crée un chunk séparé.
  // Les imports de types (`import type`) sont effacés à la compilation et ignorés ici.
  for (const match of source.matchAll(/^\s*(?:import|export)\s(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)) {
    const specifier = match[1];
    if (specifier.startsWith("@/")) imports.push(path.join(srcRoot, specifier.slice(2)));
    else if (specifier.startsWith(".")) imports.push(path.resolve(path.dirname(file), specifier));
  }
  return imports
    .map(base => [base, `${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")].find(candidate => {
      try {
        return readFileSync(candidate) && true;
      } catch {
        return false;
      }
    }))
    .filter((value): value is string => Boolean(value));
}

function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...staticLocalImports(file));
  }
  return seen;
}

describe("Clerk chargé uniquement pour /admin (M31 / PERF-01)", () => {
  it("le point d'entrée et ses imports statiques n'importent pas @clerk/*", () => {
    const graph = staticGraph(path.join(srcRoot, "main.tsx"));
    expect(graph.has(path.join(srcRoot, "App.tsx"))).toBe(true);
    const offenders = [...graph].filter(file => /from\s+["']@clerk\//.test(readFileSync(file, "utf8")));
    expect(offenders.map(file => path.relative(srcRoot, file))).toEqual([]);
  });

  it("la route /admin charge la racine admin à la demande", () => {
    const app = read("App.tsx");
    expect(app).toContain('const AdminDashboard = lazy(() => import("./pages/AdminRoot"));');
    expect(app).toContain('<Route path="/admin" component={AdminDashboard} />');
    expect(app).not.toMatch(/^import .*AdminRoot/m);
    expect(read("pages/AdminRoot.tsx")).toMatch(/import \{ ClerkProvider \} from "@clerk\/react";/);
  });

  it("aucune page publique n'utilise le hook d'authentification Clerk", () => {
    const pages = readdirSync(path.join(srcRoot, "pages")).filter(name => name.endsWith(".tsx"));
    const users = pages.filter(name => /@clerk\/|_core\/hooks\/useAuth/.test(read(`pages/${name}`)));
    expect(users.sort()).toEqual(["AdminDashboard.tsx", "AdminRoot.tsx"]);
  });

  it("une clé Clerk absente ne casse plus tout le site (page blanche) mais seulement /admin", () => {
    expect(read("main.tsx")).not.toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
    expect(read("pages/AdminRoot.tsx")).toContain("Administration indisponible");
  });
});
