import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("grille responsive publique", () => {
  it("conserve des gouttières communes et des wrappers contraints sur les routes représentatives", async () => {
    const root = process.cwd();
    const css = await readFile(path.join(root, "client/src/index.css"), "utf8");
    for (const rule of [".container", "padding-left: 1rem", "padding-left: 1.5rem", "padding-left: 2rem", "max-width: 1280px"]) expect(css).toContain(rule);

    const pages = ["FAQPage.tsx", "LegalPage.tsx", "ResourcesPage.tsx", "PressPage.tsx", "EmployersPage.tsx", "RecruitmentPage.tsx", "RecruitmentHubPage.tsx", "VvipOffshorePage.tsx", "WhyHippocampusPage.tsx", "VenturePage.tsx", "SearchPage.tsx"];
    for (const page of pages) {
      const source = await readFile(path.join(root, "client/src/pages", page), "utf8");
      expect(source, page).toMatch(/container|mx-auto max-w/);
    }
  });
});
