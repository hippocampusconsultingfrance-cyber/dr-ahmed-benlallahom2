import { isPublicTestimonialsEnabled } from "@shared/publicFeatures";
import { venturesEn } from "@/data/ventures-en";
import { venturesFr } from "@/data/ventures-fr";

type SearchLanguage = "fr" | "en" | "de" | "zh";
type Localized<T> = Record<SearchLanguage, T>;

export type PublicSearchEntry = {
  href: string;
  title: Localized<string>;
  description: Localized<string>;
  keywords: Localized<string[]>;
};

/**
 * Index de la recherche du site (PUB-SEARCH-01) : toutes les pages publiques, avec les mots
 * que les visiteurs tapent réellement (anesthésie, réanimation, jeûne, tarif, IADE…) dans
 * les 4 langues. La recherche ignore accents et majuscules et accepte les mots partiels.
 */
const staticEntries: PublicSearchEntry[] = [
  {
    href: "/",
    title: { fr: "Accueil", en: "Home", de: "Startseite", zh: "首页" },
    description: {
      fr: "Présentation du Dr Ahmed Ben Lallahom, anesthésiste-réanimateur, et de ses activités",
      en: "About Dr Ahmed Ben Lallahom, anaesthesiologist and intensive care physician",
      de: "Profil von Dr. Ahmed Ben Lallahom, Anästhesist und Intensivmediziner",
      zh: "Ahmed Ben Lallahom 医生简介：麻醉与重症医学",
    },
    keywords: {
      fr: ["docteur", "médecin", "anesthésiste", "réanimateur", "anesthésie-réanimation", "réanimation", "desaic", "ben lallahom", "parcours", "expérience", "formation", "contact", "téléphone", "email"],
      en: ["doctor", "physician", "anaesthesiologist", "anesthesiologist", "anaesthesia", "anesthesia", "intensive care", "critical care", "desaic", "ben lallahom", "experience", "education", "contact", "phone", "email"],
      de: ["arzt", "ärztin", "anästhesist", "anästhesie", "intensivmedizin", "desaic", "ben lallahom", "werdegang", "erfahrung", "ausbildung", "kontakt", "telefon", "e-mail"],
      zh: ["医生", "麻醉", "麻醉医生", "重症", "重症医学", "desaic", "ben lallahom", "经历", "教育", "联系", "电话", "邮箱"],
    },
  },
  {
    href: "/booking",
    title: { fr: "Réserver une consultation", en: "Book a consultation", de: "Beratung buchen", zh: "预约咨询" },
    description: {
      fr: "Consultation de conseil en santé : créneaux, tarifs, paiement en ligne et facture",
      en: "Health advice consultation: time slots, fees, online payment and invoice",
      de: "Gesundheitsberatung: Termine, Honorare, Online-Zahlung und Rechnung",
      zh: "健康咨询：时间段、费用、在线付款与发票",
    },
    keywords: {
      fr: ["réserver", "réservation", "rendez-vous", "rdv", "consultation", "téléconsultation", "conseil médical", "tarif", "prix", "honoraires", "coût", "paiement", "facture", "annulation", "remboursement", "créneau", "anesthésie"],
      en: ["book", "booking", "appointment", "consultation", "teleconsultation", "medical advice", "fee", "price", "cost", "rate", "payment", "invoice", "cancellation", "refund", "slot", "anaesthesia", "anesthesia"],
      de: ["buchen", "buchung", "termin", "beratung", "telekonsultation", "medizinische beratung", "honorar", "preis", "kosten", "tarif", "zahlung", "rechnung", "stornierung", "erstattung", "anästhesie"],
      zh: ["预约", "挂号", "咨询", "远程咨询", "医疗建议", "费用", "价格", "收费", "付款", "发票", "取消", "退款", "时间", "麻醉"],
    },
  },
  {
    href: "/questions-anesthesie",
    title: { fr: "Questions santé : anesthésie et opération", en: "Health questions: anaesthesia and surgery", de: "Gesundheitsfragen: Anästhesie und Operation", zh: "健康问答：麻醉与手术" },
    description: {
      fr: "Poser une question générale sur l’anesthésie ou une opération et lire les réponses publiées",
      en: "Ask a general question about anaesthesia or surgery and read published answers",
      de: "Allgemeine Frage zu Anästhesie oder Operation stellen und veröffentlichte Antworten lesen",
      zh: "就麻醉或手术提出一般性问题并阅读已发布的回答",
    },
    keywords: {
      fr: ["anesthésie", "anesthésie générale", "anesthésie locale", "anesthésie locorégionale", "rachianesthésie", "péridurale", "sédation", "réanimation", "opération", "chirurgie", "intervention", "bloc opératoire", "jeûne", "à jeun", "boire", "manger", "préparation", "consultation pré-anesthésique", "réveil", "douleur", "nausées", "allergie", "question santé", "question gratuite", "information santé"],
      en: ["anaesthesia", "anesthesia", "general anaesthesia", "general anesthesia", "local anaesthesia", "spinal", "epidural", "sedation", "intensive care", "surgery", "operation", "procedure", "fasting", "nil by mouth", "drink", "eat", "preparation", "pre-anaesthetic assessment", "recovery", "pain", "nausea", "allergy", "health question", "free question"],
      de: ["anästhesie", "narkose", "vollnarkose", "regionalanästhesie", "spinalanästhesie", "periduralanästhesie", "sedierung", "intensivmedizin", "operation", "chirurgie", "eingriff", "nüchtern", "fasten", "trinken", "essen", "vorbereitung", "prämedikation", "aufwachen", "schmerz", "übelkeit", "allergie", "gesundheitsfrage"],
      zh: ["麻醉", "全身麻醉", "全麻", "局部麻醉", "腰麻", "硬膜外", "镇静", "重症", "手术", "外科", "禁食", "空腹", "喝水", "进食", "术前准备", "苏醒", "疼痛", "恶心", "过敏", "健康问题", "免费提问"],
    },
  },
  {
    href: "/recruitment",
    title: { fr: "Recrutement médical international", en: "International medical recruitment", de: "Internationale medizinische Rekrutierung", zh: "国际医疗招聘" },
    description: {
      fr: "Opportunités pour médecins, infirmiers et paramédicaux avec Hippocampus Consulting",
      en: "Opportunities for doctors, nurses and allied health professionals with Hippocampus Consulting",
      de: "Stellen für Ärzte, Pflegekräfte und Gesundheitsfachberufe mit Hippocampus Consulting",
      zh: "Hippocampus Consulting 为医生、护士及辅助医疗人员提供的机会",
    },
    keywords: {
      fr: ["recrutement", "emploi", "poste", "carrière", "offre", "médecin", "infirmier", "infirmière", "iade", "ibode", "sage-femme", "kinésithérapeute", "paramédical", "soignant", "international", "mobilité", "étranger", "hippocampus"],
      en: ["recruitment", "job", "position", "career", "vacancy", "doctor", "physician", "nurse", "nurse anaesthetist", "crna", "midwife", "physiotherapist", "allied health", "international", "mobility", "abroad", "hippocampus"],
      de: ["rekrutierung", "recruiting", "stelle", "job", "karriere", "arzt", "pflegekraft", "krankenpfleger", "anästhesiepflege", "hebamme", "physiotherapeut", "gesundheitsberufe", "international", "mobilität", "ausland", "hippocampus"],
      zh: ["招聘", "工作", "职位", "职业", "医生", "护士", "麻醉护士", "助产士", "物理治疗师", "辅助医疗", "国际", "海外", "hippocampus"],
    },
  },
  {
    href: "/recruitment/standard",
    title: { fr: "Déposer une candidature", en: "Apply now", de: "Bewerbung einreichen", zh: "提交申请" },
    description: {
      fr: "Formulaire de candidature et dépôt de CV pour les postes médicaux et paramédicaux",
      en: "Application form and CV upload for medical and allied health positions",
      de: "Bewerbungsformular und Lebenslauf-Upload für medizinische Stellen",
      zh: "医疗及辅助医疗职位的申请表与简历上传",
    },
    keywords: {
      fr: ["candidature", "postuler", "cv", "dépôt de cv", "curriculum", "formulaire", "infirmier", "iade", "médecin", "paramédical", "diplôme", "langues"],
      en: ["application", "apply", "cv", "resume", "upload", "form", "nurse", "doctor", "allied health", "diploma", "languages"],
      de: ["bewerbung", "bewerben", "lebenslauf", "cv", "hochladen", "formular", "pflegekraft", "arzt", "diplom", "sprachen"],
      zh: ["申请", "投递", "简历", "上传", "表格", "护士", "医生", "文凭", "语言"],
    },
  },
  {
    href: "/recruitment/vvip-offshore",
    title: { fr: "Missions VVIP et offshore", en: "VVIP and offshore missions", de: "VVIP- und Offshore-Einsätze", zh: "VVIP 与离岸任务" },
    description: { fr: "Candidatures pour environnements offshore, industriels et Moyen-Orient", en: "Applications for offshore, industrial and Middle East assignments", de: "Bewerbungen für Offshore-, Industrie- und Nahost-Einsätze", zh: "离岸、工业及中东任务申请" },
    keywords: {
      fr: ["offshore", "plateforme", "plateforme pétrolière", "moyen-orient", "golfe", "vvip", "mission", "médecin offshore", "infirmier offshore", "industrie", "site isolé"],
      en: ["offshore", "oil rig", "platform", "middle east", "gulf", "vvip", "assignment", "offshore doctor", "offshore nurse", "industrial", "remote site"],
      de: ["offshore", "bohrinsel", "plattform", "naher osten", "golf", "vvip", "einsatz", "offshore-arzt", "industrie", "abgelegener standort"],
      zh: ["离岸", "石油平台", "平台", "中东", "海湾", "vvip", "任务", "离岸医生", "工业", "偏远"],
    },
  },
  {
    href: "/employers",
    title: { fr: "Employeurs : recruter des soignants", en: "Employers: hire healthcare staff", de: "Arbeitgeber: Gesundheitspersonal rekrutieren", zh: "雇主：招聘医护人员" },
    description: { fr: "Confier un besoin de recrutement médical ou paramédical", en: "Submit a medical or allied health recruitment need", de: "Medizinischen Rekrutierungsbedarf melden", zh: "提交医疗或辅助医疗招聘需求" },
    keywords: {
      fr: ["employeur", "établissement", "clinique", "hôpital", "recruter", "besoin", "brief", "mission", "shortlist", "soignants", "cabinet de recrutement"],
      en: ["employer", "facility", "clinic", "hospital", "hire", "staffing", "need", "brief", "shortlist", "healthcare staff", "recruitment agency"],
      de: ["arbeitgeber", "einrichtung", "klinik", "krankenhaus", "rekrutieren", "bedarf", "brief", "shortlist", "personal"],
      zh: ["雇主", "机构", "诊所", "医院", "招聘", "需求", "候选名单", "医护人员"],
    },
  },
  {
    href: "/why-hippocampus",
    title: { fr: "Pourquoi Hippocampus Consulting", en: "Why Hippocampus Consulting", de: "Warum Hippocampus Consulting", zh: "为什么选择 Hippocampus Consulting" },
    description: { fr: "Méthode, confidentialité et accompagnement pour les employeurs", en: "Method, confidentiality and support for employers", de: "Methode, Vertraulichkeit und Begleitung für Arbeitgeber", zh: "面向雇主的方法、保密与支持" },
    keywords: {
      fr: ["pourquoi", "méthode", "confidentialité", "accompagnement", "cabinet", "hippocampus consulting", "recrutement"],
      en: ["why", "method", "confidentiality", "support", "agency", "hippocampus consulting", "recruitment"],
      de: ["warum", "methode", "vertraulichkeit", "begleitung", "hippocampus consulting", "rekrutierung"],
      zh: ["为什么", "方法", "保密", "支持", "hippocampus consulting", "招聘"],
    },
  },
  {
    href: "/candidate/access",
    title: { fr: "Espace candidat", en: "Candidate portal", de: "Kandidatenbereich", zh: "候选人空间" },
    description: { fr: "Créer ou accéder à un espace sécurisé pour vos documents", en: "Create or access a secure area for your documents", de: "Geschützten Bereich für Ihre Dokumente erstellen oder öffnen", zh: "创建或访问存放文件的安全空间" },
    keywords: {
      fr: ["candidat", "espace", "compte", "connexion", "mot de passe", "documents", "coffre", "invitation", "sécurité"],
      en: ["candidate", "portal", "account", "login", "sign in", "password", "documents", "vault", "invitation", "security"],
      de: ["kandidat", "bereich", "konto", "anmeldung", "passwort", "dokumente", "einladung", "sicherheit"],
      zh: ["候选人", "空间", "账户", "登录", "密码", "文件", "邀请", "安全"],
    },
  },
  {
    href: "/faq",
    title: { fr: "Questions fréquentes", en: "Frequently asked questions", de: "Häufige Fragen", zh: "常见问题" },
    description: { fr: "Réponses pratiques : consultation, paiement, annulation, recrutement", en: "Practical answers: consultation, payment, cancellation, recruitment", de: "Praktische Antworten: Beratung, Zahlung, Stornierung, Rekrutierung", zh: "实用解答：咨询、付款、取消、招聘" },
    keywords: {
      fr: ["faq", "question", "questions fréquentes", "aide", "annulation", "urgence", "délai", "tarif", "paiement", "remboursement"],
      en: ["faq", "question", "help", "cancellation", "emergency", "delay", "fee", "payment", "refund"],
      de: ["faq", "frage", "hilfe", "stornierung", "notfall", "frist", "honorar", "zahlung", "erstattung"],
      zh: ["常见问题", "问题", "帮助", "取消", "紧急", "期限", "费用", "付款", "退款"],
    },
  },
  {
    href: "/resources",
    title: { fr: "Ressources médicales", en: "Medical resources", de: "Medizinische Ressourcen", zh: "医疗资源" },
    description: { fr: "Sources institutionnelles fiables (HAS, OMS, ECDC) pour s’informer", en: "Reliable institutional sources (HAS, WHO, ECDC)", de: "Verlässliche institutionelle Quellen (HAS, WHO, ECDC)", zh: "可靠的官方信息来源（HAS、WHO、ECDC）" },
    keywords: {
      fr: ["ressources", "sources", "liens utiles", "has", "oms", "ecdc", "information santé", "officiel"],
      en: ["resources", "sources", "useful links", "has", "who", "ecdc", "health information", "official"],
      de: ["ressourcen", "quellen", "nützliche links", "has", "who", "ecdc", "gesundheitsinformation", "offiziell"],
      zh: ["资源", "来源", "链接", "has", "who", "ecdc", "健康信息", "官方"],
    },
  },
  {
    href: "/press",
    title: { fr: "Presse et publications", en: "Press and publications", de: "Presse und Publikationen", zh: "媒体与出版物" },
    description: { fr: "Informations institutionnelles sur le parcours et les activités", en: "Institutional information about background and activities", de: "Institutionelle Informationen zu Werdegang und Tätigkeiten", zh: "关于经历与活动的机构信息" },
    keywords: {
      fr: ["presse", "publications", "médias", "journaliste", "biographie", "parcours"],
      en: ["press", "publications", "media", "journalist", "biography", "background"],
      de: ["presse", "publikationen", "medien", "journalist", "biografie", "werdegang"],
      zh: ["媒体", "出版物", "新闻", "记者", "简历", "经历"],
    },
  },
  {
    href: "/gdpr",
    title: { fr: "Exercer mes droits RGPD", en: "Exercise my GDPR rights", de: "Meine DSGVO-Rechte ausüben", zh: "行使我的 GDPR 权利" },
    description: { fr: "Formulaire de demande : accès, rectification, effacement de vos données", en: "Request form: access, rectification, erasure of your data", de: "Antragsformular: Auskunft, Berichtigung, Löschung Ihrer Daten", zh: "申请表：访问、更正、删除您的数据" },
    keywords: {
      fr: ["rgpd", "données personnelles", "droits", "accès", "rectification", "effacement", "suppression", "opposition", "portabilité", "confidentialité", "demande rgpd"],
      en: ["gdpr", "personal data", "rights", "access", "rectification", "erasure", "deletion", "objection", "portability", "privacy"],
      de: ["dsgvo", "personenbezogene daten", "rechte", "auskunft", "berichtigung", "löschung", "widerspruch", "datenübertragbarkeit", "datenschutz"],
      zh: ["gdpr", "个人数据", "权利", "访问", "更正", "删除", "反对", "可携带", "隐私"],
    },
  },
  {
    href: "/legal",
    title: { fr: "Mentions légales et confidentialité", en: "Legal notice and privacy", de: "Impressum und Datenschutz", zh: "法律声明与隐私" },
    description: { fr: "Éditeur, hébergeur, politique de confidentialité, cookies et CGU", en: "Publisher, host, privacy policy, cookies and terms of use", de: "Herausgeber, Hosting, Datenschutz, Cookies und Nutzungsbedingungen", zh: "发布者、托管方、隐私政策、Cookie 与使用条款" },
    keywords: {
      fr: ["mentions légales", "légal", "éditeur", "hébergeur", "confidentialité", "politique de confidentialité", "cookies", "cgu", "conditions", "sarl", "siège"],
      en: ["legal notice", "legal", "publisher", "host", "privacy", "privacy policy", "cookies", "terms", "conditions"],
      de: ["impressum", "recht", "herausgeber", "hosting", "datenschutz", "datenschutzerklärung", "cookies", "nutzungsbedingungen"],
      zh: ["法律", "声明", "发布者", "托管", "隐私", "隐私政策", "cookie", "条款"],
    },
  },
];

const testimonialsEntry: PublicSearchEntry = {
  href: "/testimonials",
  title: { fr: "Témoignages", en: "Testimonials", de: "Erfahrungsberichte", zh: "评价" },
  description: { fr: "Retours de partenaires", en: "Partner feedback", de: "Partnerfeedback", zh: "合作伙伴反馈" },
  keywords: { fr: ["témoignages", "avis"], en: ["testimonials", "reviews"], de: ["erfahrungsberichte", "bewertungen"], zh: ["评价", "反馈"] },
};

function shortDescription(paragraphs: string[]): string {
  const text = paragraphs[0]?.replace(/\s+/g, " ").trim() ?? "";
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length <= 140 ? sentence : `${sentence.slice(0, 139).trimEnd()}…`;
}

/** Pages /venture/* générées depuis les mêmes données que VenturePage (EN pour DE/ZH). */
const ventureEntries: PublicSearchEntry[] = venturesFr.map(venture => {
  const english = venturesEn.find(item => item.slug === venture.slug) ?? venture;
  const title = `${venture.company} — ${venture.role}`;
  const titleEn = `${english.company} — ${english.role}`;
  const descriptionEn = shortDescription(english.description);
  const keywordsFr = [venture.company, ...venture.tags, "entreprise", "venture", "activité"];
  const keywordsEn = [english.company, ...english.tags, "company", "venture"];
  return {
    href: `/venture/${venture.slug}`,
    title: { fr: title, en: titleEn, de: titleEn, zh: titleEn },
    description: { fr: shortDescription(venture.description), en: descriptionEn, de: descriptionEn, zh: descriptionEn },
    keywords: { fr: keywordsFr, en: keywordsEn, de: [...keywordsEn, "unternehmen"], zh: [...keywordsEn, "企业"] },
  };
});

export const publicSearchIndex: PublicSearchEntry[] = [
  ...staticEntries,
  ...ventureEntries,
  ...(isPublicTestimonialsEnabled() ? [testimonialsEntry] : []),
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();
}

export function searchPublicPages(query: string, language: SearchLanguage) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  return publicSearchIndex
    .map((entry) => {
      const title = normalize(entry.title[language]);
      const description = normalize(entry.description[language]);
      const keywords = normalize(entry.keywords[language].join(" "));
      const matchedTerms = terms.filter((term) => title.includes(term) || description.includes(term) || keywords.includes(term)).length;
      const score = terms.reduce((total, term) => total + (title.includes(term) ? 3 : 0) + (description.includes(term) ? 2 : 0) + (keywords.includes(term) ? 1 : 0), 0);
      return { entry, score, matchedTerms };
    })
    .filter(({ matchedTerms }) => matchedTerms === terms.length)
    .sort((left, right) => right.score - left.score || left.entry.title[language].localeCompare(right.entry.title[language]));
}
