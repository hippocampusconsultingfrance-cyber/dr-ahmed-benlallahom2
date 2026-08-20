import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("reflow mobile de Mailing", () => {
  it("protège les audiences, identités et métriques de campagne contre le débordement", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/components/MailingTab.tsx"), "utf8");

    expect(source).toContain('className="mt-0.5 shrink-0" type="radio"');
    expect(source).toContain('<span className="break-words">{label}</span>');
    expect(source).toContain('className="min-w-0"><h4 className="break-words font-semibold text-foreground"');
    expect(source).toContain('className="flex items-start gap-1.5 break-words text-emerald-700 dark:text-emerald-300"');
    expect(source).toContain('w-fit max-w-full break-words rounded-full border px-2.5 py-1 text-xs font-medium');
  });
});
