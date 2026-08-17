import { describe, expect, it } from "vitest";
import { computeBriefCandidateMatch } from "./clientBriefMatching";

describe("matching mission–candidat", () => {
  const brief = { specialtyNeeded: "Anesthésie-réanimation", country: "Arabie saoudite", requiredCertifications: "ACLS, ATLS" };

  it("valorise la spécialité, le pays et les certifications explicitement renseignées", () => {
    const result = computeBriefCandidateMatch(brief, {
      specialty: "Médecin anesthésiste-réanimateur",
      targetCountries: '["Arabie saoudite", "Qatar"]',
      certifications: "",
      normalizedCertifications: '[{"name":"ACLS"},{"name":"ATLS"}]',
    });
    expect(result.score).toBe(100);
    expect(result.matchedCertifications).toEqual(["ACLS", "ATLS"]);
  });

  it("ne déduit rien lorsqu’aucune information professionnelle pertinente n’est présente", () => {
    const result = computeBriefCandidateMatch(brief, {
      specialty: "Pédiatrie",
      targetCountries: '["France"]',
      certifications: null,
      normalizedCertifications: null,
    });
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });
});
