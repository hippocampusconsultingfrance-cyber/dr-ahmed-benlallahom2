import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("actions de témoignages sur mobile", () => {
  it("autorise le retour à la ligne et des cibles tactiles pour les actions multiples", async () => {
    const source = await readFile(new URL("./AdminDashboard.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap"');
    expect(source).toContain('className="min-h-10 flex-1 sm:min-h-0 sm:flex-none"');
  });
});
