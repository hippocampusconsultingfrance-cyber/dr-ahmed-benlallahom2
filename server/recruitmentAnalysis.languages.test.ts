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
    expect(analyse("anglais britannique", cvs["Médecine d’urgence"]!["anglais britannique"], "Médecin urgentiste").scoreBreakdown.specialtyMatch).toBe(30);
  });

  // Profiles of client/src/pages/VvipOffshorePage.tsx, stored in the language of the form with this prefix.
  const vvip = (label: string) => `[VVIP / Offshore] ${label}`;

  const emergencyPhysician = cvs["Médecine d’urgence"]!["anglais britannique"];
  const intensivist = { title: "Consultant in Intensive Care Medicine", specialty: "Intensive Care Medicine", skill: "mechanical ventilation" };
  it.each([
    ["Médecin urgentiste (ATLS / ACLS)", emergencyPhysician],
    ["Emergency physician (ATLS / ACLS)", emergencyPhysician],
    ["Notarzt / Notärztin (ATLS / ACLS)", emergencyPhysician],
    ["急诊医师（ATLS / ACLS）", emergencyPhysician],
    ["Médecin de soins intensifs / Réanimateur", intensivist],
    ["Intensive care physician", intensivist],
    ["Intensivmediziner / Reanimation", intensivist],
    ["重症医学医师", intensivist],
  ])("rapproche le profil VVIP « %s » d’un CV en anglais britannique", (label, cv) => {
    const result = analyse("anglais britannique", cv, vvip(label));
    expect(result.scoreBreakdown.specialtyMatch).toBe(30);
    expect(result.relevanceScore).toBe(47);
  });

  it("rapproche les infirmiers anesthésistes et infirmiers VVIP de leur CV, mais pas un urgentiste d’un anesthésiste", () => {
    const nurseAnaesthetist = { title: "Nurse Anaesthetist", specialty: "Anaesthetic nursing", skill: "airway management" };
    for (const label of ["Infirmier(ère) anesthésiste (IADE) VVIP", "VVIP nurse anaesthetist", "VVIP-Fachpflege Anästhesie", "VVIP 麻醉专科护士"]) {
      expect(analyse("anglais britannique", nurseAnaesthetist, vvip(label)).scoreBreakdown.specialtyMatch, label).toBe(30);
    }
    const nurse = { title: "Registered Nurse", specialty: "Adult nursing", skill: "triage" };
    expect(analyse("anglais britannique", nurse, vvip("Infirmier(ère) paramédical(e) Offshore / Rig Medic")).scoreBreakdown.specialtyMatch).toBe(30);
    expect(analyse("anglais britannique", cvs["Anesthésie-réanimation"]!["anglais britannique"], vvip("Médecin urgentiste (ATLS / ACLS)")).scoreBreakdown.specialtyMatch).toBe(0);
    expect(analyse("anglais britannique", cvs["Médecine d’urgence"]!["anglais britannique"], vvip("Notarzt / Notärztin (ATLS / ACLS)")).scoreBreakdown.specialtyMatch).toBe(30);
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
    // A negation after the value, as "Board certified anaesthetist: none" in English.
    for (const denied of ["麻醉科主治医师资格：无", "麻醉科主治医师资格：未取得", "麻醉科主治医师资格：没有", "麻醉科主治医师（尚未通过）"]) {
      expect(titleEvidence("麻醉科主治医师", denied), denied).toBe(false);
    }
    expect(titleEvidence("麻醉科主治医师", "麻醉科主治医师，非常熟悉心脏手术麻醉")).toBe(true);
    expect(titleEvidence("麻醉科主治医师", "麻醉科主治医师，不仅负责手术麻醉")).toBe(true);
    expect(titleEvidence("طبيب تخدير", "ليس طبيب تخدير، بل ممرض")).toBe(false);
    // The quote must still be in the text that was read.
    expect(titleEvidence("麻醉科主治医师", "北京协和医院麻醉科主治医师", "上海瑞金医院儿科主治医师")).toBe(false);
  });

  it("ne prend pas pour une négation les mots chinois du vocabulaire médical qui commencent par 无, 不, 非 ou 未", () => {
    for (const quote of [
      "麻醉科医师（无痛分娩中心）",
      "麻醉科医师，擅长无痛胃肠镜与无痛分娩",
      "无痛分娩麻醉科医师",
      "麻醉科医师，不同级别医院工作经验",
      "麻醉科医师，熟练掌握无创通气与无菌操作",
      "无锡市人民医院麻醉科医师",
      "麻醉科医师，负责包括但不限于心脏手术麻醉",
      "麻醉科医师，处理麻醉不良反应",
      "曾在非洲援助医疗队担任麻醉科医师",
      "非营利医院麻醉科医师",
    ]) expect(titleEvidence("麻醉科医师", quote), quote).toBe(true);
    for (const denied of ["非麻醉科医师", "不是麻醉科医师", "无麻醉科医师资格", "麻醉科医师资格：无", "麻醉科医师（尚未通过）", "麻醉科医师：未注册"]) {
      expect(titleEvidence("麻醉科医师", denied), denied).toBe(false);
    }
  });

  it("lit « غير حكومية » (ONG), « دون انقطاع » ou « لا سيما » sans négation, et « لست » comme une négation", () => {
    for (const quote of ["استشاري تخدير في منظمة غير حكومية", "استشاري تخدير في المنظمات غير الحكومية", "استشاري تخدير في مستشفى غير ربحي", "استشاري تخدير بدوام كامل دون انقطاع", "استشاري تخدير، لا سيما تخدير القلب"]) {
      expect(titleEvidence("استشاري تخدير", quote), quote).toBe(true);
    }
    for (const denied of ["لست استشاري تخدير", "غير حاصل على لقب استشاري تخدير", "استشاري تخدير غير معتمد", "استشاري تخدير دون ترخيص"]) {
      expect(titleEvidence("استشاري تخدير", denied), denied).toBe(false);
    }
  });

  it("vérifie les années d’expérience écrites contre un idéogramme : « 10年 », « 超过10年 »", () => {
    const yearsEvidence = (value: string, evidence: string, years = 10) => normalizeRecruitmentAnalysis({
      ...{ summary: "", professionalTitle: "", specialties: [], skills: [], languages: [], normalizedLanguages: [], certifications: [], countriesOfInterest: [], normalizedExperiences: [], strengths: [], gaps: [], dataQualityWarnings: [], requiredFollowUps: [], contradictions: [], confidence: 90, reasoning: "" },
      yearsExperience: years,
      fieldEvidence: [{ field: "yearsExperience", value, evidence, sourceLocation: "page 1", confidence: 95 }],
      scoreBreakdown: { specialtyMatch: 0, experienceEvidence: 0, skillsEvidence: 0, languageReadiness: 0, credentialReadiness: 0 },
    }, `[PAGE 1]\n${evidence}`);
    for (const [value, evidence] of [["10年", "麻醉科医师，10年工作经验"], ["超过10年", "临床麻醉工作超过10年"], ["10 年", "工作经验：10 年"], ["10 years", "Consultant Anaesthetist — 10 years of experience"]]) {
      const result = yearsEvidence(value!, evidence!);
      expect(result.yearsExperience, value).toBe(10);
      expect(result.scoreBreakdown.experienceEvidence, value).toBe(15);
    }
    // 2010年 is a year, not ten years of experience.
    expect(yearsEvidence("2010年", "2010年起担任麻醉科医师").yearsExperience).toBeNull();
    expect(yearsEvidence("10年", "麻醉科医师，10年工作经验", 1).yearsExperience).toBeNull();
  });
});

describe("INTL-02 — un titre infirmier, technicien ou secouriste n’est pas une spécialité médicale", () => {
  const english = (title: string, specialty: string, declared: string) => analyse("anglais britannique", { title, specialty, skill: "patient assessment" }, declared).scoreBreakdown.specialtyMatch;

  it.each([
    ["Intensive Care Nurse", "Intensive Care", "Anesthésie-réanimation"],
    ["Intensive Care Nurse", "Critical care nursing", "Médecine intensive et réanimation"],
    ["Emergency Medical Technician", "Emergency care", "Médecine d’urgence"],
    ["Paramedic", "Emergency medicine", "Médecine d’urgence"],
    ["Paediatric Nurse", "Paediatrics", "Pédiatrie"],
    ["Diabetes Specialist Nurse", "Diabetes", "Endocrinologie, diabétologie et nutrition"],
    ["Radiology Technician", "Radiology", "Radiologie et imagerie médicale"],
  ])("« %s » (%s) ne marque aucun point pour « %s »", (title, specialty, declared) => {
    expect(english(title, specialty, declared)).toBe(0);
  });

  it("garde les points d’un médecin, et ceux d’un infirmier quand la profession déclarée est infirmière", () => {
    expect(english("Consultant in Intensive Care Medicine", "Intensive Care Medicine", "Anesthésie-réanimation")).toBe(30);
    expect(english("Consultant Nephrologist", "Renal Medicine", "Néphrologie")).toBe(30);
    expect(english("Consultant in Diabetes and Endocrinology", "Diabetes", "Endocrinologie, diabétologie et nutrition")).toBe(30);
    // Fields shared with allied health professions do not make a physician one.
    expect(english("Consultant Clinical Pharmacologist", "Clinical Pharmacology", "Pharmacologie médicale")).toBe(30);
    expect(analyse("chinois", { title: "眼科主治医师", specialty: "斜视与小儿眼科", skill: "斜视手术" }, "Ophtalmologie").scoreBreakdown.specialtyMatch).toBe(30);
    expect(analyse("arabe", { title: "استشاري تخدير", specialty: "التخدير وتقنيات تسكين الألم", skill: "التخدير الموضعي" }, "Anesthésie-réanimation").scoreBreakdown.specialtyMatch).toBe(30);
    expect(english("Paediatric Nurse", "Paediatric nursing", "Infirmier(ère) puériculteur(trice)")).toBe(30);
    expect(english("Intensive Care Nurse", "Critical care nursing", "Infirmier(ère) en soins généraux et spécialisés (IDE)")).toBe(30);
    expect(english("Intensive Care Nurse", "Critical care nursing", "[VVIP / Offshore] Infirmier(ère) paramédical(e) Offshore / Rig Medic")).toBe(30);
  });

  it("ne rapproche plus un chirurgien de la transplantation rénale de la néphrologie", () => {
    expect(english("Kidney Transplant Surgeon", "Kidney transplantation", "Néphrologie")).toBe(0);
    expect(analyse("chinois", { title: "肾脏移植外科医师", specialty: "肾脏移植", skill: "肾移植手术" }, "Néphrologie").scoreBreakdown.specialtyMatch).toBe(0);
    expect(analyse("chinois", { title: "肾脏内科主治医师", specialty: "肾脏病学", skill: "血液透析" }, "Néphrologie").scoreBreakdown.specialtyMatch).toBe(30);
  });

  it("applique la même règle aux CV en français, en allemand, en arabe et en chinois, sans toucher aux médecins", () => {
    const french = (title: string, specialty: string, declared: string) => analyse("français", { title, specialty, skill: "ventilation" }, declared).scoreBreakdown.specialtyMatch;
    expect(french("Infirmier de réanimation", "Réanimation", "Médecine intensive et réanimation")).toBe(0);
    expect(french("Infirmière anesthésiste", "Anesthésie", "Anesthésie-réanimation")).toBe(0);
    expect(french("Infirmier de réanimation", "Soins infirmiers en réanimation", "Infirmier(ère) en soins généraux et spécialisés (IDE)")).toBe(30);
    expect(french("Médecin réanimateur", "Médecine intensive et réanimation", "Médecine intensive et réanimation")).toBe(30);
    expect(analyse("allemand", { title: "Notfallsanitäter", specialty: "Notfallmedizin", skill: "Reanimation" }, "Médecine d’urgence").scoreBreakdown.specialtyMatch).toBe(0);
    expect(analyse("arabe", { title: "ممرض العناية المركزة", specialty: "العناية المركزة", skill: "التنفس الاصطناعي" }, "Médecine intensive et réanimation").scoreBreakdown.specialtyMatch).toBe(0);
    expect(analyse("chinois", { title: "重症监护护士", specialty: "重症医学", skill: "呼吸机管理" }, "Médecine intensive et réanimation").scoreBreakdown.specialtyMatch).toBe(0);
    expect(analyse("chinois", { title: "重症医学科主治医师", specialty: "重症医学", skill: "呼吸机管理" }, "Médecine intensive et réanimation").scoreBreakdown.specialtyMatch).toBe(30);
  });
});
