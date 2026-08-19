import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const imageBearingComponents = [
  "components/AboutSection.tsx",
  "components/ContactSection.tsx",
  "components/Footer.tsx",
  "components/GDPRRequestForm.tsx",
  "components/HeroSection.tsx",
  "components/ManusDialog.tsx",
  "components/Navigation.tsx",
  "components/ServicesSection.tsx",
  "pages/BlogPage.tsx",
  "pages/BlogPostPage.tsx",
  "pages/VenturePage.tsx",
];

describe("image alternatives", () => {
  it("gives every rendered image an explicit alternative text policy", async () => {
    const sourceRoot = resolve(import.meta.dirname);
    const sourceFiles = await Promise.all(imageBearingComponents.map(file => readFile(resolve(sourceRoot, file), "utf8")));
    const imageTags = sourceFiles.flatMap(source => source.match(/<img\b[\s\S]*?\/>/g) ?? []);

    expect(imageTags.length).toBeGreaterThan(0);
    for (const tag of imageTags) {
      expect(tag).toMatch(/\balt\s*=/);
    }

    expect(sourceFiles.join("\n")).not.toContain('alt="Dialog graphic"');
    expect(sourceFiles.join("\n")).not.toContain('alt="Dr. ABL"');
  });
});
