import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("repli localisé des composants administratifs", () => {
  it("réutilise l’utilitaire typé dans Candidate 360° et le pilotage Recrutement", async () => {
    const [candidate, dashboard] = await Promise.all([
      readFile(path.resolve(process.cwd(), "client/src/components/Candidate360Dialog.tsx"), "utf8"),
      readFile(path.resolve(process.cwd(), "client/src/components/RecruitmentDashboardPanel.tsx"), "utf8"),
    ]);

    expect(candidate).toContain('getLocalizedCopy(candidate360Copy, language, "fr")');
    expect(dashboard).toContain('getLocalizedCopy(recruitmentDashboardCopy, language, "fr")');
  });
});
