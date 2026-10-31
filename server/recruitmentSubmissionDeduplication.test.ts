import { describe, expect, it } from "vitest";
import { isSameRecruitmentSubmission } from "./recruitmentSubmissionDeduplication";

describe("déduplication des candidatures", () => {
  it("réutilise uniquement une candidature identique du même candidat et du même parcours", () => {
    expect(isSameRecruitmentSubmission(
      { email: "candidate@example.com", specialty: "Cardiologie", targetCountries: JSON.stringify(["Canada", "Suisse"]) },
      { email: " Candidate@Example.com ", specialty: " cardiologie ", targetCountries: ["suisse", "Canada"] },
    )).toBe(true);
  });

  it("autorise le même CV pour un nouveau parcours VVIP", () => {
    expect(isSameRecruitmentSubmission(
      { email: "candidate@example.com", specialty: "Cardiologie", targetCountries: JSON.stringify(["Canada"]) },
      { email: "candidate@example.com", specialty: "[VVIP / Offshore] Cardiologie", targetCountries: ["Canada"] },
    )).toBe(false);
  });

  it("enregistre une nouvelle candidature VVIP pour d’autres environnements (INTL-03)", () => {
    const existing = { email: "candidate@example.com", specialty: "[VVIP / Offshore] Médecin urgentiste (ATLS / ACLS)", targetCountries: JSON.stringify(["Moyen-Orient (Gouvernement / VVIP)"]) };
    expect(isSameRecruitmentSubmission(existing, { ...existing, targetCountries: ["Moyen-Orient (Gouvernement / VVIP)", "Sociétés minières & industrielles isolées"] })).toBe(false);
    expect(isSameRecruitmentSubmission(existing, { ...existing, targetCountries: ["Sociétés minières & industrielles isolées"] })).toBe(false);
    expect(isSameRecruitmentSubmission(existing, { ...existing, targetCountries: ["Moyen-Orient (Gouvernement / VVIP)"] })).toBe(true);
  });

  it("n’assimile jamais deux candidats différents", () => {
    expect(isSameRecruitmentSubmission(
      { email: "first@example.com", specialty: "Cardiologie", targetCountries: JSON.stringify(["Canada"]) },
      { email: "second@example.com", specialty: "Cardiologie", targetCountries: ["Canada"] },
    )).toBe(false);
  });
});
