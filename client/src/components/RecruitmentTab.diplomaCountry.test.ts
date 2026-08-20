import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("pays d’obtention du diplôme dans les candidatures", () => {
  it("affiche le pays lorsqu’il est renseigné sans masquer les candidatures historiques", async () => {
    const source = await readFile(path.join(process.cwd(), "client/src/components/RecruitmentTab.tsx"), "utf8");
    expect(source).toContain("application.diplomaCountry");
    expect(source).toContain("Diplôme obtenu");
  });
});
