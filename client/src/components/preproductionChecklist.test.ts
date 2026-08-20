import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("checklist préproduction", () => {
  it("impose une validation graphique avant toute publication de changement visuel", async () => {
    const checklist = await readFile(path.resolve(process.cwd(), "PREPRODUCTION_CHECKLIST.md"), "utf8");

    expect(checklist).toContain("Validation graphique obligatoire");
    expect(checklist).toContain("vue desktop et mobile");
    expect(checklist).toContain("Captures datées");
    expect(checklist).toContain("ne modifie ni le code client, ni les styles, ni les ressources visuelles");
  });
});
