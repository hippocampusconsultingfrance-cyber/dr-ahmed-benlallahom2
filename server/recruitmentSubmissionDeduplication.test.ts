import { describe, expect, it } from "vitest";
import { isSameRecruitmentSubmission } from "./recruitmentSubmissionDeduplication";

describe("déduplication des candidatures", () => {
  it("réutilise uniquement une candidature identique du même candidat et du même parcours", () => {
    expect(isSameRecruitmentSubmission(
      { email: "candidate@example.com", specialty: "Cardiologie" },
      { email: " Candidate@Example.com ", specialty: " cardiologie " },
    )).toBe(true);
  });

  it("autorise le même CV pour un nouveau parcours VVIP", () => {
    expect(isSameRecruitmentSubmission(
      { email: "candidate@example.com", specialty: "Cardiologie" },
      { email: "candidate@example.com", specialty: "[VVIP / Offshore] Cardiologie (Plateforme offshore)" },
    )).toBe(false);
  });

  it("n’assimile jamais deux candidats différents", () => {
    expect(isSameRecruitmentSubmission(
      { email: "first@example.com", specialty: "Cardiologie" },
      { email: "second@example.com", specialty: "Cardiologie" },
    )).toBe(false);
  });
});
