import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, FileUp, Globe2, Loader2, Search, ShieldCheck, UserCheck, UsersRound, X } from "lucide-react";
import { Link } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { resolveCountryForSubmission } from "@/lib/countrySubmission";

const countryOptions = [
  { value: "France", labels: { fr: "France", en: "France", de: "Frankreich", zh: "法国" } },
  { value: "Allemagne", labels: { fr: "Allemagne", en: "Germany", de: "Deutschland", zh: "德国" } },
  { value: "Suisse", labels: { fr: "Suisse", en: "Switzerland", de: "Schweiz", zh: "瑞士" } },
  { value: "Belgique", labels: { fr: "Belgique", en: "Belgium", de: "Belgien", zh: "比利时" } },
  { value: "Royaume-Uni", labels: { fr: "Royaume-Uni", en: "United Kingdom", de: "Vereinigtes Königreich", zh: "英国" } },
  { value: "Italie", labels: { fr: "Italie", en: "Italy", de: "Italien", zh: "意大利" } },
  { value: "Espagne", labels: { fr: "Espagne", en: "Spain", de: "Spanien", zh: "西班牙" } },
  { value: "Canada", labels: { fr: "Canada", en: "Canada", de: "Kanada", zh: "加拿大" } },
  { value: "États-Unis", labels: { fr: "États-Unis", en: "United States", de: "Vereinigte Staaten", zh: "美国" } },
  { value: "Émirats arabes unis", labels: { fr: "Émirats arabes unis", en: "United Arab Emirates", de: "Vereinigte Arabische Emirate", zh: "阿联酋" } },
  { value: "Arabie saoudite", labels: { fr: "Arabie saoudite", en: "Saudi Arabia", de: "Saudi-Arabien", zh: "沙特阿拉伯" } },
  { value: "Qatar", labels: { fr: "Qatar", en: "Qatar", de: "Katar", zh: "卡塔尔" } },
  { value: "Oman", labels: { fr: "Oman", en: "Oman", de: "Oman", zh: "阿曼" } },
  { value: "Koweït", labels: { fr: "Koweït", en: "Kuwait", de: "Kuwait", zh: "科威特" } },
  { value: "Singapour", labels: { fr: "Singapour", en: "Singapore", de: "Singapur", zh: "新加坡" } },
  { value: "Australie", labels: { fr: "Australie", en: "Australia", de: "Australien", zh: "澳大利亚" } },
  { value: "Maroc", labels: { fr: "Maroc", en: "Morocco", de: "Marokko", zh: "摩洛哥" } },
  { value: "Autre pays / Mobilité mondiale", labels: { fr: "Autre pays / Mobilité mondiale", en: "Other country / Global mobility", de: "Anderes Land / Globale Mobilität", zh: "其他国家/全球流动" } },
] as const;

const professionalLanguageOptions = [
  { value: "Arabic", labels: { fr: "Arabe", en: "Arabic", de: "Arabisch", zh: "阿拉伯语" } },
  { value: "French", labels: { fr: "Français", en: "French", de: "Französisch", zh: "法语" } },
  { value: "English", labels: { fr: "Anglais", en: "English", de: "Englisch", zh: "英语" } },
  { value: "Spanish", labels: { fr: "Espagnol", en: "Spanish", de: "Spanisch", zh: "西班牙语" } },
  { value: "Portuguese", labels: { fr: "Portugais", en: "Portuguese", de: "Portugiesisch", zh: "葡萄牙语" } },
  { value: "German", labels: { fr: "Allemand", en: "German", de: "Deutsch", zh: "德语" } },
  { value: "Chinese", labels: { fr: "Chinois", en: "Chinese", de: "Chinesisch", zh: "中文" } },
  { value: "Other", labels: { fr: "Autre", en: "Other", de: "Andere", zh: "其他" } },
] as const;

const otherLanguageLabel = { fr: "Autre langue (à préciser)", en: "Other language (please specify)", de: "Andere Sprache (bitte angeben)", zh: "其他语言（请注明）" } as const;

const specialtyCategories = [
  {
    category: { fr: "Médecine générale & Urgences", en: "General Practice & Emergency", de: "Allgemeinmedizin & Notfallmedizin", zh: "全科与急诊医学" },
    items: [
      "Médecine générale",
      "Médecine d’urgence",
      "Médecine intensive et réanimation",
      "Gériatrie",
      "Médecine du travail",
      "Médecine du sport",
      "Santé publique et médecine sociale",
    ],
  },
  {
    category: { fr: "Spécialités médicales", en: "Medical Specialties", de: "Medizinische Fachgebiete", zh: "内科专科" },
    items: [
      "Cardiologie",
      "Cardiologie interventionnelle",
      "Pneumologie",
      "Gastro-entérologie et hépatologie",
      "Néphrologie",
      "Neurologie",
      "Oncologie médicale",
      "Hématologie",
      "Endocrinologie, diabétologie et nutrition",
      "Rhumatologie",
      "Dermatologie et vénéréologie",
      "Pédiatrie",
      "Psychiatrie",
      "Psychiatrie de l’enfant et de l’adolescent",
      "Infectiologie et maladies tropicales",
      "Médecine physique et de réadaptation (MPR)",
    ],
  },
  {
    category: { fr: "Chirurgie & Spécialités chirurgicales", en: "Surgery & Surgical Specialties", de: "Chirurgie & Chirurgische Fachgebiete", zh: "外科与手术专科" },
    items: [
      "Chirurgie générale",
      "Chirurgie viscérale et digestive",
      "Chirurgie orthopédique et traumatologie",
      "Neurochirurgie",
      "Chirurgie cardiovasculaire et thoracique",
      "Chirurgie plastique, reconstructrice et esthétique",
      "Chirurgie pédiatrique",
      "Chirurgie maxillo-faciale",
      "Urologie",
      "Gynécologie et obstétrique",
      "Ophtalmologie",
      "Oto-rhino-laryngologie (ORL) et chirurgie cervico-faciale",
      "Stomatologie",
    ],
  },
  {
    category: { fr: "Anesthésie, Imagerie & Laboratoire", en: "Anesthesia, Imaging & Laboratory", de: "Anästhesie, Bildgebung & Labor", zh: "麻醉、影像与检验医学" },
    items: [
      "Anesthésie-réanimation",
      "Radiologie et imagerie médicale",
      "Médecine nucléaire",
      "Biologie médicale / Pathologie",
      "Anatomie et cytologie pathologiques",
      "Pharmacologie médicale",
      "Toxicologie",
    ],
  },
  {
    category: { fr: "Soins infirmiers & Paramédical", en: "Nursing & Allied Health", de: "Pflege & Paramedizinische Berufe", zh: "护理与专职医疗" },
    items: [
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
    ],
  },
  {
    category: { fr: "Autre", en: "Other", de: "Sonstige", zh: "其他" },
    items: ["Autre spécialité ou profession"],
  },
] as const;

const copy = {
  fr: {
    eyebrow: "Hippocampus Consulting · Mobilité médicale",
    title: "Votre expertise peut franchir les frontières.",
    intro: "Nous constituons un réseau international de professionnels de santé pour des opportunités sélectionnées en Europe, au Canada et au Moyen-Orient.",
    nav: "Recrutement",
    formTitle: "Déposer votre candidature",
    formIntro: "Envoyez-nous votre profil. Une candidature complète nous permet de vous orienter vers les opportunités pertinentes.",
    firstName: "Prénom", lastName: "Nom", email: "Email professionnel", phone: "Téléphone", specialty: "Spécialité / profession", specialtySearch: "Rechercher une spécialité…", standardPathTitle: "Mobilité médicale internationale", standardPathText: "Hôpitaux, cliniques et établissements de santé en Europe, au Canada et au Moyen-Orient.", vvipPathTitle: "Missions VVIP & Offshore", vvipPathText: "Plateformes pétrolières, sites isolés, entreprises offshore et environnements critiques.", vvipPathCta: "Découvrir le parcours VVIP", specialtyCustom: "Précisez votre spécialité ou profession", countries: "Pays ciblés", languages: "Langues professionnelles", experience: "Années d’expérience", message: "Message ou projet professionnel", cv: "CV (PDF, DOC ou DOCX — 5 Mo maximum)", chooseFile: "Choisir un fichier", noFile: "Aucun fichier sélectionné", gdpr: "J’accepte que mes données soient traitées pour l’examen de ma candidature, y compris par une analyse automatisée d’aide à la présélection, conformément à la politique de confidentialité. Une revue humaine est toujours requise et aucune décision n’est prise uniquement par l’IA.", marketing: "J’accepte de recevoir occasionnellement des informations sur des opportunités professionnelles.", submit: "Envoyer ma candidature", sending: "Envoi en cours…", successTitle: "Candidature reçue", successText: "Votre profil a bien été enregistré. Conservez votre numéro de suivi :", backHome: "Retour au site", required: "Champ obligatoire", consentError: "Votre consentement RGPD est requis.", fileError: "Veuillez joindre un CV au format PDF, DOC ou DOCX de 5 Mo maximum.", genericError: "La candidature n’a pas pu être envoyée. Vérifiez les informations et réessayez.", privacyNote: "Ne transmettez aucune donnée de patient, dossier médical ou information clinique dans ce formulaire.", confidentiality: "Données traitées de manière confidentielle", international: "Opportunités internationales sélectionnées", humanReview: "Examen humain de chaque profil", select: "Sélectionner dans la liste", otherSpecialty: "Autre spécialité ou profession", noMatch: "Aucune spécialité ne correspond à votre recherche.",
    metaTitle: "Recrutement international de professionnels de santé | Hippocampus Consulting", metaDescription: "Déposez votre CV pour être considéré pour des opportunités de recrutement médical en Europe, au Canada et au Moyen-Orient.",
  },
  en: {
    eyebrow: "Hippocampus Consulting · Medical mobility", title: "Your expertise can cross borders.", intro: "We are building an international network of healthcare professionals for selected opportunities in Europe, Canada and the Middle East.", nav: "Recruitment", standardPathTitle: "International medical mobility", standardPathText: "Hospitals, clinics and healthcare institutions across Europe, Canada and the Middle East.", vvipPathTitle: "VVIP & Offshore missions", vvipPathText: "Oil rigs, remote sites, offshore companies and critical environments.", vvipPathCta: "Explore the VVIP pathway", formTitle: "Submit your application", formIntro: "Share your profile with us. A complete application helps us identify relevant opportunities.", firstName: "First name", lastName: "Last name", email: "Professional email", phone: "Phone", specialty: "Specialty / profession", specialtySearch: "Search a specialty…", specialtyCustom: "Specify your specialty or profession", countries: "Target countries", languages: "Professional languages", experience: "Years of experience", message: "Message or professional project", cv: "CV (PDF, DOC or DOCX — 5 MB maximum)", chooseFile: "Choose a file", noFile: "No file selected", gdpr: "I consent to my data being processed to review my application, including automated analysis to assist pre-screening, in accordance with the privacy policy. Human review is always required and no decision is made solely by AI.", marketing: "I agree to occasionally receive information about professional opportunities.", submit: "Submit my application", sending: "Sending…", successTitle: "Application received", successText: "Your profile has been registered. Keep your tracking number:", backHome: "Back to site", required: "Required field", consentError: "GDPR consent is required.", fileError: "Please attach a PDF, DOC or DOCX CV up to 5 MB.", genericError: "Your application could not be sent. Check the information and try again.", privacyNote: "Do not submit patient data, medical records or clinical information through this form.", confidentiality: "Confidential data handling", international: "Selected international opportunities", humanReview: "Human review of every profile", select: "Select from list", otherSpecialty: "Other specialty or profession", noMatch: "No specialty matches your search.",
    metaTitle: "International healthcare recruitment | Hippocampus Consulting", metaDescription: "Submit your CV to be considered for healthcare recruitment opportunities in Europe, Canada and the Middle East.",
  },
  de: {
    eyebrow: "Hippocampus Consulting · Medizinische Mobilität", title: "Ihre Expertise kennt keine Grenzen.", intro: "Wir bauen ein internationales Netzwerk von Gesundheitsfachkräften für ausgewählte Möglichkeiten in Europa, Kanada und dem Nahen Osten auf.", nav: "Recruiting", standardPathTitle: "Internationale medizinische Mobilität", standardPathText: "Krankenhäuser, Kliniken und Gesundheitseinrichtungen in Europa, Kanada und dem Nahen Osten.", vvipPathTitle: "VVIP- & Offshore-Missionen", vvipPathText: "Bohrinseln, abgelegene Standorte, Offshore-Unternehmen und kritische Umgebungen.", vvipPathCta: "VVIP-Pfad entdecken", formTitle: "Bewerbung einreichen", formIntro: "Teilen Sie Ihr Profil mit uns. Eine vollständige Bewerbung erleichtert die Zuordnung zu passenden Möglichkeiten.", firstName: "Vorname", lastName: "Nachname", email: "Berufliche E-Mail", phone: "Telefon", specialty: "Fachgebiet / Beruf", specialtySearch: "Fachgebiet suchen…", specialtyCustom: "Geben Sie Ihr Fachgebiet an", countries: "Zielländer", languages: "Berufssprachen", experience: "Berufserfahrung in Jahren", message: "Nachricht oder berufliches Projekt", cv: "Lebenslauf (PDF, DOC oder DOCX — maximal 5 MB)", chooseFile: "Datei auswählen", noFile: "Keine Datei ausgewählt", gdpr: "Ich stimme der Verarbeitung meiner Daten zur Prüfung meiner Bewerbung einschließlich einer automatisierten Analyse zur Unterstützung der Vorauswahl gemäß der Datenschutzerklärung zu. Eine menschliche Prüfung ist immer erforderlich; keine Entscheidung wird ausschließlich durch KI getroffen.", marketing: "Ich möchte gelegentlich Informationen zu beruflichen Möglichkeiten erhalten.", submit: "Bewerbung senden", sending: "Wird gesendet…", successTitle: "Bewerbung erhalten", successText: "Ihr Profil wurde gespeichert. Bewahren Sie Ihre Referenznummer auf:", backHome: "Zur Website", required: "Pflichtfeld", consentError: "Die RGPD-Zustimmung ist erforderlich.", fileError: "Bitte fügen Sie einen PDF-, DOC- oder DOCX-Lebenslauf bis 5 MB bei.", genericError: "Die Bewerbung konnte nicht gesendet werden. Bitte prüfen Sie die Angaben und versuchen Sie es erneut.", privacyNote: "Übermitteln Sie keine Patientendaten, medizinischen Akten oder klinischen Informationen über dieses Formular.", confidentiality: "Vertrauliche Datenverarbeitung", international: "Ausgewählte internationale Möglichkeiten", humanReview: "Menschliche Prüfung jedes Profils", select: "Aus der Liste wählen", otherSpecialty: "Anderes Fachgebiet", noMatch: "Keine passende Fachgebiet gefunden.",
    metaTitle: "Internationales Recruiting von Gesundheitsfachkräften | Hippocampus Consulting", metaDescription: "Reichen Sie Ihren Lebenslauf für internationale Recruiting-Möglichkeiten in Europa, Kanada und dem Nahen Osten ein.",
  },
  zh: {
    eyebrow: "Hippocampus Consulting · 国际医疗人才流动", title: "让您的专业能力走向国际。", intro: "我们正在建立医疗专业人员国际网络，匹配欧洲、加拿大和中东地区经过筛选的职业机会。", nav: "招聘", standardPathTitle: "国际医疗人才流动", standardPathText: "欧洲、加拿大和中东地区的医院、诊所及医疗机构。 ", vvipPathTitle: "VVIP 与离岸任务", vvipPathText: "石油平台、偏远驻地、离岸企业和高风险环境。", vvipPathCta: "了解 VVIP 任务", formTitle: "提交申请", formIntro: "请分享您的职业资料。完整的申请有助于我们识别合适的机会。", firstName: "名", lastName: "姓", email: "职业邮箱", phone: "电话", specialty: "专业 / 职业", specialtySearch: "搜索专业…", specialtyCustom: "请输入您的专业或职业", countries: "目标国家", languages: "职业语言", experience: "工作年限", message: "留言或职业项目", cv: "简历（PDF、DOC 或 DOCX，最大 5 MB）", chooseFile: "选择文件", noFile: "未选择文件", gdpr: "我同意根据隐私政策处理我的个人数据以审核申请，包括使用自动化分析辅助初步筛选。始终需要人工审核，不会仅依据人工智能作出决定。", marketing: "我同意偶尔接收职业机会相关信息。", submit: "提交申请", sending: "正在发送…", successTitle: "已收到申请", successText: "您的资料已登记。请保存您的跟踪编号：", backHome: "返回网站", required: "必填项", consentError: "需要您的隐私同意。", fileError: "请附加不超过 5 MB 的 PDF、DOC 或 DOCX 简历。", genericError: "申请无法发送。请检查信息后重试。", privacyNote: "请勿在此表单中提交患者数据、病历或临床信息。", confidentiality: "机密数据处理", international: "精选国际机会", humanReview: "人工审核每份资料", select: "从列表中选择", otherSpecialty: "其他专业或职业", noMatch: "未找到符合条件的专业。",
    metaTitle: "International healthcare recruitment | Hippocampus Consulting", metaDescription: "Submit your CV to be considered for healthcare recruitment opportunities in Europe, Canada and the Middle East.",
  },
} as const;

const publicTrustCopy = {
  fr: {
    title: "Votre candidature, traitée avec rigueur",
    confidentiality: "Votre CV est conservé dans un espace privé, accessible uniquement aux personnes habilitées à instruire votre candidature.",
    consent: "Votre consentement est recueilli avant le traitement. Les communications sur les opportunités restent facultatives.",
    humanReview: "L’IA aide à organiser les informations du CV ; l’évaluation du profil et toute décision relèvent exclusivement d’une revue humaine.",
    timeline: "Délai indicatif : une première revue est généralement engagée sous 5 jours ouvrés, selon la mission et le volume de dossiers.",
  },
  en: {
    title: "Your application, handled with care",
    confidentiality: "Your CV is kept in a private area and is accessible only to authorised personnel reviewing your application.",
    consent: "Your consent is collected before processing. Opportunity communications remain optional.",
    humanReview: "AI helps organise CV information; profile assessment and every decision remain exclusively subject to human review.",
    timeline: "Indicative timing: an initial review is generally started within 5 business days, depending on the assignment and application volume.",
  },
  de: {
    title: "Ihre Bewerbung wird sorgfältig behandelt",
    confidentiality: "Ihr Lebenslauf wird in einem privaten Bereich aufbewahrt und ist nur für zur Prüfung Ihrer Bewerbung berechtigte Personen zugänglich.",
    consent: "Ihre Einwilligung wird vor der Verarbeitung eingeholt. Informationen zu beruflichen Möglichkeiten bleiben optional.",
    humanReview: "KI hilft bei der Strukturierung der Lebenslaufinformationen; Profilbewertung und jede Entscheidung unterliegen ausschließlich einer menschlichen Prüfung.",
    timeline: "Unverbindlicher Zeitraum: Eine erste Prüfung beginnt in der Regel innerhalb von 5 Werktagen, abhängig vom Auftrag und der Anzahl der Bewerbungen.",
  },
  zh: {
    title: "您的申请将被审慎处理",
    confidentiality: "您的简历存放于私密区域，仅限获授权审核申请的人员访问。",
    consent: "处理前会征得您的同意；接收职业机会信息完全自愿。",
    humanReview: "人工智能仅协助整理简历信息；资料评估及任何决定均完全由人工审核作出。",
    timeline: "参考时限：我们通常会在 5 个工作日内启动初步审核，具体取决于任务和申请量。",
  },
} as const;

const diplomaCountryCopy = {
  fr: { label: "Pays d’obtention du diplôme", search: "Rechercher un pays dans le monde…" },
  en: { label: "Country where the diploma was obtained", search: "Search any country…" },
  de: { label: "Land des Diplomerwerbs", search: "Land weltweit suchen…" },
  zh: { label: "获得文凭的国家", search: "搜索世界各地的国家…" },
} as const;

type Language = keyof typeof copy;
type FormState = {
  firstName: string; lastName: string; email: string; phone: string; specialty: string; specialtyCustom: string; diplomaCountry: string; targetCountries: string[]; languages: string[]; otherLanguage: string; yearsExperience: string; message: string; gdprConsent: boolean; marketingConsent: boolean; website: string;
};

const initialForm: FormState = { firstName: "", lastName: "", email: "", phone: "", specialty: "", specialtyCustom: "", diplomaCountry: "", targetCountries: [], languages: [], otherLanguage: "", yearsExperience: "", message: "", gdprConsent: false, marketingConsent: false, website: "" };
const MAX_CV_FILE_BYTES = 5 * 1024 * 1024;
const acceptedCvMimeTypes = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const acceptedCvFilename = /\.(pdf|doc|docx)$/i;

/**
 * iOS may expose a valid file chosen from Files without a reliable MIME type.
 * The server still performs signature and MIME validation before it stores the CV.
 */
export function isAcceptedCvFile(file: Pick<File, "name" | "size" | "type"> | null): boolean {
  if (!file || file.size > MAX_CV_FILE_BYTES) return false;
  return acceptedCvMimeTypes.has(file.type) || acceptedCvFilename.test(file.name);
}

const WORLDWIDE_COUNTRY_CODES = "AF,AX,AL,DZ,AS,AD,AO,AI,AQ,AG,AR,AM,AW,AU,AT,AZ,BS,BH,BD,BB,BY,BE,BZ,BJ,BM,BT,BO,BQ,BA,BW,BV,BR,IO,BN,BG,BF,BI,CV,KH,CM,CA,KY,CF,TD,CL,CN,CX,CC,CO,KM,CG,CD,CK,CR,CI,HR,CU,CW,CY,CZ,DK,DJ,DM,DO,EC,EG,SV,GQ,ER,EE,SZ,ET,FK,FO,FJ,FI,FR,GF,PF,TF,GA,GM,GE,DE,GH,GI,GR,GL,GD,GP,GU,GT,GG,GN,GW,GY,HT,HM,VA,HN,HK,HU,IS,IN,ID,IR,IQ,IE,IM,IL,IT,JM,JP,JE,JO,KZ,KE,KI,KP,KR,KW,KG,LA,LV,LB,LS,LR,LY,LI,LT,LU,MO,MG,MW,MY,MV,ML,MT,MH,MQ,MR,MU,YT,MX,FM,MD,MC,MN,ME,MS,MA,MZ,MM,NA,NR,NP,NL,NC,NZ,NI,NE,NG,NU,NF,MK,MP,NO,OM,PK,PW,PS,PA,PG,PY,PE,PH,PN,PL,PT,PR,QA,RE,RO,RU,RW,BL,SH,KN,LC,MF,PM,VC,WS,SM,ST,SA,SN,RS,SC,SL,SG,SX,SK,SI,SB,SO,ZA,GS,SS,ES,LK,SD,SR,SJ,SE,CH,SY,TW,TJ,TZ,TH,TL,TG,TK,TO,TT,TN,TR,TM,TC,TV,UG,UA,AE,GB,US,UM,UY,UZ,VU,VE,VN,VG,VI,WF,EH,YE,ZM,ZW".split(",");

export function getWorldwideCountries(locale: string) {
  const supportedRegions = WORLDWIDE_COUNTRY_CODES;
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return supportedRegions.filter(code => code !== "ZZ").map(code => ({ code, label: names.of(code) || code })).sort((a, b) => a.label.localeCompare(b.label, locale));
}

function normalizeCountrySearch(value: string, locale: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(locale).trim();
}

export function filterWorldwideCountries(countries: ReturnType<typeof getWorldwideCountries>, query: string, locale: string) {
  const search = normalizeCountrySearch(query, locale);
  if (!search) return countries;

  const aliases = ["fr", "en", "de", "zh"];
  return countries.filter(country => {
    const values = [country.code, country.label, ...aliases.map(alias => new Intl.DisplayNames([alias], { type: "region" }).of(country.code) || country.code)];
    return values.some(value => normalizeCountrySearch(value, locale).includes(search));
  });
}

export default function RecruitmentPage() {
  const { language } = useLanguage();
  const lang = (language in copy ? language : "fr") as Language;
  const t = copy[lang];
  const trust = publicTrustCopy[lang];
  const diplomaCopy = diplomaCountryCopy[lang];
  const [form, setForm] = useState<FormState>(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [specialtyQuery, setSpecialtyQuery] = useState("");
  const [diplomaCountryQuery, setDiplomaCountryQuery] = useState("");
  const [diplomaCountryOpen, setDiplomaCountryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const diplomaCountryPickerRef = useRef<HTMLDivElement>(null);

  const selectedCountryLabels = useMemo(() => countryOptions.filter(country => form.targetCountries.includes(country.value)).map(country => country.labels[lang]).join(", "), [form.targetCountries, lang]);
  const worldwideCountries = useMemo(() => getWorldwideCountries(lang), [lang]);
  const filteredDiplomaCountries = useMemo(() => filterWorldwideCountries(worldwideCountries, diplomaCountryQuery, lang).slice(0, 30), [worldwideCountries, diplomaCountryQuery, lang]);

  const filteredSpecialtyCategories = useMemo(() => {
    const q = specialtyQuery.trim().toLowerCase();
    if (!q) return specialtyCategories;
    return specialtyCategories.map(group => {
      const filteredItems = group.items.filter(item => item.toLowerCase().includes(q) || group.category.fr.toLowerCase().includes(q));
      return { ...group, items: filteredItems };
    }).filter(group => group.items.length > 0);
  }, [specialtyQuery]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(previous => ({ ...previous, [key]: value }));
    setInvalidFields(previous => { const next = new Set(previous); next.delete(key); return next; });
  };
  const isInvalid = (field: string) => validationAttempted && invalidFields.has(field);

  useEffect(() => {
    const closePicker = (event: MouseEvent) => {
      if (!diplomaCountryPickerRef.current?.contains(event.target as Node)) setDiplomaCountryOpen(false);
    };
    document.addEventListener("mousedown", closePicker);
    return () => document.removeEventListener("mousedown", closePicker);
  }, []);

  const toggleCountry = (country: string) => {
    update("targetCountries", form.targetCountries.includes(country) ? form.targetCountries.filter(item => item !== country) : [...form.targetCountries, country]);
  };

  const toggleProfessionalLanguage = (languageValue: string) => {
    update("languages", form.languages.includes(languageValue) ? form.languages.filter(item => item !== languageValue) : [...form.languages, languageValue]);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setValidationAttempted(true);
    const submittedDiplomaCountry = resolveCountryForSubmission(form.diplomaCountry, new FormData(event.currentTarget).get("diplomaCountry"), worldwideCountries.map(country => country.label));
    const finalSpecialty = form.specialty === "Autre spécialité ou profession" ? form.specialtyCustom.trim() : form.specialty;
    const nextInvalidFields = new Set<string>();
    if (!form.firstName.trim()) nextInvalidFields.add("firstName");
    if (!form.lastName.trim()) nextInvalidFields.add("lastName");
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) nextInvalidFields.add("email");
    if (!finalSpecialty) nextInvalidFields.add("specialty");
    if (!submittedDiplomaCountry) nextInvalidFields.add("diplomaCountry");
    if (!form.targetCountries.length) nextInvalidFields.add("targetCountries");
    if (!file || !isAcceptedCvFile(file)) nextInvalidFields.add("cv");
    if (!form.gdprConsent) nextInvalidFields.add("gdprConsent");
    if (nextInvalidFields.size) {
      setInvalidFields(nextInvalidFields);
      setStatus("error"); setErrorMessage(`${t.required}.`); return;
    }
    setInvalidFields(new Set());
    if (!file) return;

    const body = new FormData();
    body.append("cv", file);
    body.append("firstName", form.firstName);
    body.append("lastName", form.lastName);
    body.append("email", form.email);
    body.append("phone", form.phone);
    body.append("specialty", finalSpecialty);
    body.append("diplomaCountry", submittedDiplomaCountry);
    body.append("targetCountries", JSON.stringify(form.targetCountries));
    const submittedLanguages = form.languages.flatMap(languageValue => languageValue === "Other"
      ? form.otherLanguage.split(",").map(item => item.trim()).filter(Boolean)
      : [languageValue]);
    body.append("languages", JSON.stringify(submittedLanguages));
    body.append("yearsExperience", form.yearsExperience);
    body.append("message", form.message);
    body.append("gdprConsent", form.gdprConsent ? "1" : "0");
    body.append("marketingConsent", form.marketingConsent ? "1" : "0");
    body.append("website", form.website);

    setStatus("sending");
    try {
      const response = await fetch("/api/recruitment/apply", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t.genericError);
      setTrackingId(payload.trackingId || "");
      setValidationAttempted(false);
      setStatus("success");
    } catch (submissionError) {
      setStatus("error"); setErrorMessage(submissionError instanceof Error ? submissionError.message : t.genericError);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={t.metaTitle} description={t.metaDescription} ogUrl="https://drahmedbenlallahom.com/recruitment" />
      <Navigation />
      <main className="recruitment-page pt-28 md:pt-36">
        <section className="container grid gap-12 pb-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="relative isolate overflow-hidden rounded-3xl lg:sticky lg:top-32">
            <img src="/manus-storage/hippocampus-recruitment-earth_f3124b59.png" alt="" aria-hidden="true" className="pointer-events-none absolute -right-28 top-4 h-[30rem] w-[23rem] rounded-full object-cover opacity-35 mix-blend-screen [mask-image:radial-gradient(ellipse_at_center,black_36%,transparent_72%)]" />
            <p className="section-kicker">{t.eyebrow}</p>
            <h1 className="mt-5 max-w-2xl font-display text-4xl leading-tight text-foreground md:text-6xl">{t.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">{t.intro}</p>
            <div className="mt-10 grid gap-3">
              {[{ icon: Globe2, text: t.international }, { icon: ShieldCheck, text: t.confidentiality }, { icon: UsersRound, text: t.humanReview }].map(item => { const Icon = item.icon; return <div key={item.text} className="editorial-card flex items-center gap-3 p-4"><Icon className="h-5 w-5 shrink-0 text-primary" /><span className="text-sm text-foreground">{item.text}</span></div>; })}
            </div>
            <section className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5" aria-labelledby="recruitment-public-trust-title">
              <h2 id="recruitment-public-trust-title" className="font-display text-xl text-foreground">{trust.title}</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{trust.confidentiality}</span></li>
                <li className="flex gap-3"><UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{trust.consent}</span></li>
                <li className="flex gap-3"><UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{trust.humanReview}</span></li>
                <li className="flex gap-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{trust.timeline}</span></li>
              </ul>
            </section>
            <p className="mt-8 text-sm text-muted-foreground">{t.privacyNote}</p>
          </div>

          <div className="editorial-card p-5 md:p-8">
            {status === "success" ? (
              <div className="py-10 text-center" role="status">
                <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
                <h2 className="mt-5 font-display text-3xl text-foreground">{t.successTitle}</h2>
                <p className="mx-auto mt-3 max-w-md text-muted-foreground">{t.successText}</p>
                <p className="mt-4 rounded-lg bg-primary/10 px-4 py-3 font-mono text-lg font-semibold text-primary">{trackingId}</p>
                <Link href="/" className="cta-primary mt-8 inline-flex">{t.backHome}</Link>
              </div>
            ) : (
              <>
                <h2 className="font-display text-3xl text-foreground">{t.formTitle}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.formIntro}</p>
                <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
                  <div className="grid gap-5 sm:grid-cols-2">
                    {[{ key: "firstName" as const, label: t.firstName }, { key: "lastName" as const, label: t.lastName }].map(field => <label key={field.key} className="recruitment-field-group"><span>{field.label} *</span><input id={`recruitment-${field.key}`} required value={form[field.key]} aria-invalid={isInvalid(field.key)} onChange={event => update(field.key, event.target.value)} className={`recruitment-field ${isInvalid(field.key) ? "form-field-invalid" : ""}`} autoComplete={field.key === "firstName" ? "given-name" : "family-name"} /></label>)}
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="recruitment-field-group"><span>{lang === "fr" ? "Email" : t.email} *</span><input id="recruitment-email" type="email" required value={form.email} aria-invalid={isInvalid("email")} onChange={event => update("email", event.target.value)} className={`recruitment-field ${isInvalid("email") ? "form-field-invalid" : ""}`} autoComplete="email" /></label>
                    <label className="recruitment-field-group"><span>{t.phone}</span><input id="recruitment-phone" type="tel" value={form.phone} onChange={event => update("phone", event.target.value)} className="recruitment-field" autoComplete="tel" /></label>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="recruitment-field-group">
                      <span>{t.specialty} *</span>
                      <div className="site-search-shell">
                        <Search className="site-search-icon" aria-hidden="true" />
                        <input
                          type="text"
                          value={specialtyQuery}
                          onChange={event => setSpecialtyQuery(event.target.value)}
                          placeholder={t.specialtySearch}
                          className={`recruitment-field site-search-input text-sm ${specialtyQuery ? "site-search-input-with-clear" : ""}`}
                        />
                        {specialtyQuery && (
                          <button
                            type="button"
                            onClick={() => setSpecialtyQuery("")}
                            className="site-search-clear"
                            aria-label="Effacer la recherche de spécialité"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <select id="recruitment-specialty" required value={form.specialty} aria-invalid={isInvalid("specialty")} onChange={event => update("specialty", event.target.value)} className={`recruitment-field ${isInvalid("specialty") ? "form-field-invalid" : ""}`}>
                        <option value="">{t.select}</option>
                        {filteredSpecialtyCategories.length === 0 ? (
                          <option value="" disabled>{t.noMatch}</option>
                        ) : (
                          filteredSpecialtyCategories.map(group => (
                            <optgroup key={group.category.fr} label={group.category[lang] || group.category.fr}>
                              {group.items.map(item => <option key={item} value={item}>{item}</option>)}
                            </optgroup>
                          ))
                        )}
                      </select>
                      {form.specialty && form.specialty !== "Autre spécialité ou profession" && (
                        <p className="mt-1.5 text-xs text-primary font-medium">Sélectionné : {form.specialty}</p>
                      )}
                    </div>
                    
                    <label className="recruitment-field-group">
                      <span>{t.experience}</span>
                      <input id="recruitment-experience" type="number" min="0" max="70" value={form.yearsExperience} onChange={event => update("yearsExperience", event.target.value)} className="recruitment-field" />
                    </label>
                  </div>

                  <div ref={diplomaCountryPickerRef} className="recruitment-field-group relative">
                    <span>{diplomaCopy.label} *</span>
                    <div className="site-search-shell">
                      <Search className="site-search-icon" aria-hidden="true" />
                      <input
                        id="recruitment-diploma-country-search"
                        name="diplomaCountry"
                        type="search"
                        value={diplomaCountryQuery}
                        onFocus={() => setDiplomaCountryOpen(true)}
                        onInput={event => { const visibleCountry = event.currentTarget.value; const matchingCountry = worldwideCountries.find(country => country.label === visibleCountry); if (matchingCountry) update("diplomaCountry", matchingCountry.label); }}
                        onChange={event => { setDiplomaCountryQuery(event.target.value); setDiplomaCountryOpen(true); }}
                        onKeyDown={event => { if (event.key === "Escape") setDiplomaCountryOpen(false); }}
                        placeholder={diplomaCopy.search}
                        aria-invalid={isInvalid("diplomaCountry")}
                        className={`recruitment-field site-search-input ${diplomaCountryQuery ? "site-search-input-with-clear" : ""} ${isInvalid("diplomaCountry") ? "form-field-invalid" : ""}`}
                        role="combobox"
                        aria-expanded={diplomaCountryOpen}
                        aria-controls="recruitment-diploma-country-options"
                        aria-autocomplete="list"
                      />
                      {diplomaCountryQuery && <button type="button" onClick={() => { setDiplomaCountryQuery(""); setDiplomaCountryOpen(true); }} className="site-search-clear" aria-label="Effacer la recherche"><X className="h-4 w-4" /></button>}
                    </div>
                    {form.diplomaCountry && <p className="text-xs font-medium text-primary">{diplomaCopy.label} : {form.diplomaCountry}</p>}
                    {diplomaCountryOpen && (
                      <div id="recruitment-diploma-country-options" role="listbox" aria-label={diplomaCopy.label} className="recruitment-country-options">
                        {filteredDiplomaCountries.length > 0 ? filteredDiplomaCountries.map(country => (
                          <button key={country.code} type="button" role="option" aria-selected={form.diplomaCountry === country.label} className="recruitment-country-option" onClick={() => { update("diplomaCountry", country.label); setDiplomaCountryQuery(country.label); setDiplomaCountryOpen(false); }}>
                            <span>{country.label}</span><span className="text-xs text-muted-foreground">{country.code}</span>
                          </button>
                        )) : <p className="px-4 py-3 text-sm text-muted-foreground">{t.noMatch}</p>}
                      </div>
                    )}
                  </div>

                  {form.specialty === "Autre spécialité ou profession" && (
                    <label className="recruitment-field-group animate-in fade-in duration-200">
                      <span>{t.specialtyCustom} *</span>
                      <input id="recruitment-specialty-custom" required value={form.specialtyCustom} aria-invalid={isInvalid("specialty")} onChange={event => update("specialtyCustom", event.target.value)} placeholder="Ex. Perfusionniste, Audioprothésiste, etc." className={`recruitment-field ${isInvalid("specialty") ? "form-field-invalid" : ""}`} />
                    </label>
                  )}

                  <fieldset className={isInvalid("targetCountries") ? "form-consent-group-invalid" : ""}><legend className="mb-3 text-sm font-medium text-foreground">{t.countries} *</legend><div className="grid gap-2 sm:grid-cols-2">{countryOptions.map(country => <label key={country.value} className="form-consent-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground"><input type="checkbox" checked={form.targetCountries.includes(country.value)} onChange={() => toggleCountry(country.value)} className="form-consent-checkbox" />{country.labels[lang]}</label>)}</div><p className="sr-only">{selectedCountryLabels}</p></fieldset>
                  
                  <fieldset>
                    <legend className="mb-3 text-sm font-medium text-foreground">{t.languages}</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {professionalLanguageOptions.map(option => <label key={option.value} className="form-consent-item flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/45">
                        <input type="checkbox" checked={form.languages.includes(option.value)} onChange={() => toggleProfessionalLanguage(option.value)} className="form-consent-checkbox" />
                        {option.labels[lang]}
                      </label>)}
                    </div>
                    {form.languages.includes("Other") && <label className="recruitment-field-group mt-4 animate-in fade-in duration-200"><span>{otherLanguageLabel[lang]}</span><input id="recruitment-other-language" value={form.otherLanguage} onChange={event => update("otherLanguage", event.target.value)} placeholder="Ex. Italien, russe…" className="recruitment-field" /></label>}
                  </fieldset>
                  
                  <label className="recruitment-field-group">
                    <span>{t.message}</span>
                    <textarea id="recruitment-message" value={form.message} onChange={event => update("message", event.target.value)} className="recruitment-field min-h-28 resize-y" maxLength={5000} />
                  </label>
                  
                  <div className={`rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 ${isInvalid("cv") ? "form-file-invalid" : ""}`}><label htmlFor="recruitment-cv" className="flex cursor-pointer items-center gap-3 text-sm font-medium text-foreground"><FileUp className="h-5 w-5 text-primary" /><span>{file ? file.name : t.chooseFile}</span><input ref={fileInputRef} id="recruitment-cv" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { setFile(event.target.files?.[0] || null); setInvalidFields(previous => { const next = new Set(previous); next.delete("cv"); return next; }); }} className="sr-only" required /></label><p className="mt-2 text-xs text-muted-foreground">{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : t.cv}</p></div>
                  <label className={`form-consent-item flex items-start gap-3 text-sm text-muted-foreground ${isInvalid("gdprConsent") ? "form-consent-item-invalid" : ""}`}><input type="checkbox" checked={form.gdprConsent} aria-invalid={isInvalid("gdprConsent")} onChange={event => update("gdprConsent", event.target.checked)} className="form-consent-checkbox mt-1" required /><span>{t.gdpr}</span></label>
                  <label className="form-consent-item flex items-start gap-3 text-sm text-muted-foreground"><input type="checkbox" checked={form.marketingConsent} onChange={event => update("marketingConsent", event.target.checked)} className="form-consent-checkbox mt-1" /><span>{t.marketing}</span></label>
                  <label className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true"><span>Website</span><input tabIndex={-1} autoComplete="off" value={form.website} onChange={event => update("website", event.target.value)} /></label>
                  {status === "error" && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{errorMessage}</p>}
                  <button type="submit" disabled={status === "sending"} className="cta-primary w-full justify-center">{status === "sending" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.sending}</> : t.submit}</button>
                </form>
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
