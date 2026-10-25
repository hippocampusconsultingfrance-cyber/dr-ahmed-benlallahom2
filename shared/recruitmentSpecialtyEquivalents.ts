/**
 * INTL-02 — Equivalents of the specialties offered by the application form
 * (the French values stored in cv_applications.specialty, listed in
 * client/src/pages/RecruitmentPage.tsx), so that a CV written in English (US
 * and GB spellings), German, Arabic or Chinese (simplified and traditional)
 * is matched with the declared specialty like a French one.
 *
 * Terms are compared without accents or case. A Latin-script term is a word
 * start ("anaesthe" matches "anaesthetist", never "urolog" inside
 * "neurologist"); an Arabic or Chinese term matches anywhere, since an Arabic
 * word takes prefixes (و, ال) and Chinese has no spaces.
 *
 * French and German terms serve the specialties typed as free text («
 * Autre ») and the VVIP / Offshore profiles (client/src/pages/VvipOffshorePage.tsx),
 * stored in the language of the form: « Médecin urgentiste », « Notarzt »,
 * « Réanimateur », « Infirmier(ère) anesthésiste (IADE) »… The platform
 * physician, private physician and offshore paramedic profiles have no
 * equivalent among the form specialties.
 */
export const RECRUITMENT_SPECIALTY_EQUIVALENTS: Readonly<Record<string, readonly string[]>> = {
  "Médecine générale": ["general practi", "family medicine", "family physician", "family doctor", "allgemeinmedizin", "hausarzt", "طب الأسرة", "طبيب أسرة", "طب عام", "طبيب عام", "全科", "家庭医学", "家庭醫學", "家庭医生", "家庭醫生"],
  "Médecine d’urgence": ["emergency", "urgentist", "médecine d’urgence", "notfall", "notarzt", "notaufnahme", "طوارئ", "急诊", "急診", "急救医学", "急救醫學"],
  "Médecine intensive et réanimation": ["intensive care", "critical care", "intensivist", "soins intensifs", "réanimat", "intensivmedizin", "العناية المركزة", "العناية الحرجة", "重症医学", "重症醫學", "重症监护", "重症監護"],
  "Gériatrie": ["geriatr", "elderly care", "care of the elderly", "altersmedizin", "طب الشيخوخة", "طب المسنين", "老年医学", "老年醫學", "老年科"],
  "Médecine du travail": ["occupational medicine", "occupational health", "occupational physician", "arbeitsmedizin", "betriebsarzt", "طب العمل", "الطب المهني", "الصحة المهنية", "职业医学", "職業醫學", "职业病", "職業病", "职业健康", "職業健康"],
  "Médecine du sport": ["sports medicine", "sport medicine", "sports and exercise medicine", "sportmedizin", "الطب الرياضي", "طب الرياضة", "运动医学", "運動醫學"],
  "Santé publique et médecine sociale": ["public health", "community medicine", "social medicine", "öffentliches gesundheitswesen", "öffentlicher gesundheitsdienst", "sozialmedizin", "الصحة العامة", "طب المجتمع", "公共卫生", "公共衛生", "预防医学", "預防醫學"],
  "Cardiologie": ["cardiolog", "kardiolog", "طب القلب", "أمراض القلب", "طبيب قلب", "心内科", "心內科", "心血管内科", "心血管內科", "心脏内科", "心臟內科"],
  "Cardiologie interventionnelle": ["interventional cardiolog", "cardiolog", "kardiolog", "herzkatheter", "قسطرة", "طب القلب", "أمراض القلب", "心脏介入", "心臟介入", "心内科", "心內科", "心血管内科", "心血管內科"],
  "Pneumologie": ["pulmonolog", "pneumolog", "respiratory medicine", "respiratory physician", "chest physician", "lungenheilkunde", "الأمراض الصدرية", "أمراض الصدر", "طب الرئة", "呼吸内科", "呼吸內科", "呼吸科", "肺科"],
  "Gastro-entérologie et hépatologie": ["gastroenterolog", "gastro enterolog", "hepatolog", "الجهاز الهضمي", "أمراض الكبد", "طب الكبد", "消化内科", "消化內科", "消化科", "肝病"],
  // Not "kidney" or 肾脏 alone: a "Kidney Transplant Surgeon" (肾脏移植外科医师) is no nephrologist.
  "Néphrologie": ["nephrolog", "renal medicine", "renal physician", "kidney disease", "kidney specialist", "kidney physician", "kidney medicine", "أمراض الكلى", "طب الكلى", "肾内科", "腎內科", "肾脏内科", "腎臟內科", "肾脏病", "腎臟病"],
  "Neurologie": ["neurolog", "طب الأعصاب", "أمراض الأعصاب", "الأمراض العصبية", "神经内科", "神經內科", "神经科", "神經科"],
  "Oncologie médicale": ["oncolog", "onkolog", "طب الأورام", "الأورام", "肿瘤", "腫瘤"],
  "Hématologie": ["hematolog", "haematolog", "hämatolog", "أمراض الدم", "طب الدم", "血液科", "血液内科", "血液內科"],
  "Endocrinologie, diabétologie et nutrition": ["endocrinolog", "endokrinolog", "diabetolog", "diabetes", "الغدد الصماء", "السكري", "内分泌", "糖尿病"],
  "Rhumatologie": ["rheumatolog", "الروماتيزم", "风湿", "風濕"],
  "Dermatologie et vénéréologie": ["dermatolog", "venereolog", "venerolog", "الأمراض الجلدية", "طب الجلد", "الجلدية", "皮肤科", "皮膚科"],
  "Pédiatrie": ["pediatr", "paediatr", "pädiatr", "kinderheilkunde", "kinder und jugendmedizin", "kinderarzt", "طب الأطفال", "طب أطفال", "طبيب أطفال", "طبيبة أطفال", "儿科", "兒科"],
  "Psychiatrie": ["psychiatr", "الطب النفسي", "طب نفسي", "طبيب نفسي", "精神科", "精神病学", "精神病學"],
  "Psychiatrie de l’enfant et de l’adolescent": ["child and adolescent psychiatr", "child psychiatr", "kinder und jugendpsychiatr", "kinderpsychiatr", "psychiatr", "الطب النفسي للأطفال", "الطب النفسي", "طب نفسي", "儿童精神", "兒童精神", "儿童青少年精神", "兒童青少年精神", "精神科"],
  "Infectiologie et maladies tropicales": ["infectious disease", "infectiolog", "tropical medicine", "infektiolog", "tropenmedizin", "الأمراض المعدية", "الأمراض الاستوائية", "感染科", "感染病", "传染病", "傳染病", "热带病", "熱帶病"],
  "Médecine physique et de réadaptation (MPR)": ["physical medicine", "rehabilitation medicine", "physiatr", "physikalische und rehabilitative medizin", "rehabilitationsmedizin", "الطب الطبيعي", "إعادة التأهيل", "طب التأهيل", "康复医学", "康復醫學", "康复科", "康復科"],
  "Chirurgie générale": ["general surg", "allgemeinchirurg", "الجراحة العامة", "جراحة عامة", "جراح عام", "普通外科", "普外科", "一般外科"],
  "Chirurgie viscérale et digestive": ["visceral surg", "digestive surg", "gastrointestinal surg", "abdominal surg", "colorectal surg", "hepatobiliary", "viszeralchirurg", "bauchchirurg", "جراحة الجهاز الهضمي", "جراحة البطن", "胃肠外科", "胃腸外科", "消化外科", "肝胆外科", "肝膽外科"],
  "Chirurgie orthopédique et traumatologie": ["orthoped", "orthopaed", "orthopäd", "trauma surg", "traumatolog", "unfallchirurg", "جراحة العظام", "عظام", "骨科"],
  "Neurochirurgie": ["neurosurg", "neurochirurg", "جراحة الأعصاب", "جراحة المخ والأعصاب", "جراح أعصاب", "神经外科", "神經外科"],
  "Chirurgie cardiovasculaire et thoracique": ["cardiothoracic", "cardiac surg", "heart surg", "thoracic surg", "vascular surg", "cardiovascular surg", "herzchirurg", "thoraxchirurg", "gefäßchirurg", "جراحة القلب", "جراحة الصدر", "جراحة الأوعية الدموية", "心外科", "心胸外科", "心脏外科", "心臟外科", "胸外科", "血管外科"],
  "Chirurgie plastique, reconstructrice et esthétique": ["plastic surg", "reconstructive surg", "aesthetic surg", "cosmetic surg", "plastische chirurg", "ästhetische chirurg", "جراحة التجميل", "الجراحة التجميلية", "التجميل", "整形外科", "美容外科"],
  "Chirurgie pédiatrique": ["pediatric surg", "paediatric surg", "kinderchirurg", "جراحة الأطفال", "小儿外科", "小兒外科", "儿外科", "兒外科"],
  "Chirurgie maxillo-faciale": ["maxillofacial", "maxillo facial", "kieferchirurg", "mund kiefer", "الوجه والفكين", "颌面外科", "頜面外科", "口腔颌面", "口腔頜面"],
  "Urologie": ["urolog", "المسالك البولية", "泌尿外科", "泌尿科"],
  "Gynécologie et obstétrique": ["gynecolog", "gynaecolog", "gynäkolog", "obstetric", "frauenheilkunde", "geburtshilfe", "النساء والتوليد", "أمراض النساء", "التوليد", "妇产科", "婦產科", "妇科", "婦科", "产科", "產科"],
  "Ophtalmologie": ["ophthalmolog", "eye surg", "augenheilkunde", "augenarzt", "طب العيون", "جراحة العيون", "العيون", "眼科"],
  "Oto-rhino-laryngologie (ORL) et chirurgie cervico-faciale": ["otolaryngolog", "otorhinolaryngolog", "ear nose and throat", "ear nose throat", "head and neck surg", "hals nasen ohren", "hno", "الأنف والأذن والحنجرة", "أنف وأذن وحنجرة", "耳鼻喉", "耳鼻咽喉"],
  "Stomatologie": ["stomatolog", "oral surg", "oral medicine", "mundchirurg", "oralchirurg", "طب الفم", "جراحة الفم", "口腔科", "口腔医学", "口腔醫學"],
  "Anesthésie-réanimation": ["anesthesi", "anesthet", "anaesthe", "anästhes", "intensive care", "soins intensifs", "réanimat", "تخدير", "麻醉"],
  "Radiologie et imagerie médicale": ["radiolog", "diagnostic imaging", "medical imaging", "الأشعة", "التصوير الطبي", "放射科", "影像科", "医学影像", "醫學影像"],
  "Médecine nucléaire": ["nuclear medicine", "nuklearmedizin", "الطب النووي", "核医学", "核醫學"],
  "Biologie médicale / Pathologie": ["clinical patholog", "pathologist", "laboratory medicine", "clinical biochem", "medical microbiolog", "laboratoriumsmedizin", "الطب المخبري", "علم الأمراض", "检验医学", "檢驗醫學", "检验科", "檢驗科", "病理"],
  "Anatomie et cytologie pathologiques": ["anatomic patholog", "anatomical patholog", "histopatholog", "cytopatholog", "cytolog", "pathologist", "علم الأمراض التشريحي", "الأنسجة المرضية", "علم الأنسجة", "病理科", "病理学", "病理學", "细胞病理", "細胞病理"],
  "Pharmacologie médicale": ["pharmacolog", "pharmakolog", "علم الأدوية", "علم العقاقير", "药理", "藥理"],
  "Toxicologie": ["toxicolog", "toxikolog", "علم السموم", "السموم", "毒理", "中毒"],
  "Soins infirmiers généraux": ["nurse", "nursing", "infirmier", "krankenpfleg", "pflegefach", "تمريض", "ممرض", "护士", "護士", "护理", "護理"],
  "Infirmier(ère) en soins généraux et spécialisés (IDE)": ["nurse", "nursing", "infirmier", "krankenpfleg", "pflegefach", "تمريض", "ممرض", "护士", "護士", "护理", "護理"],
  "Infirmier(ère) anesthésiste (IADE)": ["nurse anesthet", "nurse anaesthet", "anaesthetic nurse", "anesthesia nurse", "anaesthesia nurse", "crna", "iade", "infirmier anesthésiste", "infirmière anesthésiste", "infirmier ère anesthésiste", "anästhesiepfleg", "fachpflege anästhesie", "anästhesiefachpfleg", "fachkrankenpfleger für anästhesie", "fachkrankenpflegerin für anästhesie", "ممرض تخدير", "ممرضة تخدير", "تمريض التخدير", "麻醉护士", "麻醉護士", "麻醉专科护士", "麻醉專科護士"],
  "Infirmier(ère) de bloc opératoire (IBODE)": ["theatre nurse", "theater nurse", "operating room nurse", "operating theatre nurse", "scrub nurse", "perioperative nurs", "operationstechnische", "op pflege", "op fachpflege", "fachkrankenpfleger für den operationsdienst", "ممرض العمليات", "ممرضة العمليات", "تمريض العمليات", "手术室护士", "手術室護士", "手术室护理", "手術室護理"],
  "Infirmier(ère) puériculteur(trice)": ["pediatric nurs", "paediatric nurs", "children s nurs", "neonatal nurs", "kinderkrankenpfleg", "ممرض أطفال", "ممرضة أطفال", "تمريض الأطفال", "儿科护士", "兒科護士", "儿科护理", "兒科護理"],
  "Infirmier(ère) en pratique avancée (IPA)": ["advanced practice nurs", "advanced nurse practitioner", "nurse practitioner", "clinical nurse specialist", "pflegeexpert", "ممارس تمريض متقدم", "ممرض ممارس متقدم", "高级实践护士", "高級實踐護士", "专科护士", "專科護士"],
  "Cadre de santé / Direction des soins": ["nurse manager", "nursing manager", "head nurse", "ward manager", "charge nurse", "director of nursing", "nursing director", "matron", "pflegedienstleitung", "stationsleitung", "pflegedirektor", "مدير التمريض", "رئيس التمريض", "رئيسة التمريض", "مشرف تمريض", "护士长", "護士長", "护理部主任", "護理部主任"],
  "Sage-femme": ["midwi", "hebamme", "entbindungspfleg", "قابلة", "القبالة", "助产", "助產"],
  "Masseur-kinésithérapeute / Physiothérapeute": ["physiotherap", "physical therap", "krankengymnast", "العلاج الطبيعي", "علاج طبيعي", "物理治疗", "物理治療", "康复治疗师", "康復治療師"],
  "Ergothérapeute": ["occupational therap", "ergotherap", "العلاج الوظيفي", "作业治疗", "作業治療", "职能治疗", "職能治療"],
  "Orthophoniste": ["speech and language therap", "speech language patholog", "speech therap", "speech patholog", "logopäd", "sprachtherap", "علاج النطق", "النطق والتخاطب", "التخاطب", "言语治疗", "言語治療", "语言治疗", "語言治療"],
  "Orthoptiste": ["orthopt", "تقويم البصر", "视轴矫正", "視軸矯正", "斜视", "斜視"],
  "Psychomotricien(ne)": ["psychomotor therap", "psychomotric", "psychomotorik", "motopäd", "العلاج النفسي الحركي", "心理运动", "心理運動"],
  "Manipulateur(trice) d’électroradiologie médicale (ERM)": ["radiographer", "radiologic technolog", "radiology technolog", "radiology technician", "x ray technician", "medical imaging technolog", "radiologietechnolog", "mtra", "medizinisch technische radiologieassistent", "فني أشعة", "تقني أشعة", "放射技师", "放射技師", "影像技师", "影像技師"],
  "Technicien(ne) de laboratoire médical": ["laboratory technician", "lab technician", "medical laboratory", "laboratory technolog", "medical technologist", "biomedical scientist", "mtla", "medizinisch technische laboratoriumsassistent", "biomedizinische analytik", "فني مختبر", "تقني مختبر", "أخصائي مختبر", "检验技师", "檢驗技師", "化验员", "化驗員"],
  "Préparateur(trice) en pharmacie": ["pharmacy technician", "pharmacy assistant", "dispensing technician", "pharmazeutisch technische", "فني صيدلة", "مساعد صيدلي", "药剂员", "藥劑員", "药房技术员", "藥房技術員"],
  "Pharmacien(ne)": ["pharmacist", "clinical pharmac", "apotheker", "صيدلي", "صيدلاني", "صيدلانية", "药剂师", "藥劑師", "药师", "藥師"],
  "Diététicien(ne) / Nutritionniste": ["dietitian", "dietician", "nutritionist", "diätassistent", "ernährungsberat", "أخصائي تغذية", "أخصائية تغذية", "التغذية العلاجية", "营养师", "營養師"],
  "Psychologue clinicien(ne)": ["psycholog", "أخصائي نفسي", "أخصائية نفسية", "علم النفس السريري", "عالم نفس", "心理师", "心理師", "心理咨询师", "心理諮詢師", "临床心理", "臨床心理"],
  "Assistant(e) social(e) de santé": ["social work", "sozialarbeit", "sozialpädagog", "sozialdienst", "أخصائي اجتماعي", "أخصائية اجتماعية", "الخدمة الاجتماعية", "社工", "社会工作", "社會工作"],
};

/**
 * The « Soins infirmiers & Paramédical » specialties of the form
 * (client/src/pages/recruitmentSpecialties.ts). A title holding one of the
 * terms below is a nursing or allied health title: it earns specialty points
 * only when the declared specialty is one of these professions too
 * (INTL-02). An « Intensive Care Nurse », an « Emergency Medical
 * Technician » or an « Infirmier de réanimation » is no intensivist or
 * emergency physician.
 */
export const RECRUITMENT_PARAMEDICAL_SPECIALTIES: ReadonlySet<string> = new Set([
  "Soins infirmiers généraux",
  "Infirmier(ère) en soins généraux et spécialisés (IDE)",
  "Infirmier(ère) anesthésiste (IADE)",
  "Infirmier(ère) de bloc opératoire (IBODE)",
  "Infirmier(ère) puériculteur(trice)",
  "Infirmier(ère) en pratique avancée (IPA)",
  "Cadre de santé / Direction des soins",
  "Sage-femme",
  "Masseur-kinésithérapeute / Physiothérapeute",
  "Ergothérapeute",
  "Orthophoniste",
  "Orthoptiste",
  "Psychomotricien(ne)",
  "Manipulateur(trice) d’électroradiologie médicale (ERM)",
  "Technicien(ne) de laboratoire médical",
  "Préparateur(trice) en pharmacie",
  "Pharmacien(ne)",
  "Diététicien(ne) / Nutritionniste",
  "Psychologue clinicien(ne)",
  "Assistant(e) social(e) de santé",
]);

/**
 * Words of a nursing or allied health title, matched like the equivalents
 * above. Only names of professions: not the fields they share with
 * physicians (斜视 "strabismus", "clinical pharmac…"), so that a
 * « Consultant Clinical Pharmacologist » stays a physician.
 */
export const RECRUITMENT_PARAMEDICAL_TITLE_TERMS: readonly string[] = [
  "nurse", "nursing", "midwi", "paramedic", "technician", "technologist", "therapist", "physiotherap", "radiographer", "sonographer",
  "pharmacist", "dietitian", "dietician", "nutritionist", "orthoptist", "psychologist", "social worker", "healthcare assistant",
  "care assistant", "medical assistant", "physician assistant", "physician associate",
  "infirmier", "aide soignant", "auxiliaire", "technicien", "manipulateur", "préparateur", "kinésithérap", "sage femme", "orthophon",
  "ergothérap", "psychomotric", "diététicien", "pharmacien", "puéricult", "psychologue", "assistant social",
  "assistante sociale", "cadre de santé", "ambulancier", "brancardier", "secouriste",
  "krankenpfleg", "pflegefach", "pflegekraft", "fachpflege", "pflegehelfer", "pflegeexpert", "pflegedienstleitung", "op pflege",
  "anästhesiepfleg", "intensivpfleg", "hebamme", "entbindungspfleg", "notfallsanitäter", "rettungssanitäter", "rettungsassistent",
  "logopäd", "mtra", "mtla", "apotheker", "diätassistent", "psychologe", "sozialarbeit",
  "ممرض", "تمريض", "مسعف", "فني تخدير", "فني أشعة", "فني مختبر", "فني إسعاف", "تقني أشعة", "تقني مختبر", "صيدلي", "صيدلاني",
  "أخصائي تغذية", "أخصائية تغذية", "أخصائي نفسي", "أخصائية نفسية", "أخصائي اجتماعي",
  "护士", "護士", "护理", "護理", "助产", "助產", "技师", "技師", "技术员", "技術員", "护工", "護工", "急救员", "急救員", "治疗师", "治療師",
  "药剂师", "藥劑師", "药师", "藥師", "营养师", "營養師", "心理师", "心理師", "社工",
];
