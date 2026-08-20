import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("reflow mobile de l’observabilité de sécurité", () => {
  it("protège les textes longs et badges contre le débordement", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/components/SecurityOperationsTab.tsx"), "utf8");

    expect(source).toContain('className="flex min-w-0 gap-3"');
    expect(source).toContain('className="min-w-0"');
    expect(source).toContain('className="flex flex-wrap items-center gap-2"');
    expect(source).toContain('max-w-full break-words rounded-full');
  });
});
