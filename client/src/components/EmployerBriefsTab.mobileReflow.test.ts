import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("reflow mobile des Briefs Employeurs", () => {
  it("protège les cartes, shortlist et pagination contre les textes longs", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/components/EmployerBriefsTab.tsx"), "utf8");

    expect(source).toContain('className="max-w-[45%] break-words rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"');
    expect(source).toContain('className="min-h-10 w-full sm:w-auto sm:min-h-0"');
    expect(source).toContain('className="max-w-full break-words rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-medium text-foreground"');
    expect(source).toContain('className="min-h-10 flex-1 sm:min-h-0 sm:flex-none"');
  });
});
