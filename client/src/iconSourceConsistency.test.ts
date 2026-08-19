import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("cohérence des icônes", () => {
  it("utilise Lucide comme seule bibliothèque d’icônes dans les sources client", () => {
    const sources = listSourceFiles(resolve(process.cwd(), "client/src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(sources).not.toMatch(/from ["']react-icons/);
    expect(sources).not.toMatch(/from ["']@heroicons/);
    expect(sources).toMatch(/from ["']lucide-react/);
  });
});
