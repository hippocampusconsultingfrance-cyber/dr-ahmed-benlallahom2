import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("reflow mobile du Vivier", () => {
  it("répartit les actions et protège les attributs candidats contre le débordement", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/components/VivierTab.tsx"), "utf8");

    expect(source).toContain('className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap"');
    expect(source).toContain('className="min-h-10 w-full sm:w-auto sm:min-h-0"');
    expect(source).toContain('className="mt-1 h-4 w-4 shrink-0 accent-primary"');
    expect(source).toContain('className="break-words font-semibold text-foreground">{name}</h3>');
    expect(source).toContain('max-w-full break-words rounded-full border px-2.5 py-1 text-xs font-medium');
  });
});
