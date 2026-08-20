import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("reflow mobile du pilotage Recrutement", () => {
  it("protège les métriques, badges et statuts contre les libellés longs", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/components/RecruitmentDashboardPanel.tsx"), "utf8");

    expect(source).toContain('className="max-w-[65%] break-words text-right text-2xl font-semibold tracking-tight text-foreground"');
    expect(source).toContain('className="max-w-full break-words rounded-full border border-primary/25 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground"');
    expect(source).toContain('className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"');
    expect(source).toContain('className="min-w-0 break-words text-muted-foreground"');
  });
});
