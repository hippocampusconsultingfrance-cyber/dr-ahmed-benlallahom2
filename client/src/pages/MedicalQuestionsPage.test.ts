import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("page de questions médicales", () => {
  it("expose le service gratuit avec un consentement distinct et un avertissement urgent", async () => {
    const page = await readFile(path.join(process.cwd(), "client/src/pages/MedicalQuestionsPage.tsx"), "utf8");
    expect(page).toContain("publicationConsent");
    expect(page).toContain("urgencyAcknowledged");
    expect(page).toContain("Ce service ne traite pas les urgences");
    expect(page).toContain("TurnstileWidget");
  });
});
