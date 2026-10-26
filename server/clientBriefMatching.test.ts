import { describe, expect, it } from "vitest";
import { certificationDateIsCurrent } from "../shared/recruitmentFactOrigins";
import { certificationFacts, computeBriefCandidateMatch, languageFacts, type CertificationRow } from "./clientBriefMatching";

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
    expect(unconfirmed.certifications).toEqual([
      { name: "ACLS", origins: ["extracted"], expiresAt: null, status: "to_confirm" },
      { name: "ATLS", origins: ["extracted"], expiresAt: null, status: "to_confirm" },
    ]);

    const oneConfirmed = computeBriefCandidateMatch(brief, { ...anaesthetist, certificationFacts: certificationFacts(null, [extracted("ACLS", { confirmedAt }), extracted("ATLS")]) });
    expect(oneConfirmed.score).toBe(60);
    expect(oneConfirmed.matchedCertifications).toEqual(["ACLS"]);
    expect(oneConfirmed.certifications).toEqual([
      { name: "ACLS", origins: ["extracted", "confirmed"], expiresAt: null, status: "matched" },
      { name: "ATLS", origins: ["extracted"], expiresAt: null, status: "to_confirm" },
    ]);
  });

  it("une licence lue seulement dans le CV (texte caché) apparaît « à confirmer » et ne rapporte rien", () => {
    const result = computeBriefCandidateMatch({ specialtyNeeded: "Anesthésie-réanimation", country: "Émirats arabes unis", requiredCertifications: "Licence DHA", requiredLanguages: "Anglais" }, {
      specialty: "Anesthésie-réanimation",
      targetCountries: '["Émirats arabes unis"]',
      certificationFacts: certificationFacts("", [extracted("Licence DHA")]),
      languageFacts: languageFacts('["Anglais"]', []),
    });
    expect(result.breakdown).toMatchObject({ specialty: 35, mobility: 15, certifications: 0, languages: 15 });
    expect(result.certifications).toEqual([{ name: "Licence DHA", origins: ["extracted"], expiresAt: null, status: "to_confirm" }]);
    expect(result.languages).toEqual([{ name: "Anglais", origins: ["declared"] }]);
    // Certifications and languages come as codes, worded by the mission screen in the admin's language.
    expect(result.reasons).toEqual(["spécialité compatible", "mobilité vers le pays de mission déclarée"]);
  });

  it("une certification déclarée par le candidat compte, elle aussi, une fois confirmée", () => {
    const declaredOnly = computeBriefCandidateMatch(brief, { ...anaesthetist, certificationFacts: certificationFacts("ACLS, ATLS", []) });
    expect(declaredOnly.breakdown.certifications).toBe(0);
    expect(declaredOnly.certificationsToConfirm).toEqual(["ACLS", "ATLS"]);
    const confirmed = computeBriefCandidateMatch(brief, { ...anaesthetist, certificationFacts: certificationFacts("ACLS, ATLS", [{ name: "acls", source: "declared", confirmedAt, expiresAt: null }, { name: "ATLS", source: "declared", confirmedAt, expiresAt: null }]) });
    expect(confirmed.breakdown.certifications).toBe(20);
    expect(confirmed.certifications).toEqual([
      { name: "ACLS", origins: ["declared", "confirmed"], expiresAt: null, status: "matched" },
      { name: "ATLS", origins: ["declared", "confirmed"], expiresAt: null, status: "matched" },
    ]);
  });

  it("ne déduit rien lorsqu’aucune information professionnelle pertinente n’est présente", () => {
    const result = computeBriefCandidateMatch(brief, { specialty: "Pédiatrie", targetCountries: '["France"]', certificationFacts: certificationFacts(null, []) });
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
    expect(result.certifications).toEqual([]);
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
    expect(result.languages).toEqual([
      { name: "anglais", origins: ["declared", "extracted"] },
      { name: "Arabe", origins: ["extracted"] },
    ]);
    expect(result.reasons).toEqual([
      "spécialité compatible",
      "mobilité vers le pays de mission déclarée",
      "expérience déclarée : 8 an(s) pour un minimum de 5",
      "disponibilité compatible avec le besoin exprimé",
    ]);
  });

  it("écarte du matching les certifications arrivées à expiration, même confirmées, et les retient « expirées » avec leur date", () => {
    const result = computeBriefCandidateMatch(brief, {
      specialty: "Pédiatrie",
      targetCountries: null,
      certificationFacts: certificationFacts(null, [extracted("ACLS", { expiresAt: "2020-01-01", confirmedAt }), extracted("ATLS", { expiresAt: "2099-12-31", confirmedAt })]),
    });

    expect(result.matchedCertifications).toEqual(["ATLS"]);
    expect(result.breakdown.certifications).toBe(10);
    expect(result.certifications).toEqual([
      { name: "ACLS", origins: ["extracted", "confirmed"], expiresAt: "2020-01-01", status: "expired" },
      { name: "ATLS", origins: ["extracted", "confirmed"], expiresAt: "2099-12-31", status: "matched" },
    ]);
    expect(certificationDateIsCurrent("2020-01-01", new Date("2026-01-01T00:00:00Z"))).toBe(false);
  });

  it("retient « expirée » une certification déclarée sans date dont le CV donne une date passée, et la compte une fois son renouvellement confirmé (IA-02)", () => {
    const aclsBrief = { ...brief, requiredCertifications: "ACLS" };
    // « PALS, ACLS » declared in the form; the AI read ACLS until 2023-05 in the CV.
    const expired = computeBriefCandidateMatch(aclsBrief, { ...anaesthetist, certificationFacts: certificationFacts("PALS, ACLS", [extracted("ACLS", { expiresAt: "2023-05" })]) });
    expect(expired.breakdown.certifications).toBe(0);
    expect(expired.certificationsToConfirm).toEqual([]);
    expect(expired.certifications).toEqual([{ name: "ACLS", origins: ["declared", "extracted"], expiresAt: "2023-05", status: "expired" }]);
    // Confirmed as it is: still expired, and still said.
    expect(computeBriefCandidateMatch(aclsBrief, { ...anaesthetist, certificationFacts: certificationFacts("PALS, ACLS", [extracted("ACLS", { expiresAt: "2023-05", confirmedAt })]) }).certifications[0]!.status).toBe("expired");
    // Its renewal confirmed, with a new expiry or none: it counts.
    for (const expiresAt of ["2099-06-30", null]) {
      const renewed = computeBriefCandidateMatch(aclsBrief, { ...anaesthetist, certificationFacts: certificationFacts("PALS, ACLS", [extracted("ACLS", { expiresAt, confirmedAt })]) });
      expect(renewed.breakdown.certifications).toBe(20);
      expect(renewed.certifications).toEqual([{ name: "ACLS", origins: ["declared", "extracted", "confirmed"], expiresAt, status: "matched" }]);
    }
  });

  it("une certification renouvelée dans le CV compte jusqu’à sa dernière date d’expiration", () => {
    const blsBrief = { ...brief, requiredCertifications: "BLS" };
    const renewed = certificationFacts(null, [extracted("BLS", { expiresAt: "2019-06", confirmedAt }), extracted("BLS", { expiresAt: "2099-06", confirmedAt })]);
    expect(renewed).toEqual([{ name: "BLS", origins: ["extracted", "confirmed"], expiresAt: "2099-06" }]);
    expect(computeBriefCandidateMatch(blsBrief, { ...anaesthetist, certificationFacts: renewed }).breakdown.certifications).toBe(20);
    // In either order, and a row without a date (current) wins over a dated one.
    expect(certificationFacts(null, [extracted("BLS", { expiresAt: "2099" }), extracted("bls", { expiresAt: "2019-06-30" })])[0]!.expiresAt).toBe("2099");
    expect(certificationFacts(null, [extracted("BLS", { expiresAt: "2019-06" }), extracted("BLS")])[0]!.expiresAt).toBeNull();
    // Once confirmed, only the confirmed rows date it: those alone earn points.
    const confirmedExpired = certificationFacts(null, [extracted("BLS", { expiresAt: "2019-06", confirmedAt }), extracted("BLS", { expiresAt: "2099-06" })]);
    expect(confirmedExpired[0]!.expiresAt).toBe("2019-06");
    expect(computeBriefCandidateMatch(blsBrief, { ...anaesthetist, certificationFacts: confirmedExpired }).breakdown.certifications).toBe(0);
  });

  it("réunit sous un seul nom ce que le candidat a déclaré, ce que l’IA a lu et ce que l’admin a confirmé", () => {
    expect(certificationFacts("Licence DHA; BLS; ACLS", [extracted("licence dha", { expiresAt: "2028-05", confirmedAt }), { name: "bls", source: "declared", confirmedAt, expiresAt: null }])).toEqual([
      { name: "Licence DHA", origins: ["declared", "extracted", "confirmed"], expiresAt: "2028-05" },
      { name: "BLS", origins: ["declared", "confirmed"], expiresAt: null },
      { name: "ACLS", origins: ["declared"], expiresAt: null },
    ]);
    // A declared term longer than a stored row (180 characters) still meets its confirmed row.
    const longName = `Diplôme ${"universitaire ".repeat(20)}`.trim();
    expect(certificationFacts(longName, [{ name: longName.slice(0, 180), source: "declared", confirmedAt, expiresAt: null }])).toEqual([{ name: longName, origins: ["declared", "confirmed"], expiresAt: null }]);
    expect(languageFacts('["Français","English"]', [{ language: "français", source: "extracted" }])).toEqual([
      { name: "Français", origins: ["declared", "extracted"] },
      { name: "English", origins: ["declared"] },
    ]);
  });
});
