import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const checklist = readFileSync(resolve(process.cwd(), "PREPRODUCTION_CHECKLIST.md"), "utf8");

describe("checklist de préproduction", () => {
  it("couvre les contrôles critiques du projet", () => {
    [
      "pnpm test",
      "pnpm build",
      "Réservation",
      "Portail candidat",
      "Confidentialité",
      "Accessibilité",
      "Référencement",
      "Résilience",
    ].forEach((control) => expect(checklist).toContain(control));
  });
});
