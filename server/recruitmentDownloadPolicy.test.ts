import { describe, expect, it } from "vitest";
import { canAdminDownloadCv } from "./recruitmentDownloadPolicy";

describe("politique de téléchargement des CV", () => {
  it("autorise les CV en quarantaine ou acceptés tant qu’ils sont conservés", () => {
    expect(canAdminDownloadCv({ cvFileKey: "recruitment/quarantine/CV-1.pdf", fileValidationStatus: "quarantined" })).toBe(true);
    expect(canAdminDownloadCv({ cvFileKey: "recruitment/cv/CV-2.pdf", fileValidationStatus: "accepted" })).toBe(true);
  });

  it("bloque uniquement les fichiers rejetés ou explicitement retirés", () => {
    expect(canAdminDownloadCv({ cvFileKey: "recruitment/quarantine/CV-3.pdf", fileValidationStatus: "validation_failed" })).toBe(false);
    expect(canAdminDownloadCv({ cvFileKey: "retired/CV-4", fileValidationStatus: "accepted" })).toBe(false);
  });
});
