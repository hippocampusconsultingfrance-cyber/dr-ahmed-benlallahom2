import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("validation administrative des réponses Questions santé", () => {
  it("explique explicitement le minimum requis et rend visible l’état désactivé", async () => {
    const source = await readFile(path.join(process.cwd(), "client/src/components/MedicalQuestionsAdminTab.tsx"), "utf8");

    expect(source).toContain("const MIN_PRIVATE_RESPONSE_LENGTH = 20");
    expect(source).toContain("Ajoutez encore");
    expect(source).toContain("disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40");
    expect(source).toContain("La réponse privée doit comporter au moins");
  });
});
