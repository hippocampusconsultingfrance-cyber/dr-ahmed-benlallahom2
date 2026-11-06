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
    // 4 MB: under the 4.5 MB request body limit of a Vercel function.
    expect(isAcceptedCvFile({ name: "cv.pdf", size: 4 * 1024 * 1024, type: "application/pdf" })).toBe(true);
    expect(isAcceptedCvFile({ name: "cv.pdf", size: 4 * 1024 * 1024 + 1, type: "application/pdf" })).toBe(false);
    // The legacy Word format cannot be inspected for macros and is refused.
    expect(isAcceptedCvFile({ name: "cv.doc", size: 512_000, type: "application/msword" })).toBe(false);
  });

});
