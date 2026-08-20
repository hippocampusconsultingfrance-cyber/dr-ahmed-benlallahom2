import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("reflow mobile des listes administratives", () => {
  it("autorise le retour à la ligne et la coupure des coordonnées longues", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/pages/AdminDashboard.tsx"), "utf8");

    expect(source).toContain("flex flex-wrap items-center gap-x-3 gap-y-1 mb-1");
    expect(source).toContain('className="break-all">{apt.customerEmail}</span>');
    expect(source).toContain('className="break-all">{msg.email}</span>');
    expect(source).toContain('className="break-all">{req.email}</span>');
    expect(source).toContain('className="max-w-full break-all text-xs text-muted-foreground font-mono">{apt.trackingId}</span>');
  });
});
