import { describe, expect, it } from "vitest";
import { isAcceptedCvFile } from "./RecruitmentPage";

describe("soumission de candidature mobile", () => {
  it("accepte un CV PDF ou Word provenant d’iOS même sans type MIME", () => {
    expect(isAcceptedCvFile({ name: "cv-medecin.pdf", size: 512_000, type: "" })).toBe(true);
    expect(isAcceptedCvFile({ name: "cv-infirmier.docx", size: 512_000, type: "application/octet-stream" })).toBe(true);
  });

  it("continue de bloquer les extensions non autorisées et les fichiers trop volumineux", () => {
    expect(isAcceptedCvFile({ name: "document.exe", size: 512_000, type: "" })).toBe(false);
    expect(isAcceptedCvFile({ name: "cv.pdf", size: 5 * 1024 * 1024 + 1, type: "application/pdf" })).toBe(false);
  });
});
