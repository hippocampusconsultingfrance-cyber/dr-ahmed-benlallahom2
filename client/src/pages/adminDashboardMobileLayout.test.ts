import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/AdminDashboard.tsx"), "utf8");

describe("mise en page mobile du dashboard", () => {
  it("conserve un sélecteur compact et des actions empilables dans les onglets denses", () => {
    expect(source).toContain('id="admin-active-tab"');
    expect(source).toContain("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between");
    expect(source).toContain("min-h-10 flex-1 sm:min-h-0 sm:flex-none");
    expect(source).toContain("min-h-11 w-full md:w-auto md:min-h-0");
    expect(source).toContain("flex flex-col-reverse gap-2 sm:flex-row");
    expect(source).toContain("flex flex-wrap items-center gap-x-3 gap-y-1 mb-1");
    expect(source).toContain('className="break-all">{apt.customerEmail}</span>');
    expect(source).toContain('className="break-all">{msg.email}</span>');
    expect(source).toContain('className="break-all">{req.email}</span>');
    expect(source).toContain('className="break-words text-sm font-medium text-foreground">{t.title}</p>');
  });
});
