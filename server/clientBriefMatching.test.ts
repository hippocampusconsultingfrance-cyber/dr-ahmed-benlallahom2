import { describe, expect, it } from "vitest";
import { certificationDateIsCurrent, computeBriefCandidateMatch } from "./clientBriefMatching";

describe("matching mission–candidat", () => {
  const brief = { specialtyNeeded: "Anesthésie-réanimation", country: "Arabie saoudite", requiredCertifications: "ACLS, ATLS" };

  it("valorise la spécialité, le pays et les certifications explicitement renseignées", () => {
    const result = computeBriefCandidateMatch(brief, {
      specialty: "Médecin anesthésiste-réanimateur",
      targetCountries: '["Arabie saoudite", "Qatar"]',
      certifications: "",
      normalizedCertifications: '[{"name":"ACLS"},{"name":"ATLS"}]',
    });
    expect(result.score).toBe(70);
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

  it("prend en compte les langues, l’expérience et la disponibilité quand le brief les précise", () => {
    const result = computeBriefCandidateMatch({
      ...brief,
      requiredLanguages: "anglais, arabe",
      minimumYearsExperience: 5,
      availabilityNeeded: "immédiat",
    }, {
      specialty: "Médecin anesthésiste-réanimateur",
      targetCountries: '["Arabie saoudite"]',
      certifications: "ACLS, ATLS",
      normalizedCertifications: null,
      languages: '["anglais", "arabe"]',
      normalizedLanguages: null,
      yearsExperience: 8,
      availability: "Disponible immédiatement",
    });
    expect(result.score).toBe(100);
    expect(result.matchedLanguages).toEqual(["anglais", "arabe"]);
    expect(result.breakdown).toEqual({ specialty: 35, mobility: 15, certifications: 20, languages: 15, experience: 10, availability: 5 });
  });

  it("écarte du matching les certifications normalisées arrivées à expiration", () => {
    const result = computeBriefCandidateMatch(brief, {
      specialty: "Pédiatrie",
      targetCountries: null,
      certifications: null,
      normalizedCertifications: '[{"name":"ACLS","expiresAt":"2020-01-01"},{"name":"ATLS","expiresAt":"2099-12-31"}]',
    });

    expect(result.matchedCertifications).toEqual(["ATLS"]);
    expect(result.breakdown.certifications).toBe(10);
    expect(certificationDateIsCurrent("2020-01-01", new Date("2026-01-01T00:00:00Z"))).toBe(false);
  });
});
