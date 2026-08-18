import { describe, expect, it } from "vitest";

describe("langues professionnelles de candidature", () => {
  it("maintient les langues prioritaires et une option de précision", async () => {
    const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("./RecruitmentPage.tsx", import.meta.url), "utf8"));
    for (const language of ["Arabic", "French", "English", "Italian", "Spanish", "Portuguese", "German", "Chinese", "Other"]) {
      expect(source).toContain(`value: \"${language}\"`);
    }
    expect(source).toContain("recruitment-languages-other");
    expect(source).toContain("Other: ${other}");
  });
});
