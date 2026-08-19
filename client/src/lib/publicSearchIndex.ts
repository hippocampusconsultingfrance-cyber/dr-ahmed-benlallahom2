type SearchLanguage = "fr" | "en" | "de" | "zh";

export type PublicSearchEntry = {
  href: string;
  title: Record<SearchLanguage, string>;
  description: Record<SearchLanguage, string>;
  keywords: Record<SearchLanguage, string[]>;
};

export const publicSearchIndex: PublicSearchEntry[] = [
  { href: "/", title: { fr: "Accueil", en: "Home", de: "Startseite", zh: "首页" }, description: { fr: "Présentation du Dr. Ahmed Ben Lallahom", en: "Dr. Ahmed Ben Lallahom overview", de: "Profil von Dr. Ahmed Ben Lallahom", zh: "Ahmed Ben Lallahom 医生简介" }, keywords: { fr: ["docteur", "anesthésiste", "santé"], en: ["doctor", "anesthesiologist", "health"], de: ["arzt", "anästhesist", "gesundheit"], zh: ["医生", "麻醉", "健康"] } },
  { href: "/booking", title: { fr: "Réserver une consultation", en: "Book a consultation", de: "Beratung buchen", zh: "预约咨询" }, description: { fr: "Conseil en santé en ligne et prise de rendez-vous", en: "Online health advice and appointment booking", de: "Online-Gesundheitsberatung und Terminbuchung", zh: "在线健康咨询与预约" }, keywords: { fr: ["réserver", "consultation", "paiement", "facture"], en: ["booking", "consultation", "payment", "invoice"], de: ["buchung", "beratung", "zahlung", "rechnung"], zh: ["预约", "咨询", "付款", "发票"] } },
  { href: "/recruitment", title: { fr: "Recrutement médical", en: "Medical recruitment", de: "Medizinische Rekrutierung", zh: "医疗招聘" }, description: { fr: "Déposer une candidature pour des opportunités internationales", en: "Apply for international healthcare opportunities", de: "Für internationale Gesundheitspositionen bewerben", zh: "申请国际医疗机会" }, keywords: { fr: ["cv", "candidature", "emploi", "international"], en: ["cv", "application", "job", "international"], de: ["lebenslauf", "bewerbung", "stelle", "international"], zh: ["简历", "申请", "工作", "国际"] } },
  { href: "/recruitment/vvip", title: { fr: "Missions VVIP et offshore", en: "VVIP and offshore missions", de: "VVIP- und Offshore-Einsätze", zh: "VVIP 与离岸任务" }, description: { fr: "Candidatures pour environnements offshore et critiques", en: "Applications for offshore and critical environments", de: "Bewerbungen für Offshore- und kritische Umgebungen", zh: "离岸及关键环境职位申请" }, keywords: { fr: ["offshore", "plateforme", "moyen-orient"], en: ["offshore", "oil rig", "middle east"], de: ["offshore", "bohrinsel", "naher osten"], zh: ["离岸", "石油平台", "中东"] } },
  { href: "/employers", title: { fr: "Employeurs", en: "Employers", de: "Arbeitgeber", zh: "雇主专区" }, description: { fr: "Déposer un brief de recrutement", en: "Submit a recruitment brief", de: "Recruiting-Brief einreichen", zh: "提交招聘需求" }, keywords: { fr: ["employeur", "brief", "mission", "shortlist"], en: ["employer", "brief", "mission", "shortlist"], de: ["arbeitgeber", "brief", "einsatz", "shortlist"], zh: ["雇主", "需求", "任务", "候选名单"] } },
  { href: "/why-hippocampus", title: { fr: "Pourquoi Hippocampus", en: "Why Hippocampus", de: "Warum Hippocampus", zh: "为什么选择 Hippocampus" }, description: { fr: "Méthode et confidentialité pour les employeurs", en: "Method and confidentiality for employers", de: "Methode und Vertraulichkeit für Arbeitgeber", zh: "面向雇主的方法与保密承诺" }, keywords: { fr: ["méthode", "confidentialité", "recrutement"], en: ["method", "confidentiality", "recruitment"], de: ["methode", "vertraulichkeit", "rekrutierung"], zh: ["方法", "保密", "招聘"] } },
  { href: "/candidate-access", title: { fr: "Espace candidat", en: "Candidate portal", de: "Kandidatenbereich", zh: "候选人空间" }, description: { fr: "Créer ou accéder à un espace sécurisé", en: "Create or access a secure area", de: "Geschützten Bereich erstellen oder öffnen", zh: "创建或访问安全空间" }, keywords: { fr: ["candidat", "documents", "mot de passe", "sécurité"], en: ["candidate", "documents", "password", "security"], de: ["kandidat", "dokumente", "passwort", "sicherheit"], zh: ["候选人", "文件", "密码", "安全"] } },
  { href: "/faq", title: { fr: "Questions fréquentes", en: "Frequently asked questions", de: "Häufige Fragen", zh: "常见问题" }, description: { fr: "Réponses pratiques sur les parcours du site", en: "Practical answers about site journeys", de: "Praktische Antworten zu den Website-Abläufen", zh: "有关网站流程的实用解答" }, keywords: { fr: ["faq", "question", "annulation", "urgence"], en: ["faq", "question", "cancellation", "emergency"], de: ["faq", "frage", "stornierung", "notfall"], zh: ["常见问题", "问题", "取消", "紧急"] } },
  { href: "/gdpr", title: { fr: "Données personnelles", en: "Personal data", de: "Personenbezogene Daten", zh: "个人数据" }, description: { fr: "Informations RGPD et droits des personnes", en: "GDPR information and data subject rights", de: "DSGVO-Informationen und Betroffenenrechte", zh: "GDPR 信息与个人权利" }, keywords: { fr: ["rgpd", "données", "confidentialité", "suppression"], en: ["gdpr", "data", "privacy", "deletion"], de: ["dsgvo", "daten", "datenschutz", "löschung"], zh: ["gdpr", "数据", "隐私", "删除"] } },
  { href: "/legal", title: { fr: "Mentions légales", en: "Legal notice", de: "Impressum", zh: "法律声明" }, description: { fr: "Informations légales du site", en: "Website legal information", de: "Rechtliche Informationen der Website", zh: "网站法律信息" }, keywords: { fr: ["mentions", "légal", "conditions"], en: ["legal", "notice", "terms"], de: ["impressum", "recht", "bedingungen"], zh: ["法律", "声明", "条款"] } },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
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
