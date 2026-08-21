import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("accès navigation aux questions médicales", () => {
  it("affiche le lien dédié dans les menus bureau et mobile", async () => {
    const navigation = await readFile(path.join(process.cwd(), "client/src/components/Navigation.tsx"), "utf8");
    expect(navigation).toContain('href="/questions-anesthesie"');
    expect(navigation).toContain('fr: "Questions santé"');
    expect((navigation.match(/href="\/questions-anesthesie"/g) ?? [])).toHaveLength(2);
    expect(navigation).toContain('window.location.pathname === "/questions-anesthesie"');
    expect(navigation).toContain("medicalQuestionsDesktopClass");
    expect(navigation).toContain("medicalQuestionsMobileClass");
  });
});
