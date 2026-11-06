type Language = "fr" | "en" | "de" | "zh";

/**
 * Specialties of the standard application form (REC-04). The French name is the value sent to
 * /api/recruitment/apply and kept in cv_applications.specialty, where the admin filters, the CV
 * matching and the applications already received read it: it never changes with the page
 * language. The other names are only shown and searched.
 */
const specialty = (fr: string, en: string, de: string, zh: string) => ({ value: fr, labels: { fr, en, de, zh } });

export const recruitmentSpecialtyCategories = [
  {
    category: { fr: "Médecine générale & Urgences", en: "General Practice & Emergency", de: "Allgemeinmedizin & Notfallmedizin", zh: "全科与急诊医学" },
    items: [
      specialty("Médecine générale", "General practice", "Allgemeinmedizin", "全科医学"),
      specialty("Médecine d’urgence", "Emergency medicine", "Notfallmedizin", "急诊医学"),
      specialty("Médecine intensive et réanimation", "Intensive care medicine", "Intensivmedizin", "重症医学"),
      specialty("Gériatrie", "Geriatrics", "Geriatrie", "老年医学"),
      specialty("Médecine du travail", "Occupational medicine", "Arbeitsmedizin", "职业医学"),
      specialty("Médecine du sport", "Sports medicine", "Sportmedizin", "运动医学"),
      specialty("Santé publique et médecine sociale", "Public health and social medicine", "Öffentliches Gesundheitswesen und Sozialmedizin", "公共卫生与社会医学"),
    ],
  },
  {
    category: { fr: "Spécialités médicales", en: "Medical Specialties", de: "Medizinische Fachgebiete", zh: "内科专科" },
    items: [
      specialty("Cardiologie", "Cardiology", "Kardiologie", "心血管内科"),
      specialty("Cardiologie interventionnelle", "Interventional cardiology", "Interventionelle Kardiologie", "介入心脏病学"),
      specialty("Pneumologie", "Pulmonology", "Pneumologie", "呼吸内科"),
      specialty("Gastro-entérologie et hépatologie", "Gastroenterology and hepatology", "Gastroenterologie und Hepatologie", "消化内科与肝病学"),
      specialty("Néphrologie", "Nephrology", "Nephrologie", "肾内科"),
      specialty("Neurologie", "Neurology", "Neurologie", "神经内科"),
      specialty("Oncologie médicale", "Medical oncology", "Internistische Onkologie", "肿瘤内科"),
      specialty("Hématologie", "Hematology", "Hämatologie", "血液内科"),
      specialty("Endocrinologie, diabétologie et nutrition", "Endocrinology, diabetes and nutrition", "Endokrinologie, Diabetologie und Ernährungsmedizin", "内分泌、糖尿病与营养科"),
      specialty("Rhumatologie", "Rheumatology", "Rheumatologie", "风湿免疫科"),
      specialty("Dermatologie et vénéréologie", "Dermatology and venereology", "Dermatologie und Venerologie", "皮肤性病科"),
      specialty("Pédiatrie", "Pediatrics", "Pädiatrie", "儿科"),
      specialty("Psychiatrie", "Psychiatry", "Psychiatrie", "精神科"),
      specialty("Psychiatrie de l’enfant et de l’adolescent", "Child and adolescent psychiatry", "Kinder- und Jugendpsychiatrie", "儿童与青少年精神科"),
      specialty("Infectiologie et maladies tropicales", "Infectious and tropical diseases", "Infektiologie und Tropenmedizin", "感染与热带病科"),
      specialty("Médecine physique et de réadaptation (MPR)", "Physical and rehabilitation medicine (PRM)", "Physikalische und Rehabilitative Medizin", "康复医学科"),
    ],
  },
  {
    category: { fr: "Chirurgie & Spécialités chirurgicales", en: "Surgery & Surgical Specialties", de: "Chirurgie & Chirurgische Fachgebiete", zh: "外科与手术专科" },
    items: [
      specialty("Chirurgie générale", "General surgery", "Allgemeinchirurgie", "普通外科"),
      specialty("Chirurgie viscérale et digestive", "Visceral and digestive surgery", "Viszeralchirurgie", "腹部与消化外科"),
      specialty("Chirurgie orthopédique et traumatologie", "Orthopedic and trauma surgery", "Orthopädie und Unfallchirurgie", "骨科与创伤外科"),
      specialty("Neurochirurgie", "Neurosurgery", "Neurochirurgie", "神经外科"),
      specialty("Chirurgie cardiovasculaire et thoracique", "Cardiovascular and thoracic surgery", "Herz-, Thorax- und Gefäßchirurgie", "心胸与血管外科"),
      specialty("Chirurgie plastique, reconstructrice et esthétique", "Plastic, reconstructive and aesthetic surgery", "Plastische, Rekonstruktive und Ästhetische Chirurgie", "整形、重建与美容外科"),
      specialty("Chirurgie pédiatrique", "Pediatric surgery", "Kinderchirurgie", "小儿外科"),
      specialty("Chirurgie maxillo-faciale", "Maxillofacial surgery", "Mund-, Kiefer- und Gesichtschirurgie", "颌面外科"),
      specialty("Urologie", "Urology", "Urologie", "泌尿外科"),
      specialty("Gynécologie et obstétrique", "Obstetrics and gynecology", "Frauenheilkunde und Geburtshilfe", "妇产科"),
      specialty("Ophtalmologie", "Ophthalmology", "Augenheilkunde", "眼科"),
      specialty("Oto-rhino-laryngologie (ORL) et chirurgie cervico-faciale", "Otorhinolaryngology (ENT) and head and neck surgery", "Hals-Nasen-Ohrenheilkunde (HNO)", "耳鼻喉头颈外科"),
      specialty("Stomatologie", "Stomatology", "Stomatologie", "口腔科"),
    ],
  },
  {
    category: { fr: "Anesthésie, Imagerie & Laboratoire", en: "Anesthesia, Imaging & Laboratory", de: "Anästhesie, Bildgebung & Labor", zh: "麻醉、影像与检验医学" },
    items: [
      specialty("Anesthésie-réanimation", "Anesthesiology and critical care", "Anästhesiologie und Intensivmedizin", "麻醉与重症医学"),
      specialty("Radiologie et imagerie médicale", "Radiology and medical imaging", "Radiologie", "放射与医学影像科"),
      specialty("Médecine nucléaire", "Nuclear medicine", "Nuklearmedizin", "核医学"),
      specialty("Biologie médicale / Pathologie", "Laboratory medicine / Pathology", "Laboratoriumsmedizin / Pathologie", "检验医学 / 病理学"),
      specialty("Anatomie et cytologie pathologiques", "Anatomic pathology and cytopathology", "Pathologie und Zytopathologie", "病理解剖与细胞病理学"),
      specialty("Pharmacologie médicale", "Clinical pharmacology", "Klinische Pharmakologie", "临床药理学"),
      specialty("Toxicologie", "Toxicology", "Toxikologie", "毒理学"),
    ],
  },
  {
    category: { fr: "Soins infirmiers & Paramédical", en: "Nursing & Allied Health", de: "Pflege & Paramedizinische Berufe", zh: "护理与专职医疗" },
    items: [
      specialty("Soins infirmiers généraux", "General nursing", "Allgemeine Pflege", "普通护理"),
      specialty("Infirmier(ère) en soins généraux et spécialisés (IDE)", "Registered nurse, general and specialized care (IDE)", "Gesundheits- und Krankenpfleger/in (IDE)", "注册护士（普通与专科护理，IDE）"),
      specialty("Infirmier(ère) anesthésiste (IADE)", "Nurse anesthetist (IADE)", "Anästhesiepflegekraft (IADE)", "麻醉护士（IADE）"),
      specialty("Infirmier(ère) de bloc opératoire (IBODE)", "Operating room nurse (IBODE)", "OP-Pflegekraft (IBODE)", "手术室护士（IBODE）"),
      specialty("Infirmier(ère) puériculteur(trice)", "Pediatric nurse", "Kinderkrankenpfleger/in", "儿科护士"),
      specialty("Infirmier(ère) en pratique avancée (IPA)", "Advanced practice nurse (IPA)", "Pflegefachperson mit erweiterter Praxis (IPA)", "高级实践护士（IPA）"),
      specialty("Cadre de santé / Direction des soins", "Nurse manager / Director of nursing", "Pflegedienstleitung / Pflegedirektion", "护士长 / 护理管理"),
      specialty("Sage-femme", "Midwife", "Hebamme / Entbindungspfleger", "助产士"),
      specialty("Masseur-kinésithérapeute / Physiothérapeute", "Physiotherapist / Physical therapist", "Physiotherapeut/in", "物理治疗师"),
      specialty("Ergothérapeute", "Occupational therapist", "Ergotherapeut/in", "作业治疗师"),
      specialty("Orthophoniste", "Speech and language therapist", "Logopäde/Logopädin", "言语治疗师"),
      specialty("Orthoptiste", "Orthoptist", "Orthoptist/in", "视轴矫正师"),
      specialty("Psychomotricien(ne)", "Psychomotor therapist", "Psychomotoriktherapeut/in", "心理运动治疗师"),
      specialty("Manipulateur(trice) d’électroradiologie médicale (ERM)", "Radiographer / Radiologic technologist (ERM)", "Medizinische/r Technologe/in für Radiologie (ERM)", "医学影像技师（ERM）"),
      specialty("Technicien(ne) de laboratoire médical", "Medical laboratory technician", "Medizinische/r Technologe/in für Laboratoriumsanalytik", "医学检验技师"),
      specialty("Préparateur(trice) en pharmacie", "Pharmacy technician", "Pharmazeutisch-technische/r Assistent/in", "药剂技术员"),
      specialty("Pharmacien(ne)", "Pharmacist", "Apotheker/in", "药剂师"),
      specialty("Diététicien(ne) / Nutritionniste", "Dietitian / Nutritionist", "Diätassistent/in / Ernährungsberater/in", "营养师"),
      specialty("Psychologue clinicien(ne)", "Clinical psychologist", "Klinische/r Psychologe/in", "临床心理师"),
      specialty("Assistant(e) social(e) de santé", "Healthcare social worker", "Sozialarbeiter/in im Gesundheitswesen", "医务社工"),
    ],
  },
  {
    category: { fr: "Autre", en: "Other", de: "Sonstige", zh: "其他" },
    items: [specialty("Autre spécialité ou profession", "Other specialty or profession", "Anderes Fachgebiet oder anderer Beruf", "其他专业或职业")],
  },
];

/** Name shown for a stored specialty value; a value missing from the list is shown as it is. */
export function recruitmentSpecialtyLabel(value: string, language: Language): string {
  for (const group of recruitmentSpecialtyCategories) {
    const item = group.items.find(candidate => candidate.value === value);
    if (item) return item.labels[language];
  }
  return value;
}

/** Accents, case, the typographic apostrophe and British "ae" spellings (paediatrics, anaesthesia) do not count. */
function normalizeSpecialtySearch(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/’/g, "'").replace(/ae/g, "e").trim();
}

/**
 * Specialties matching a search typed in French, in English or in the page language. A category
 * whose name matches keeps all its specialties, as before.
 */
export function filterRecruitmentSpecialties(query: string, language: Language) {
  const search = normalizeSpecialtySearch(query);
  if (!search) return recruitmentSpecialtyCategories;
  const matches = (labels: Record<Language, string>) => [labels.fr, labels.en, labels[language]].some(label => normalizeSpecialtySearch(label).includes(search));
  return recruitmentSpecialtyCategories
    .map(group => ({ ...group, items: matches(group.category) ? group.items : group.items.filter(item => matches(item.labels)) }))
    .filter(group => group.items.length > 0);
}
