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
    // Publication is optional and never blocks the question (LEGAL-11).
    expect(page).not.toContain("if (!form.publication)");
    expect(page).toContain("publicationConsent: form.publication");
    expect(page).toContain("required={false}");
    expect(page).toContain('aria-required={required ? "true" : undefined}');
    // Explicit consent for health data (art. 9.2.a).
    expect(page).toContain("qui peut contenir des informations sur ma santé");
  });

  it("présente les encadrés urgence et confidentialité comme des notes, pas des repères complémentaires (PUB-A11Y-02)", async () => {
    const page = await readFile(path.join(process.cwd(), "client/src/pages/MedicalQuestionsPage.tsx"), "utf8");
    expect(page).not.toContain("<aside");
    expect(page.match(/<section role="note"/g)).toHaveLength(2);
  });
});
