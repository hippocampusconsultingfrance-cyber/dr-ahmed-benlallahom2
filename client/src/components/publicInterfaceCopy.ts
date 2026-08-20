export type PublicInterfaceLanguage = "fr" | "en" | "de" | "zh";

export const publicInterfaceCopy: Record<PublicInterfaceLanguage, {
  recruitment: string;
  employers: string;
  search: string;
  resources: string;
  press: string;
  faq: string;
  linkedin: string;
}> = {
  fr: { recruitment: "Recrutement", employers: "Employeurs", search: "Rechercher", resources: "Ressources médicales", press: "Presse & publications", faq: "FAQ", linkedin: "LinkedIn" },
  en: { recruitment: "Recruitment", employers: "Employers", search: "Search", resources: "Medical resources", press: "Press & publications", faq: "FAQ", linkedin: "LinkedIn" },
  de: { recruitment: "Recruiting", employers: "Arbeitgeber", search: "Suche", resources: "Medizinische Ressourcen", press: "Presse & Publikationen", faq: "FAQ", linkedin: "LinkedIn" },
  zh: { recruitment: "招聘", employers: "雇主专区", search: "搜索", resources: "医疗资源", press: "媒体与出版物", faq: "常见问题", linkedin: "LinkedIn" },
};

export function getPublicInterfaceCopy(language: string) {
  return publicInterfaceCopy[language as PublicInterfaceLanguage] ?? publicInterfaceCopy.fr;
}
