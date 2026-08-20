import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("gouvernance graphique", () => {
  it("lie la checklist de publication à une cadence de revue trimestrielle", async () => {
    const root = process.cwd();
    const [checklist, calendar] = await Promise.all([
      readFile(path.join(root, "PREPRODUCTION_CHECKLIST.md"), "utf8"),
      readFile(path.join(root, "ANNUAL_REVIEW_CALENDAR.md"), "utf8"),
    ]);

    expect(checklist).toContain("| Revue graphique |");
    expect(checklist).toContain("pnpm test:visual");
    for (const quarter of ["T1", "T2", "T3", "T4"]) expect(calendar).toContain(quarter);
    expect(calendar).toContain("VISUAL_ASSET_RIGHTS_REGISTER.md");
    expect(calendar).toContain("bloque la publication");
  });
});
