import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("MedicalCitation", () => {
  it("exige une source et une date, avec un lien externe protégé lorsque fourni", async () => {
    const root = process.cwd();
    const [component, guide] = await Promise.all([
      readFile(path.join(root, "client/src/components/MedicalCitation.tsx"), "utf8"),
      readFile(path.join(root, "MEDICAL_CITATION_USAGE.md"), "utf8"),
    ]);
    for (const marker of ["source: string", "updatedAt: string", "MedicalCitationLevel", "noopener noreferrer", "Ne doit pas être employé", "Vérifié le"]) expect(component).toContain(marker);
    for (const marker of ["`source`", "`updatedAt`", "promesse thérapeutique", "YYYY-MM-DD"]) expect(guide).toContain(marker);
  });
});
