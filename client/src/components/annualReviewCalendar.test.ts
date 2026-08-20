import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("calendrier annuel de revue", () => {
  it("couvre les revues de traduction, accessibilité, visuels, contenus médicaux et RGPD", async () => {
    const calendar = await readFile(path.resolve(process.cwd(), "ANNUAL_REVIEW_CALENDAR.md"), "utf8");

    expect(calendar).toContain("Traductions et identité visuelle");
    expect(calendar).toContain("Accessibilité et performances");
    expect(calendar).toContain("Droits sur visuels et logos");
    expect(calendar).toContain("Contenus médicaux et sources");
    expect(calendar).toContain("Pages légales et RGPD");
  });
});
