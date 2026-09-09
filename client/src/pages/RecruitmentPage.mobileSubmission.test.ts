import { readFile } from "node:fs/promises";
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

  it("ne confirme jamais une candidature sans numéro de suivi serveur", async () => {
    const source = await readFile(new URL("./RecruitmentPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('typeof payload.trackingId !== "string"');
    expect(source).not.toContain('setTrackingId(payload.trackingId || "")');
  });

  it("associe les recherches de spécialité et de pays à un nom accessible", async () => {
    const source = await readFile(new URL("./RecruitmentPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="recruitment-specialty-label"');
    expect(source).toContain('aria-labelledby="recruitment-specialty-label"');
    expect(source).toContain('aria-label={t.specialtySearch}');
    expect(source).toContain('id="recruitment-diploma-country-label"');
    expect(source).toContain('aria-labelledby="recruitment-diploma-country-label"');
  });
});
