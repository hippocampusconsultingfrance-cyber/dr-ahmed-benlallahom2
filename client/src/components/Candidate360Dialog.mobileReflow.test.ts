import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("reflow mobile de Candidate 360°", () => {
  it("protège les sections détaillées, chronologie et actions de suivi contre les textes longs", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/components/Candidate360Dialog.tsx"), "utf8");

    expect(source).toContain('className="max-w-full break-words rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground"');
    expect(source).toContain('className="mt-3 break-words whitespace-pre-wrap text-sm leading-6 text-muted-foreground"');
    expect(source).toContain('className="min-h-10 w-full sm:w-auto sm:min-h-0"');
    expect(source).toContain('className="relative min-w-0"');
  });
});
