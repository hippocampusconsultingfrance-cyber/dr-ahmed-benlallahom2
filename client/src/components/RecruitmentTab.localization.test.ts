import { describe, expect, it } from "vitest";
import { recruitmentActionsCopy, recruitmentDetailsCopy, recruitmentMatchingCopy, recruitmentTableCopy } from "./RecruitmentTab";

describe("tableau Candidatures localisé", () => {
  it("définit les filtres, statuts et état vide dans les quatre langues actives", () => {
    for (const copy of Object.values(recruitmentTableCopy)) {
      expect(Object.values(copy.statuses)).toHaveLength(6);
      expect(Object.values(copy.analysisStatuses)).toHaveLength(6);
      expect(copy.filters.allStatuses).not.toHaveLength(0);
      expect(copy.empty).not.toHaveLength(0);
    }
  });

  it("conserve les libellés de statut prioritaires localisés", () => {
    expect(recruitmentTableCopy.en.statuses.shortlisted).toBe("Shortlisted");
    expect(recruitmentTableCopy.de.analysisStatuses.needs_review).toBe("Menschliche Prüfung erforderlich");
    expect(recruitmentTableCopy.zh.filters.country).toBe("目标国家");
  });

  it("localise les actions CV et le compositeur d’email", () => {
    for (const copy of Object.values(recruitmentActionsCopy)) {
      expect(copy.confirmErase).not.toHaveLength(0);
      expect(copy.extraHelp).not.toHaveLength(0);
      expect(copy.individualMessage("A.")).not.toHaveLength(0);
    }
    expect(recruitmentActionsCopy.en.send).toBe("Send email");
    expect(recruitmentActionsCopy.de.candidate360).toBe("360°-Profil");
  });

  it("localise les détails de fichier et la lecture IA", () => {
    for (const copy of Object.values(recruitmentDetailsCopy)) {
      expect(copy.fileStatuses.accepted).not.toHaveLength(0);
      expect(copy.pages(2)).not.toHaveLength(0);
      expect(copy.waitingAnalysis).not.toHaveLength(0);
    }
    expect(recruitmentDetailsCopy.en.intelligentReading).toBe("Intelligent CV review");
    expect(recruitmentDetailsCopy.zh.fileCheck).toBe("文件检查");
  });

  it("localise la création de profils de matching", () => {
    for (const copy of Object.values(recruitmentMatchingCopy)) {
      expect(copy.intro).not.toHaveLength(0);
      expect(copy.languages).not.toHaveLength(0);
      expect(copy.saved).not.toHaveLength(0);
    }
    expect(recruitmentMatchingCopy.en.title).toBe("Matching profiles");
    expect(recruitmentMatchingCopy.zh.save).toBe("保存");
  });
});
