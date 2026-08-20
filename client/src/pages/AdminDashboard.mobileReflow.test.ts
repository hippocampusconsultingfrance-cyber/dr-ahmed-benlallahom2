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

  it("préserve les actions tactiles et le reflow des créneaux et dates bloquées", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/pages/AdminDashboard.tsx"), "utf8");

    expect(source).toContain('className="min-w-0 flex flex-wrap gap-x-2 gap-y-1"');
    expect(source).toContain('className="min-h-10 w-full self-stretch sm:w-auto sm:self-start sm:min-h-0"');
    expect(source).toContain('className="break-words text-sm text-muted-foreground sm:ml-3">{bd.reason}</span>');
  });

  it("autorise les informations longues et les actions tactiles dans les cartes de témoignages", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/pages/AdminDashboard.tsx"), "utf8");

    expect(source).toContain('className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1"');
    expect(source).toContain('className="break-words text-sm font-medium text-foreground">{t.title}</p>');
    expect(source).toContain('className="min-h-10 flex-1 sm:min-h-0 sm:flex-none"');
  });
});
