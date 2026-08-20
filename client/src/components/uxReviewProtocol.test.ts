import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("procédure de revue UX", () => {
  it("impose le consentement, l’anonymisation et exclut les faux témoignages", async () => {
    const source = await readFile(path.join(process.cwd(), "UX_REVIEW_PROTOCOL.md"), "utf8");
    for (const term of ["Consentement", "Anonymisation", "données de santé", "droit de retrait", "faux avis", "décision automatisée", "EXTERNAL_VALIDATION_REGISTER.md"]) {
      expect(source).toContain(term);
    }
  });
});
