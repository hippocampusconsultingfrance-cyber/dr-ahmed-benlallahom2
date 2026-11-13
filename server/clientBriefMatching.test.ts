import { describe, expect, it } from "vitest";
import { certificationDateIsCurrent } from "../shared/recruitmentFactOrigins";
import {
  certificationFacts,
  computeBriefCandidateMatch,
  languageFacts,
  type CertificationRow,
} from "./clientBriefMatching";

const extracted = (
  name: string,
  extra: Partial<CertificationRow> = {}
): CertificationRow => ({
  name,
  source: "extracted",
  confirmedAt: null,
  expiresAt: null,
  ...extra,
});
const confirmedAt = new Date("2026-10-20T09:00:00Z");

describe("matching mission–candidat", () => {
  const brief = {
    specialtyNeeded: "Anesthésie-réanimation",
    country: "Arabie saoudite",
    requiredCertifications: "ACLS, ATLS",
  };
  const anaesthetist = {
    specialty: "Médecin anesthésiste-réanimateur",
    targetCountries: '["Arabie saoudite", "Qatar"]',
  };

  it("valorise la spécialité et le pays, et ne compte une certification lue dans le CV qu’une fois confirmée par l’admin (IA-02)", () => {
    const unconfirmed = computeBriefCandidateMatch(brief, {
      ...anaesthetist,
      certificationFacts: certificationFacts(null, [
        extracted("ACLS"),
        extracted("ATLS"),
      ]),
    });
    expect(unconfirmed.score).toBe(50);
    expect(unconfirmed.breakdown.certifications).toBe(0);
    expect(unconfirmed.matchedCertifications).toEqual([]);
    expect(unconfirmed.certificationsToConfirm).toEqual(["ACLS", "ATLS"]);
    expect(unconfirmed.certifications).toEqual([
      {
        name: "ACLS",
        origins: ["extracted"],
        expiresAt: null,
        status: "to_confirm",
      },
      {
        name: "ATLS",
        origins: ["extracted"],
        expiresAt: null,
        status: "to_confirm",
      },
    ]);

    const oneConfirmed = computeBriefCandidateMatch(brief, {
      ...anaesthetist,
      certificationFacts: certificationFacts(null, [
        extracted("ACLS", { confirmedAt }),
        extracted("ATLS"),
      ]),
    });
    expect(oneConfirmed.score).toBe(60);
    expect(oneConfirmed.matchedCertifications).toEqual(["ACLS"]);
    expect(oneConfirmed.certifications).toEqual([
      {
        name: "ACLS",
        origins: ["extracted", "confirmed"],
        expiresAt: null,
        status: "matched",
      },
      {
        name: "ATLS",
        origins: ["extracted"],
        expiresAt: null,
        status: "to_confirm",
      },
    ]);
  });

  it("une licence lue seulement dans le CV (texte caché) apparaît « à confirmer » et ne rapporte rien", () => {
    const result = computeBriefCandidateMatch(
      {
        specialtyNeeded: "Anesthésie-réanimation",
        country: "Émirats arabes unis",
        requiredCertifications: "Licence DHA",
        requiredLanguages: "Anglais",
      },
      {
        specialty: "Anesthésie-réanimation",
        targetCountries: '["Émirats arabes unis"]',
        certificationFacts: certificationFacts("", [extracted("Licence DHA")]),
        languageFacts: languageFacts('["Anglais"]', []),
      }
    );
    expect(result.breakdown).toMatchObject({
      specialty: 35,
      mobility: 15,
      certifications: 0,
      languages: 15,
    });
    expect(result.certifications).toEqual([
      {
        name: "Licence DHA",
        origins: ["extracted"],
        expiresAt: null,
        status: "to_confirm",
      },
    ]);
    expect(result.languages).toEqual([
      { name: "Anglais", origins: ["declared"] },
    ]);
    // Every reason comes as a code, worded by the mission screen in the admin's language.
    expect(result.reasons).toEqual([
      { criterion: "specialty" },
      { criterion: "mobility" },
    ]);
  });

  it("compte une langue requise déclarée sous un autre nom, celui du formulaire, et réunit ses noms en une seule langue (IA-02)", () => {
    const mission = {
      specialtyNeeded: "Anesthésie-réanimation",
      country: "Émirats arabes unis",
      requiredCertifications: null,
      requiredLanguages: "Anglais, Arabe",
    };
    const candidate = {
      specialty: "Anesthésie-réanimation",
      targetCountries: '["Émirats arabes unis"]',
    };
    // The form records « French » and « Arabic », even from its French page.
    const arabicOnly = computeBriefCandidateMatch(mission, {
      ...candidate,
      languageFacts: languageFacts('["French","Arabic"]', []),
    });
    expect(arabicOnly.matchedLanguages).toEqual(["Arabe"]);
    expect(arabicOnly.breakdown.languages).toBe(8);
    expect(arabicOnly.languages).toEqual([
      { name: "Arabic", origins: ["declared"] },
    ]);

    // Declared « Arabic », read « العربية » and « English » in the CV: one Arabic, two origins.
    const both = computeBriefCandidateMatch(mission, {
      ...candidate,
      languageFacts: languageFacts('["Arabic"]', [
        { language: "العربية", source: "extracted" },
        { language: "English", source: "extracted" },
      ]),
    });
    expect(both.matchedLanguages).toEqual(["Anglais", "Arabe"]);
    expect(both.breakdown.languages).toBe(15);
    expect(both.languages).toEqual([
      { name: "English", origins: ["extracted"] },
      { name: "Arabic", origins: ["declared", "extracted"] },
    ]);

    // A language required in German or Chinese, or several in one term.
    expect(
      computeBriefCandidateMatch(
        { ...mission, requiredLanguages: '["Englisch", "阿拉伯语"]' },
        {
          ...candidate,
          languageFacts: languageFacts('["Anglais","Arabe"]', []),
        }
      ).breakdown.languages
    ).toBe(15);
    expect(
      computeBriefCandidateMatch(
        { ...mission, requiredLanguages: "Anglais et arabe" },
        {
          ...candidate,
          languageFacts: languageFacts('["English","Arabic"]', []),
        }
      ).matchedLanguages
    ).toEqual(["Anglais", "arabe"]);
    // Another language, under any name, earns nothing.
    const none = computeBriefCandidateMatch(mission, {
      ...candidate,
      languageFacts: languageFacts('["French","Deutsch"]', []),
    });
    expect(none.breakdown.languages).toBe(0);
    expect(none.languages).toEqual([]);
  });

  it("compte chaque langue d’une exigence « Anglais/Arabe » ou « anglais et arabe », par code, comme un profil et le filtre Langue (IA-02)", () => {
    const candidate = {
      specialty: "Anesthésie-réanimation",
      targetCountries: '["Émirats arabes unis"]',
    };
    const languagePoints = (requiredLanguages: string, declared: string[]) =>
      computeBriefCandidateMatch(
        {
          specialtyNeeded: "Anesthésie-réanimation",
          country: "Émirats arabes unis",
          requiredCertifications: null,
          requiredLanguages,
        },
        {
          ...candidate,
          languageFacts: languageFacts(JSON.stringify(declared), []),
        }
      ).breakdown.languages;
    for (const required of [
      "Anglais/Arabe",
      "anglais et arabe",
      "Englisch und Arabisch",
      "英语和阿拉伯语",
    ]) {
      // Half the points for one of the two languages, under any of its names; all of them for both.
      expect(languagePoints(required, ["Anglais"]), required).toBe(8);
      expect(languagePoints(required, ["English"]), required).toBe(8);
      expect(languagePoints(required, ["French", "Arabic"]), required).toBe(8);
      expect(languagePoints(required, ["English", "Arabic"]), required).toBe(
        15
      );
      expect(languagePoints(required, ["French"]), required).toBe(0);
    }
  });

  it("ne donne pas les points d’une langue à un mot qui commence comme elle, ni à un pays (IA-02)", () => {
    const candidate = {
      specialty: "Anesthésie-réanimation",
      targetCountries: '["Émirats arabes unis"]',
    };
    const match = (
      requiredLanguages: string,
      languages: string[],
      read: string[] = []
    ) =>
      computeBriefCandidateMatch(
        {
          specialtyNeeded: "Anesthésie-réanimation",
          country: "Émirats arabes unis",
          requiredCertifications: null,
          requiredLanguages,
        },
        {
          ...candidate,
          languageFacts: languageFacts(
            JSON.stringify(languages),
            read.map(language => ({ language, source: "extracted" as const }))
          ),
        }
      );
    expect(match("Polish", ["English (polished)"]).breakdown.languages).toBe(0);
    expect(match("Polonais", ["English (polished)"]).languages).toEqual([]);
    expect(match("German", ["Germany"]).breakdown.languages).toBe(0);
    expect(
      match("Allemand", ["French"], ["Deutschland"]).breakdown.languages
    ).toBe(0);
    expect(match("Grec", ["expérience en Grèce"]).breakdown.languages).toBe(0);
    // The language itself, declared or read in the CV, still scores.
    expect(match("German", ["Germany"], ["Deutsch"]).languages).toEqual([
      { name: "Deutsch", origins: ["extracted"] },
    ]);
    expect(match("Polish", ["Polski"]).breakdown.languages).toBe(15);
    // A language the table does not know: its words, whole, in the name or the name's in the requirement.
    expect(match("Wolof", ["Wolof (courant)"]).breakdown.languages).toBe(15);
    expect(match("Wolof courant", ["Wolof"]).breakdown.languages).toBe(15);
    expect(match("Wolof (courant)", ["Wolof"]).breakdown.languages).toBe(15);
    expect(match("Swahili courant", ["Swahili"]).breakdown.languages).toBe(15);
    expect(match("Créole haïtien", ["Créole"]).breakdown.languages).toBe(15);
    expect(
      match("Wolof courant", ["Wolofs", "Bambara courant"]).breakdown.languages
    ).toBe(0);
  });

  it("donne tous les points d’une exigence qui laisse le choix à l’une de ses langues, et ne coupe pas un nom chinois à 及 (IA-02)", () => {
    const candidate = {
      specialty: "Anesthésie-réanimation",
      targetCountries: '["Émirats arabes unis"]',
    };
    const languagePoints = (requiredLanguages: string, declared: string[]) =>
      computeBriefCandidateMatch(
        {
          specialtyNeeded: "Anesthésie-réanimation",
          country: "Émirats arabes unis",
          requiredCertifications: null,
          requiredLanguages,
        },
        {
          ...candidate,
          languageFacts: languageFacts(JSON.stringify(declared), []),
        }
      ).breakdown.languages;
    for (const required of [
      "English or Arabic",
      "Anglais ou arabe",
      "anglais et/ou arabe",
      "英语或阿拉伯语",
    ]) {
      expect(languagePoints(required, ["Arabic"]), required).toBe(15);
      expect(languagePoints(required, ["English"]), required).toBe(15);
      expect(languagePoints(required, ["French"]), required).toBe(0);
    }
    expect(languagePoints("Wolof ou anglais", ["Wolof"])).toBe(15);
    // 埃及阿拉伯语, Egyptian Arabic: one language, Arabic.
    expect(languagePoints("埃及阿拉伯语", ["Arabic"])).toBe(15);
  });

  it("garde avec sa langue ce que le texte de la mission écrit après une virgule ou un point-virgule quand il ne nomme aucune langue (IA02-R5-SEPARATEUR-QUALIFICATIFS)", () => {
    const candidate = {
      specialty: "Anesthésie-réanimation",
      targetCountries: '["Émirats arabes unis"]',
    };
    const match = (requiredLanguages: string, declared: string[]) =>
      computeBriefCandidateMatch(
        {
          specialtyNeeded: "Anesthésie-réanimation",
          country: "Émirats arabes unis",
          requiredCertifications: null,
          requiredLanguages,
        },
        {
          ...candidate,
          languageFacts: languageFacts(JSON.stringify(declared), []),
        }
      );
    // Before: « Anglais – lu », « écrit » and « parlé », three requirements, one met (5 language points of 15).
    for (const required of [
      "Anglais – lu, écrit, parlé",
      "Anglais – parlé; écrit",
      "English – UAE, Qatar",
      "Anglais – C1, C2",
      "Anglais – parlé et écrit",
    ]) {
      expect(match(required, ["English"]).breakdown.languages, required).toBe(
        15
      );
      expect(match(required, ["English"]).matchedLanguages, required).toEqual([
        required.replace(";", ","),
      ]);
    }
    // Two languages are still two requirements, with what qualifies each.
    expect(match("Anglais, arabe", ["English"]).breakdown.languages).toBe(8);
    expect(
      match("Anglais – obligatoire, Arabe – souhaité", ["English", "Arabic"])
        .matchedLanguages
    ).toEqual(["Anglais – obligatoire", "Arabe – souhaité"]);
    expect(
      match("Anglais, Wolof serait un atout", ["English"]).breakdown.languages
    ).toBe(8);
  });

  it("garde comme exigence un nom de langue qu’aucune liste ne connaît, écrit après une virgule dans le texte de la mission (IA02-R5-LISTE-NOM-INCONNU)", () => {
    const candidate = {
      specialty: "Anesthésie-réanimation",
      targetCountries: '["Émirats arabes unis"]',
    };
    const match = (requiredLanguages: string, declared: string[]) =>
      computeBriefCandidateMatch(
        {
          specialtyNeeded: "Anesthésie-réanimation",
          country: "Émirats arabes unis",
          requiredCertifications: null,
          requiredLanguages,
        },
        {
          ...candidate,
          languageFacts: languageFacts(JSON.stringify(declared), []),
        }
      );
    // Before (c97413e): « Français, Darija » was one requirement met by French alone (15 language points of 15).
    expect(match("Français, Darija", ["French"]).breakdown.languages).toBe(8);
    expect(match("Français, Darija", ["French"]).matchedLanguages).toEqual([
      "Français",
    ]);
    expect(
      match("Français, Darija", ["French", "Darija"]).breakdown.languages
    ).toBe(15);
    expect(
      match("Deutsch, Arabisch, Somalisch, Tigrinisch", ["German", "Arabic"])
        .breakdown.languages
    ).toBe(8);
    expect(match("英语，阿语", ["English"]).breakdown.languages).toBe(8);
    expect(match("英语，阿语", ["English", "Arabic"]).breakdown.languages).toBe(
      15
    );
    // The places a dash opened, written after a comma, still qualify the language: one requirement.
    expect(
      match("Anglais – Riyad, Dubaï", ["English"]).breakdown.languages
    ).toBe(15);
  });

  it("garde comme exigence une langue écrite avec d’autres mots après les lieux qu’un tiret ouvre (IA02-R6-LANGUE-APRES-LIEUX)", () => {
    const candidate = {
      specialty: "Anesthésie-réanimation",
      targetCountries: '["Émirats arabes unis"]',
    };
    const match = (requiredLanguages: string, declared: string[]) =>
      computeBriefCandidateMatch(
        {
          specialtyNeeded: "Anesthésie-réanimation",
          country: "Émirats arabes unis",
          requiredCertifications: null,
          requiredLanguages,
        },
        {
          ...candidate,
          languageFacts: languageFacts(JSON.stringify(declared), []),
        }
      );
    // Before (b1544cf): the créole and the swahili went on with the places, and French or English alone gave 15 language points of 15.
    expect(
      match("Français – Martinique, créole martiniquais", ["French"]).breakdown
        .languages
    ).toBe(8);
    expect(
      match("Français – Martinique, créole martiniquais", [
        "French",
        "Créole martiniquais",
      ]).breakdown.languages
    ).toBe(15);
    expect(
      match("Anglais – Dubaï, swahili pour les patients", ["English"]).breakdown
        .languages
    ).toBe(8);
    expect(
      match("Anglais – Dubaï, swahili pour les patients", [
        "English",
        "Swahili",
      ]).breakdown.languages
    ).toBe(15);
  });

  it("une certification déclarée par le candidat compte, elle aussi, une fois confirmée", () => {
    const declaredOnly = computeBriefCandidateMatch(brief, {
      ...anaesthetist,
      certificationFacts: certificationFacts("ACLS, ATLS", []),
    });
    expect(declaredOnly.breakdown.certifications).toBe(0);
    expect(declaredOnly.certificationsToConfirm).toEqual(["ACLS", "ATLS"]);
    const confirmed = computeBriefCandidateMatch(brief, {
      ...anaesthetist,
      certificationFacts: certificationFacts("ACLS, ATLS", [
        { name: "acls", source: "declared", confirmedAt, expiresAt: null },
        { name: "ATLS", source: "declared", confirmedAt, expiresAt: null },
      ]),
    });
    expect(confirmed.breakdown.certifications).toBe(20);
    expect(confirmed.certifications).toEqual([
      {
        name: "ACLS",
        origins: ["declared", "confirmed"],
        expiresAt: null,
        status: "matched",
      },
      {
        name: "ATLS",
        origins: ["declared", "confirmed"],
        expiresAt: null,
        status: "matched",
      },
    ]);
  });

  it("ne déduit rien lorsqu’aucune information professionnelle pertinente n’est présente", () => {
    const result = computeBriefCandidateMatch(brief, {
      specialty: "Pédiatrie",
      targetCountries: '["France"]',
      certificationFacts: certificationFacts(null, []),
    });
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
    expect(result.certifications).toEqual([]);
  });

  it("prend en compte les langues, l’expérience et la disponibilité quand le brief les précise, avec l’origine de chaque langue", () => {
    const result = computeBriefCandidateMatch(
      {
        ...brief,
        requiredLanguages: "anglais, arabe",
        minimumYearsExperience: 5,
        availabilityNeeded: "immédiat",
      },
      {
        ...anaesthetist,
        certificationFacts: certificationFacts("ACLS, ATLS", [
          extracted("ACLS", { confirmedAt }),
          { name: "ATLS", source: "declared", confirmedAt, expiresAt: null },
        ]),
        languageFacts: languageFacts('["anglais"]', [
          { language: "Arabe", source: "extracted" },
          { language: "Anglais", source: "extracted" },
        ]),
        yearsExperience: 8,
        availability: "Disponible immédiatement",
      }
    );
    expect(result.score).toBe(100);
    expect(result.matchedLanguages).toEqual(["anglais", "arabe"]);
    expect(result.breakdown).toEqual({
      specialty: 35,
      mobility: 15,
      certifications: 20,
      languages: 15,
      experience: 10,
      availability: 5,
    });
    expect(result.languages).toEqual([
      { name: "anglais", origins: ["declared", "extracted"] },
      { name: "Arabe", origins: ["extracted"] },
    ]);
    expect(result.reasons).toEqual([
      { criterion: "specialty" },
      { criterion: "mobility" },
      { criterion: "experience", years: 8, minimum: 5 },
      { criterion: "availability" },
    ]);
  });

  it("écarte du matching les certifications arrivées à expiration, même confirmées, et les retient « expirées » avec leur date", () => {
    const result = computeBriefCandidateMatch(brief, {
      specialty: "Pédiatrie",
      targetCountries: null,
      certificationFacts: certificationFacts(null, [
        extracted("ACLS", { expiresAt: "2020-01-01", confirmedAt }),
        extracted("ATLS", { expiresAt: "2099-12-31", confirmedAt }),
      ]),
    });

    expect(result.matchedCertifications).toEqual(["ATLS"]);
    expect(result.breakdown.certifications).toBe(10);
    expect(result.certifications).toEqual([
      {
        name: "ACLS",
        origins: ["extracted", "confirmed"],
        expiresAt: "2020-01-01",
        status: "expired",
      },
      {
        name: "ATLS",
        origins: ["extracted", "confirmed"],
        expiresAt: "2099-12-31",
        status: "matched",
      },
    ]);
    expect(
      certificationDateIsCurrent("2020-01-01", new Date("2026-01-01T00:00:00Z"))
    ).toBe(false);
  });

  it("retient « expirée » une certification déclarée sans date dont le CV donne une date passée, et la compte une fois son renouvellement confirmé (IA-02)", () => {
    const aclsBrief = { ...brief, requiredCertifications: "ACLS" };
    // « PALS, ACLS » declared in the form; the AI read ACLS until 2023-05 in the CV.
    const expired = computeBriefCandidateMatch(aclsBrief, {
      ...anaesthetist,
      certificationFacts: certificationFacts("PALS, ACLS", [
        extracted("ACLS", { expiresAt: "2023-05" }),
      ]),
    });
    expect(expired.breakdown.certifications).toBe(0);
    expect(expired.certificationsToConfirm).toEqual([]);
    expect(expired.certifications).toEqual([
      {
        name: "ACLS",
        origins: ["declared", "extracted"],
        expiresAt: "2023-05",
        status: "expired",
      },
    ]);
    // Confirmed as it is: still expired, and still said.
    expect(
      computeBriefCandidateMatch(aclsBrief, {
        ...anaesthetist,
        certificationFacts: certificationFacts("PALS, ACLS", [
          extracted("ACLS", { expiresAt: "2023-05", confirmedAt }),
        ]),
      }).certifications[0]!.status
    ).toBe("expired");
    // Its renewal confirmed, with a new expiry or none, in a row of its own
    // beside the one read in the CV: it counts.
    for (const expiresAt of ["2099-06-30", null]) {
      const rows: CertificationRow[] = [
        extracted("ACLS", { expiresAt: "2023-05", confirmedAt }),
        { name: "ACLS", source: "renewed", confirmedAt, expiresAt },
      ];
      const renewed = computeBriefCandidateMatch(aclsBrief, {
        ...anaesthetist,
        certificationFacts: certificationFacts("PALS, ACLS", rows),
      });
      expect(renewed.breakdown.certifications).toBe(20);
      expect(renewed.certifications).toEqual([
        {
          name: "ACLS",
          origins: ["declared", "extracted", "confirmed"],
          expiresAt,
          status: "matched",
        },
      ]);
    }
    // The renewal adds no origin but the admin's: a certification read in the CV only is not said declared.
    expect(
      certificationFacts(null, [
        extracted("ACLS", { expiresAt: "2023-05", confirmedAt }),
        {
          name: "ACLS",
          source: "renewed",
          confirmedAt,
          expiresAt: "2099-06-30",
        },
      ])
    ).toEqual([
      {
        name: "ACLS",
        origins: ["extracted", "confirmed"],
        expiresAt: "2099-06-30",
      },
    ]);
  });

  it("date une certification déclarée et confirmée d’après le CV, qui la dit expirée : seul un renouvellement la rend courante (IA-02)", () => {
    const aclsBrief = { ...brief, requiredCertifications: "ACLS" };
    const declaredConfirmation: CertificationRow = {
      name: "ACLS",
      source: "declared",
      confirmedAt,
      expiresAt: null,
    };
    // Confirmed on the form's word, then read in the CV until 2023-05: the confirmation, undated, does not make it current.
    const facts = certificationFacts("ACLS", [
      declaredConfirmation,
      extracted("ACLS", { expiresAt: "2023-05" }),
    ]);
    expect(facts).toEqual([
      {
        name: "ACLS",
        origins: ["declared", "confirmed", "extracted"],
        expiresAt: "2023-05",
      },
    ]);
    expect(
      computeBriefCandidateMatch(aclsBrief, {
        ...anaesthetist,
        certificationFacts: facts,
      })
    ).toMatchObject({
      breakdown: { certifications: 0 },
      certifications: [{ name: "ACLS", status: "expired" }],
    });
    // A CV that gives a later date, or a renewal, does.
    expect(
      certificationFacts("ACLS", [
        declaredConfirmation,
        extracted("ACLS", { expiresAt: "2099-05" }),
      ])[0]!.expiresAt
    ).toBe("2099-05");
    expect(
      certificationFacts("ACLS", [
        declaredConfirmation,
        extracted("ACLS", { expiresAt: "2023-05", confirmedAt }),
        {
          name: "ACLS",
          source: "renewed",
          confirmedAt,
          expiresAt: "2099-06-30",
        },
      ])[0]!.expiresAt
    ).toBe("2099-06-30");
    // Declared only, it has no date.
    expect(
      certificationFacts("ACLS", [declaredConfirmation])[0]!.expiresAt
    ).toBeNull();
  });

  it("dit expirée une certification lue dans le CV à côté d’une autre du même terme, déclarée sous un autre nom (IA-02)", () => {
    const aclsBrief = { ...brief, requiredCertifications: "ACLS" };
    const rows = [extracted("ACLS", { expiresAt: "2023-05" })];
    // « ACLS AHA » declared, « ACLS » read in the CV until 2023-05: both meet the term.
    expect(
      computeBriefCandidateMatch(aclsBrief, {
        ...anaesthetist,
        certificationFacts: certificationFacts("ACLS AHA", rows),
      }).certifications
    ).toEqual([
      {
        name: "ACLS AHA",
        origins: ["declared"],
        expiresAt: null,
        status: "to_confirm",
      },
      {
        name: "ACLS",
        origins: ["extracted"],
        expiresAt: "2023-05",
        status: "expired",
      },
    ]);
    // Confirmed on the admin's check of the certificate, it counts, and the CV's expired reading is still said beside it.
    const confirmed = computeBriefCandidateMatch(aclsBrief, {
      ...anaesthetist,
      certificationFacts: certificationFacts("ACLS AHA", [
        ...rows,
        { name: "ACLS AHA", source: "declared", confirmedAt, expiresAt: null },
      ]),
    });
    expect(confirmed.breakdown.certifications).toBe(20);
    expect(confirmed.certifications).toEqual([
      {
        name: "ACLS AHA",
        origins: ["declared", "confirmed"],
        expiresAt: null,
        status: "matched",
      },
      {
        name: "ACLS",
        origins: ["extracted"],
        expiresAt: "2023-05",
        status: "expired",
      },
    ]);
  });

  it("une certification renouvelée dans le CV compte jusqu’à sa dernière date d’expiration", () => {
    const blsBrief = { ...brief, requiredCertifications: "BLS" };
    const renewed = certificationFacts(null, [
      extracted("BLS", { expiresAt: "2019-06", confirmedAt }),
      extracted("BLS", { expiresAt: "2099-06", confirmedAt }),
    ]);
    expect(renewed).toEqual([
      {
        name: "BLS",
        origins: ["extracted", "confirmed"],
        expiresAt: "2099-06",
      },
    ]);
    expect(
      computeBriefCandidateMatch(blsBrief, {
        ...anaesthetist,
        certificationFacts: renewed,
      }).breakdown.certifications
    ).toBe(20);
    // In either order, and a row without a date (current) wins over a dated one.
    expect(
      certificationFacts(null, [
        extracted("BLS", { expiresAt: "2099" }),
        extracted("bls", { expiresAt: "2019-06-30" }),
      ])[0]!.expiresAt
    ).toBe("2099");
    expect(
      certificationFacts(null, [
        extracted("BLS", { expiresAt: "2019-06" }),
        extracted("BLS"),
      ])[0]!.expiresAt
    ).toBeNull();
    // Once confirmed, only the confirmed rows date it: those alone earn points.
    const confirmedExpired = certificationFacts(null, [
      extracted("BLS", { expiresAt: "2019-06", confirmedAt }),
      extracted("BLS", { expiresAt: "2099-06" }),
    ]);
    expect(confirmedExpired[0]!.expiresAt).toBe("2019-06");
    expect(
      computeBriefCandidateMatch(blsBrief, {
        ...anaesthetist,
        certificationFacts: confirmedExpired,
      }).breakdown.certifications
    ).toBe(0);
  });

  it("réunit sous un seul nom ce que le candidat a déclaré, ce que l’IA a lu et ce que l’admin a confirmé", () => {
    expect(
      certificationFacts("Licence DHA; BLS; ACLS", [
        extracted("licence dha", { expiresAt: "2028-05", confirmedAt }),
        { name: "bls", source: "declared", confirmedAt, expiresAt: null },
      ])
    ).toEqual([
      {
        name: "Licence DHA",
        origins: ["declared", "extracted", "confirmed"],
        expiresAt: "2028-05",
      },
      { name: "BLS", origins: ["declared", "confirmed"], expiresAt: null },
      { name: "ACLS", origins: ["declared"], expiresAt: null },
    ]);
    // A declared term longer than a stored row (180 characters) still meets its confirmed row.
    const longName = `Diplôme ${"universitaire ".repeat(20)}`.trim();
    expect(
      certificationFacts(longName, [
        {
          name: longName.slice(0, 180),
          source: "declared",
          confirmedAt,
          expiresAt: null,
        },
      ])
    ).toEqual([
      { name: longName, origins: ["declared", "confirmed"], expiresAt: null },
    ]);
    expect(
      languageFacts('["Français","English"]', [
        { language: "français", source: "extracted" },
      ])
    ).toEqual([
      { name: "Français", origins: ["declared", "extracted"] },
      { name: "English", origins: ["declared"] },
    ]);
  });
});
