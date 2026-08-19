import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("page Pourquoi Hippocampus", () => {
  it("conserve une présentation employeur multilingue, ses garanties et ses appels à l’action", async () => {
    const source = await readFile(new URL("./WhyHippocampusPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("fr: {");
    expect(source).toContain("en: {");
    expect(source).toContain("de: {");
    expect(source).toContain("zh: {");
    expect(source).toContain("steps:");
    expect(source).toContain("guarantees:");
    expect(source).toContain('href="/employers"');
    expect(source).toContain('href="/recruitment"');
    expect(source).toContain('"@type": "ProfessionalService"');
  });

  it("conserve la route éditoriale publique", async () => {
    const app = await readFile(new URL("../App.tsx", import.meta.url), "utf8");

    expect(app).toContain('const WhyHippocampusPage = lazy(() => import("./pages/WhyHippocampusPage"))');
    expect(app).toContain('<Route path="/why-hippocampus" component={WhyHippocampusPage} />');
  });
});
