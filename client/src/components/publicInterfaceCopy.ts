export type PublicInterfaceLanguage = "fr" | "en" | "de" | "zh";

export const publicInterfaceCopy: Record<PublicInterfaceLanguage, {
  recruitment: string;
  employers: string;
  search: string;
  resources: string;
  press: string;
  faq: string;
  linkedin: string;
  readability: { enable: string; disable: string; label: string };
  oled: { enable: string; disable: string; label: string };
}> = {
  fr: { recruitment: "Recrutement", employers: "Employeurs", search: "Rechercher", resources: "Ressources médicales", press: "Presse & publications", faq: "FAQ", linkedin: "LinkedIn", readability: { enable: "Activer la lisibilité renforcée", disable: "Désactiver la lisibilité renforcée", label: "Lisibilité renforcée" }, oled: { enable: "Activer le noir OLED", disable: "Désactiver le noir OLED", label: "Noir OLED" } },
  en: { recruitment: "Recruitment", employers: "Employers", search: "Search", resources: "Medical resources", press: "Press & publications", faq: "FAQ", linkedin: "LinkedIn", readability: { enable: "Enable high readability", disable: "Disable high readability", label: "High readability" }, oled: { enable: "Enable OLED black", disable: "Disable OLED black", label: "OLED black" } },
  de: { recruitment: "Recruiting", employers: "Arbeitgeber", search: "Suche", resources: "Medizinische Ressourcen", press: "Presse & Publikationen", faq: "FAQ", linkedin: "LinkedIn", readability: { enable: "Verbesserte Lesbarkeit aktivieren", disable: "Verbesserte Lesbarkeit deaktivieren", label: "Verbesserte Lesbarkeit" }, oled: { enable: "OLED-Schwarz aktivieren", disable: "OLED-Schwarz deaktivieren", label: "OLED-Schwarz" } },
  zh: { recruitment: "招聘", employers: "雇主专区", search: "搜索", resources: "医疗资源", press: "媒体与出版物", faq: "常见问题", linkedin: "LinkedIn", readability: { enable: "启用高可读性模式", disable: "关闭高可读性模式", label: "高可读性模式" }, oled: { enable: "启用 OLED 黑色", disable: "关闭 OLED 黑色", label: "OLED 黑色" } },
};

export function getPublicInterfaceCopy(language: string) {
  return publicInterfaceCopy[language as PublicInterfaceLanguage] ?? publicInterfaceCopy.fr;
}
