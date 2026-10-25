import { describe, expect, it } from "vitest";
import { normalizeRecruitmentAnalysis } from "./recruitmentAnalysis";

type AnalysisInput = Parameters<typeof normalizeRecruitmentAnalysis>[0];

/** What a CV says in one language: the title, the specialty and one skill, as written by the candidate. */
type CvWording = { title: string; specialty: string; skill: string };

/** Text extracted from a one-page CV, per language, and the quotes the AI gives for it. */
const cvLayouts = {
  "français": (cv: CvWording) => ({
    lines: [cv.title, `Spécialité : ${cv.specialty}`, `CHU de Lyon, ${cv.title}, 2015-2024`, `Compétences : ${cv.skill}, enseignement`, "Langues : français, anglais"],
    organization: "CHU de Lyon",
    language: "français",
  }),
  "anglais britannique": (cv: CvWording) => ({
    lines: [cv.title, `Specialty: ${cv.specialty}`, `Royal London Hospital, ${cv.title}, 2015-2024`, `Skills: ${cv.skill}, clinical teaching`, "Languages: English, French"],
    organization: "Royal London Hospital",
    language: "English",
  }),
  "allemand": (cv: CvWording) => ({
    lines: [cv.title, `Fachgebiet: ${cv.specialty}`, `Charité Berlin, ${cv.title}, 2015-2024`, `Kenntnisse: ${cv.skill}, Lehre`, "Sprachen: Deutsch, Englisch"],
    organization: "Charité Berlin",
    language: "Deutsch",
  }),
  "arabe": (cv: CvWording) => ({
    lines: [cv.title, `التخصص: ${cv.specialty}`, `${cv.title}، مستشفى الملك فيصل التخصصي، الرياض، 2015-2024`, `المهارات: ${cv.skill}، التدريس`, "اللغات: العربية، الإنجليزية"],
    organization: "مستشفى الملك فيصل التخصصي",
    language: "العربية",
  }),
  "chinois": (cv: CvWording) => ({
    lines: [cv.title, `专业：${cv.specialty}`, `2015年至2024年，北京协和医院，${cv.title}`, `技能：${cv.skill}、教学`, "语言：中文、英语"],
    organization: "北京协和医院",
    language: "中文",
  }),
} satisfies Record<string, (cv: CvWording) => { lines: string[]; organization: string; language: string }>;
type CvLanguage = keyof typeof cvLayouts;

/** The same CV for each declared specialty (the French value chosen in the form), written in each language. */
const cvs: Record<string, Record<CvLanguage, CvWording>> = {
  "Anesthésie-réanimation": {
    "français": { title: "Médecin anesthésiste-réanimateur", specialty: "Anesthésie-réanimation", skill: "anesthésie locorégionale" },
    "anglais britannique": { title: "Consultant Anaesthetist", specialty: "Anaesthesia and Intensive Care Medicine", skill: "regional anaesthesia" },
    "allemand": { title: "Facharzt für Anästhesiologie", specialty: "Anästhesiologie und Intensivmedizin", skill: "Regionalanästhesie" },
    "arabe": { title: "طبيب تخدير وإنعاش", specialty: "التخدير والعناية المركزة", skill: "التخدير الموضعي" },
    "chinois": { title: "麻醉科主治医师", specialty: "麻醉学", skill: "区域麻醉" },
  },
  "Pédiatrie": {
    "français": { title: "Pédiatre", specialty: "Pédiatrie", skill: "néonatologie" },
    "anglais britannique": { title: "Consultant Paediatrician", specialty: "Paediatrics", skill: "neonatal resuscitation" },
    "allemand": { title: "Fachärztin für Kinderheilkunde", specialty: "Kinder- und Jugendmedizin", skill: "Neonatologie" },
    "arabe": { title: "استشاري طب الأطفال", specialty: "طب الأطفال وحديثي الولادة", skill: "إنعاش حديثي الولادة" },
    "chinois": { title: "儿科主治医师", specialty: "儿科学", skill: "新生儿复苏" },
  },
  "Médecine d’urgence": {
    "français": { title: "Médecin urgentiste", specialty: "Médecine d’urgence", skill: "traumatologie" },
    "anglais britannique": { title: "Consultant in Emergency Medicine", specialty: "Emergency Medicine", skill: "major trauma" },
    "allemand": { title: "Oberarzt Zentrale Notaufnahme", specialty: "Notfallmedizin", skill: "Schockraummanagement" },
    "arabe": { title: "طبيب طوارئ", specialty: "طب الطوارئ", skill: "إدارة الإصابات" },
    "chinois": { title: "急诊科主治医师", specialty: "急诊医学", skill: "创伤急救" },
  },
};

/** A faithful AI reading of the CV: every value is quoted from the extracted text. */
function analyse(language: CvLanguage, cv: CvWording, declaredSpecialty: string) {
  const layout = cvLayouts[language](cv);
  const [titleLine, specialtyLine, experienceLine, skillLine, languageLine] = layout.lines as [string, string, string, string, string];
  const quote = (evidence: string) => ({ evidence, sourceLocation: "page 1", confidence: 95 });
  const analysis: AnalysisInput = {
    summary: "Synthèse proposée par le modèle.",
    professionalTitle: cv.title,
    specialties: [cv.specialty],
    skills: [cv.skill],
    languages: [layout.language],
    normalizedLanguages: [{ language: layout.language, proficiency: "unknown", ...quote(languageLine) }],
    certifications: [],
    countriesOfInterest: [],
    yearsExperience: null,
    normalizedExperiences: [{ role: cv.title, organization: layout.organization, startDate: null, endDate: null, employmentType: "unknown", specialty: "", country: null, durationMonths: null, ...quote(experienceLine) }],
    strengths: [],
    gaps: [],
    dataQualityWarnings: [],
    requiredFollowUps: [],
    fieldEvidence: [
      { field: "professionalTitle", value: cv.title, ...quote(titleLine) },
      { field: "specialty", value: cv.specialty, ...quote(specialtyLine) },
      { field: "skill", value: cv.skill, ...quote(skillLine) },
    ],
    contradictions: [],
    confidence: 90,
    scoreBreakdown: { specialtyMatch: 30, experienceEvidence: 10, skillsEvidence: 5, languageReadiness: 2, credentialReadiness: 0 },
    reasoning: "Raisonnement proposé par le modèle.",
  };
  return normalizeRecruitmentAnalysis(analysis, `[PAGE 1]\n${layout.lines.join("\n")}`, {
    specialty: declaredSpecialty,
    targetCountries: ["Émirats arabes unis"],
    languages: [],
  });
}

const languages = Object.keys(cvLayouts) as CvLanguage[];

describe("INTL-02 — même CV, même score, quelle que soit la langue du CV", () => {
  for (const [declaredSpecialty, wordings] of Object.entries(cvs)) {
    it.each(languages)(`${declaredSpecialty} : CV en %s`, language => {
      const french = analyse("français", wordings["français"], declaredSpecialty);
      const result = analyse(language, wordings[language], declaredSpecialty);

      expect(french.relevanceScore).toBe(47);
      expect(result.evidenceCoverage).toBe(100);
      expect(result.scoreBreakdown.specialtyMatch).toBe(30);
      expect(result.relevanceScore).toBe(french.relevanceScore);
      expect(result.specialties).toEqual([wordings[language].specialty]);
      expect(result.normalizedExperiences[0]?.evidenceVerified).toBe(true);
    });
  }

  it("ne rapproche pas pour autant deux spécialités différentes", () => {
    const anaesthetist = cvs["Anesthésie-réanimation"]!["anglais britannique"];
    for (const declared of ["Pédiatrie", "Médecine d’urgence", "Chirurgie générale"]) {
      const result = analyse("anglais britannique", anaesthetist, declared);
      expect(result.scoreBreakdown.specialtyMatch, declared).toBe(0);
      expect(result.relevanceScore, declared).toBeNull();
    }
    // A Latin-script equivalent is a word start: "urolog" is not found inside "Neurologist".
    const neurologist = analyse("anglais britannique", { title: "Consultant Neurologist", specialty: "Neurology", skill: "stroke thrombolysis" }, "Urologie");
    expect(neurologist.scoreBreakdown.specialtyMatch).toBe(0);
    expect(analyse("anglais britannique", { title: "Consultant Neurologist", specialty: "Neurology", skill: "stroke thrombolysis" }, "Neurologie").scoreBreakdown.specialtyMatch).toBe(30);
    // Chinese: 神经外科 (neurosurgery) is not 神经科 / 神经内科 (neurology).
    expect(analyse("chinois", { title: "神经外科主治医师", specialty: "神经外科", skill: "显微手术" }, "Neurologie").scoreBreakdown.specialtyMatch).toBe(0);
    expect(analyse("chinois", { title: "神经外科主治医师", specialty: "神经外科", skill: "显微手术" }, "Neurochirurgie").scoreBreakdown.specialtyMatch).toBe(30);
  });

  it("reconnaît aussi une spécialité saisie en texte libre (« Autre ») dans une autre langue que le CV", () => {
    const result = analyse("chinois", cvs["Anesthésie-réanimation"]!["chinois"], "Anästhesist (Facharzt)");
    expect(result.scoreBreakdown.specialtyMatch).toBe(30);
    expect(result.relevanceScore).toBe(47);
  });
});

describe("INTL-02 — citations en arabe et en chinois", () => {
  const titleEvidence = (title: string, evidence: string, sourceLine = evidence) => normalizeRecruitmentAnalysis({
    ...{ summary: "", specialties: [], skills: [], languages: [], normalizedLanguages: [], certifications: [], countriesOfInterest: [], yearsExperience: null, normalizedExperiences: [], strengths: [], gaps: [], dataQualityWarnings: [], requiredFollowUps: [], contradictions: [], confidence: 90, reasoning: "" },
    professionalTitle: title,
    fieldEvidence: [{ field: "professionalTitle", value: title, evidence, sourceLocation: "page 1", confidence: 95 }],
    scoreBreakdown: { specialtyMatch: 0, experienceEvidence: 0, skillsEvidence: 0, languageReadiness: 0, credentialReadiness: 0 },
  }, `[PAGE 1]\n${sourceLine}`).fieldEvidence[0]!.evidenceVerified;

  it("traite la virgule arabe et la ponctuation chinoise comme des séparateurs", () => {
    expect(titleEvidence("طبيب تخدير وإنعاش", "طبيب تخدير وإنعاش، مستشفى الملك فيصل التخصصي")).toBe(true);
    expect(titleEvidence("طبيب تخدير وإنعاش", "المسمى الوظيفي؛ طبيب تخدير وإنعاش؟")).toBe(true);
    expect(titleEvidence("Médecin anesthésiste", "Médecin anesthésiste、北京协和医院。")).toBe(true);
    expect(titleEvidence("麻醉科主治医师", "《麻醉科主治医师》「北京协和医院」")).toBe(true);
  });

  it("retrouve une valeur en idéogrammes sans exiger d’espaces, mais pas si elle est niée", () => {
    expect(titleEvidence("麻醉科主治医师", "2015年起在北京协和医院担任麻醉科主治医师")).toBe(true);
    expect(titleEvidence("麻醉医师", "麻醉医师")).toBe(true);
    expect(titleEvidence("麻醉科主治医师", "无麻醉科主治医师资格")).toBe(false);
    expect(titleEvidence("麻醉科主治医师", "尚未取得麻醉科主治医师资格")).toBe(false);
    expect(titleEvidence("麻醉科主治医师", "麻醉科主治医师资格已过期")).toBe(false);
    expect(titleEvidence("طبيب تخدير", "ليس طبيب تخدير، بل ممرض")).toBe(false);
    // The quote must still be in the text that was read.
    expect(titleEvidence("麻醉科主治医师", "北京协和医院麻醉科主治医师", "上海瑞金医院儿科主治医师")).toBe(false);
  });
});
