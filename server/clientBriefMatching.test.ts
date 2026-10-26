import { describe, expect, it } from "vitest";
import { certificationDateIsCurrent, certificationFacts, computeBriefCandidateMatch, languageFacts, type CertificationRow } from "./clientBriefMatching";

const extracted = (name: string, extra: Partial<CertificationRow> = {}): CertificationRow => ({ name, source: "extracted", confirmedAt: null, expiresAt: null, ...extra });
const confirmedAt = new Date("2026-10-20T09:00:00Z");

describe("matching mission–candidat", () => {
  const brief = { specialtyNeeded: "Anesthésie-réanimation", country: "Arabie saoudite", requiredCertifications: "ACLS, ATLS" };
  const anaesthetist = { specialty: "Médecin anesthésiste-réanimateur", targetCountries: '["Arabie saoudite", "Qatar"]' };

  it("valorise la spécialité et le pays, et ne compte une certification lue dans le CV qu’une fois confirmée par l’admin (IA-02)", () => {
    const unconfirmed = computeBriefCandidateMatch(brief, { ...anaesthetist, certificationFacts: certificationFacts(null, [extracted("ACLS"), extracted("ATLS")]) });
    expect(unconfirmed.score).toBe(50);
    expect(unconfirmed.breakdown.certifications).toBe(0);
    expect(unconfirmed.matchedCertifications).toEqual([]);
    expect(unconfirmed.certificationsToConfirm).toEqual(["ACLS", "ATLS"]);
    expect(unconfirmed.reasons).toContain("certifications à confirmer : ACLS (extraite du CV par l’IA) ; ATLS (extraite du CV par l’IA) — aucun point tant que l’admin ne les a pas confirmées");

    const oneConfirmed = computeBriefCandidateMatch(brief, { ...anaesthetist, certificationFacts: certificationFacts(null, [extracted("ACLS", { confirmedAt }), extracted("ATLS")]) });
    expect(oneConfirmed.score).toBe(60);
    expect(oneConfirmed.matchedCertifications).toEqual(["ACLS"]);
    expect(oneConfirmed.reasons).toContain("certifications correspondantes : ACLS (extraite du CV par l’IA, confirmée par l’admin)");
    expect(oneConfirmed.reasons).toContain("certification à confirmer : ATLS (extraite du CV par l’IA) — aucun point tant que l’admin ne l’a pas confirmée");
  });

  it("une licence lue seulement dans le CV (texte caché) apparaît « à confirmer » et ne rapporte rien", () => {
    const result = computeBriefCandidateMatch({ specialtyNeeded: "Anesthésie-réanimation", country: "Émirats arabes unis", requiredCertifications: "Licence DHA", requiredLanguages: "Anglais" }, {
      specialty: "Anesthésie-réanimation",
      targetCountries: '["Émirats arabes unis"]',
      certificationFacts: certificationFacts("", [extracted("Licence DHA")]),
      languageFacts: languageFacts('["Anglais"]', []),
    });
    expect(result.breakdown).toMatchObject({ specialty: 35, mobility: 15, certifications: 0, languages: 15 });
    expect(result.certifications).toEqual([{ name: "Licence DHA", origins: ["extracted"], expiresAt: null }]);
    expect(result.reasons).toEqual([
      "spécialité compatible",
      "mobilité vers le pays de mission déclarée",
      "certification à confirmer : Licence DHA (extraite du CV par l’IA) — aucun point tant que l’admin ne l’a pas confirmée",
      "langues correspondantes : Anglais (déclarée par le candidat)",
    ]);
  });

  it("une certification déclarée par le candidat compte, elle aussi, une fois confirmée", () => {
    const declaredOnly = computeBriefCandidateMatch(brief, { ...anaesthetist, certificationFacts: certificationFacts("ACLS, ATLS", []) });
    expect(declaredOnly.breakdown.certifications).toBe(0);
    expect(declaredOnly.certificationsToConfirm).toEqual(["ACLS", "ATLS"]);
    const confirmed = computeBriefCandidateMatch(brief, { ...anaesthetist, certificationFacts: certificationFacts("ACLS, ATLS", [{ name: "acls", source: "declared", confirmedAt, expiresAt: null }, { name: "ATLS", source: "declared", confirmedAt, expiresAt: null }]) });
    expect(confirmed.breakdown.certifications).toBe(20);
    expect(confirmed.reasons).toContain("certifications correspondantes : ACLS (déclarée par le candidat, confirmée par l’admin), ATLS (déclarée par le candidat, confirmée par l’admin)");
  });

  it("ne déduit rien lorsqu’aucune information professionnelle pertinente n’est présente", () => {
    const result = computeBriefCandidateMatch(brief, { specialty: "Pédiatrie", targetCountries: '["France"]', certificationFacts: certificationFacts(null, []) });
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("prend en compte les langues, l’expérience et la disponibilité quand le brief les précise, avec l’origine de chaque langue", () => {
    const result = computeBriefCandidateMatch({
      ...brief,
      requiredLanguages: "anglais, arabe",
      minimumYearsExperience: 5,
      availabilityNeeded: "immédiat",
    }, {
      ...anaesthetist,
      certificationFacts: certificationFacts("ACLS, ATLS", [extracted("ACLS", { confirmedAt }), { name: "ATLS", source: "declared", confirmedAt, expiresAt: null }]),
      languageFacts: languageFacts('["anglais"]', [{ language: "Arabe", source: "extracted" }, { language: "Anglais", source: "extracted" }]),
      yearsExperience: 8,
      availability: "Disponible immédiatement",
    });
    expect(result.score).toBe(100);
    expect(result.matchedLanguages).toEqual(["anglais", "arabe"]);
    expect(result.breakdown).toEqual({ specialty: 35, mobility: 15, certifications: 20, languages: 15, experience: 10, availability: 5 });
    expect(result.reasons).toContain("langues correspondantes : anglais (déclarée par le candidat, extraite du CV par l’IA), Arabe (extraite du CV par l’IA)");
  });

  it("écarte du matching les certifications arrivées à expiration, même confirmées", () => {
    const result = computeBriefCandidateMatch(brief, {
      specialty: "Pédiatrie",
      targetCountries: null,
      certificationFacts: certificationFacts(null, [extracted("ACLS", { expiresAt: "2020-01-01", confirmedAt }), extracted("ATLS", { expiresAt: "2099-12-31", confirmedAt })]),
    });

    expect(result.matchedCertifications).toEqual(["ATLS"]);
    expect(result.breakdown.certifications).toBe(10);
    expect(certificationDateIsCurrent("2020-01-01", new Date("2026-01-01T00:00:00Z"))).toBe(false);
  });

  it("réunit sous un seul nom ce que le candidat a déclaré, ce que l’IA a lu et ce que l’admin a confirmé", () => {
    expect(certificationFacts("Licence DHA; BLS", [extracted("licence dha", { expiresAt: "2028-05" }), { name: "Licence DHA", source: "declared", confirmedAt, expiresAt: null }])).toEqual([
      { name: "Licence DHA", origins: ["declared", "extracted", "confirmed"], expiresAt: "2028-05" },
      { name: "BLS", origins: ["declared"], expiresAt: null },
    ]);
    expect(languageFacts('["Français","English"]', [{ language: "français", source: "extracted" }])).toEqual([
      { name: "Français", origins: ["declared", "extracted"] },
      { name: "English", origins: ["declared"] },
    ]);
  });
});
