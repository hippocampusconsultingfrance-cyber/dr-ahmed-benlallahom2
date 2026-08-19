import { describe, expect, it } from "vitest";
import { adminShellCopy } from "./AdminDashboard";

describe("shell d’administration localisé", () => {
  it("définit l’en-tête et tous les onglets dans les quatre langues actives", () => {
    for (const copy of Object.values(adminShellCopy)) {
      expect(copy.title).not.toHaveLength(0);
      expect(copy.site).not.toHaveLength(0);
      expect(copy.section).not.toHaveLength(0);
      expect(Object.values(copy.access).every(label => label.length > 0)).toBe(true);
      expect(Object.values(copy.tabs)).toHaveLength(12);
      expect(Object.values(copy.tabs).every(label => label.length > 0)).toBe(true);
    }
  });

  it("conserve les libellés chinois et allemands prioritaires", () => {
    expect(adminShellCopy.de.tabs.recruitment).toBe("Bewerbungen");
    expect(adminShellCopy.zh.tabs.candidateDocuments).toBe("候选人文件");
    expect(adminShellCopy.en.access.loginRequired).toBe("Administrator sign-in required");
    expect(adminShellCopy.zh.access.verify).toBe("验证代码");
  });
});
