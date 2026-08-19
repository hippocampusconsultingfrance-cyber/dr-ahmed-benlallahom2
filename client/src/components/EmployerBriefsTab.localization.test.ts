import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("briefs Employeurs multilingues", () => {
  it("localise les statuts et le titre dans les quatre langues actives", async () => {
    const source = await readFile(new URL("./EmployerBriefsTab.tsx", import.meta.url), "utf8");
    expect(source).toContain("const briefCopy = {");
    expect(source).toContain("const { language } = useLanguage();");
    expect(source).toContain("copy.statuses");
    expect(source).toContain("{copy.title}");
  });
});
