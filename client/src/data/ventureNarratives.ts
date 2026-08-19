import type { VentureDetail } from "./ventures-fr";

type VentureNarrative = Pick<VentureDetail, "role" | "tagline" | "description">;

export const ventureNarrativesDe: Record<string, VentureNarrative> = {
  "hippocampus-consulting": {
    role: "CEO & Gründer", tagline: "Exportorientierte Strategie- und Managementberatung",
    description: ["Hippocampus Consulting ist eine exportorientierte Strategie- und Managementberatung, gegründet und geleitet von Dr. Ahmed Ben Lallahom. Das Unternehmen begleitet Organisationen bei digitaler Transformation, internationaler Entwicklung und nachhaltigem Wachstum.", "Der Ansatz verbindet medizinische Sorgfalt mit unternehmerischer Vision und schafft passgenaue Lösungen für internationale Expansion bei operativer Exzellenz.", "Der Schwerpunkt liegt auf Gesundheit, Technologie und professionellen Dienstleistungen, insbesondere auf der Begleitung französischer Unternehmen in internationale Märkte."],
  },
  "laska-corporate": {
    role: "Mitgründer", tagline: "Spezialisierte medizinische und paramedizinische Personalvermittlung",
    description: ["Laska Corporate ist ein von Dr. Ahmed Ben Lallahom mitgegründetes Unternehmen für medizinische und paramedizinische Personalvermittlung. Es verbindet Gesundheitseinrichtungen mit qualifizierten Fachkräften für Festanstellungen, Vertretungen und Zeitarbeit.", "Mit fundierter Kenntnis des Gesundheitswesens bietet Laska Corporate eine maßgeschneiderte Begleitung, die Kompetenzen und Anforderungen einer Position sorgfältig zusammenführt.", "Das Spektrum umfasst Ärztinnen und Ärzte, Pflegekräfte, Pflegeassistenz, Physiotherapie und weitere Gesundheitsberufe."],
  },
  "appel-medical-tunisie": {
    role: "Mitgründer", tagline: "Medizinische Personalvermittlung in Tunesien",
    description: ["Appel Médical Tunisie ist ein von Dr. Ahmed Ben Lallahom mitgegründetes Projekt für medizinische Personalvermittlung, das qualifizierte Fachkräfte mit Krankenhäusern und Kliniken verbindet.", "Das Unternehmen reagiert auf den Bedarf an medizinischen Humanressourcen im tunesischen Markt und erleichtert die Verbindung zwischen Einrichtungen und verfügbaren Fachkräften.", "Ein breites Netzwerk und die Kenntnis des tunesischen Gesundheitssystems ermöglichen passgenaue Besetzungslösungen."],
  },
  "octopus-talent": {
    role: "Mitgründer", tagline: "Beratung für IT, Daten, KI und Cybersicherheit",
    description: ["Octopus Talent ist eine in Paris ansässige Beratungsfirma für IT, Daten, KI und Cybersicherheit, die von Dr. Ahmed Ben Lallahom mitgegründet wurde. Sie begleitet die digitale Transformation mit maßgeschneiderten Technologielösungen.", "Das Unternehmen unterstützt Organisationen dabei, künstliche Intelligenz, Daten und Cybersicherheit als strategische Hebel für Wachstum zu nutzen.", "Technische Expertise und Geschäftsverständnis werden verbunden, um Lösungen mit hoher Wirkung zu liefern."],
  },
  "sawa4you": {
    role: "Mitgründer", tagline: "Internationale Unternehmens- und Humanberatung",
    description: ["Sawa4You ist ein von Dr. Ahmed Ben Lallahom mitgegründetes internationales Beratungsunternehmen für Unternehmen und Menschen. Es begleitet Unternehmerinnen, Unternehmer und Organisationen in ihrer Entwicklung.", "Über klassische Unternehmensberatung hinaus verbindet der Ansatz persönliche Begleitung mit beruflichen Zielen von Führungskräften.", "Die internationale und multikulturelle Expertise unterstützt Projekte in unterschiedlichen Kontexten."],
  },
  "pratique-clinique": {
    role: "Anästhesist und Intensivmediziner", tagline: "Klinische Exzellenz in Anästhesie und Intensivmedizin",
    description: ["Dr. Ahmed Ben Lallahom arbeitet als Anästhesist und Intensivmediziner an führenden französischen Einrichtungen, darunter das Centre Hospitalier du Mans und das Institut de Cancérologie de l’Ouest.", "Seine Praxis umfasst Allgemein- und Regionalanästhesie, die Versorgung kritisch kranker Menschen, perioperatives Schmerzmanagement und Notfallmedizin.", "Mit mehr als zehn Jahren klinischer Erfahrung verbindet er technische Expertise mit einer patientenzentrierten Versorgung in komplexen chirurgischen Situationen."],
  },
};

export const ventureNarrativesZh: Record<string, VentureNarrative> = {
  "hippocampus-consulting": { role: "首席执行官兼创始人", tagline: "面向出口的战略与管理咨询", description: ["Hippocampus Consulting 由 Ahmed Ben Lallahom 医生创立并领导，专注于出口导向的战略与管理咨询，支持企业进行数字化转型、国际发展与可持续增长。", "其方法结合医疗领域的严谨性与创业视野，为在保持运营卓越的同时拓展国际市场的组织提供定制方案。", "公司主要服务医疗、科技和专业服务领域，尤其支持法国企业进入国际市场。"] },
  "laska-corporate": { role: "联合创始人", tagline: "专业医疗与辅助医疗人才招聘", description: ["Laska Corporate 由 Ahmed Ben Lallahom 医生联合创立，专注于医疗和辅助医疗人才招聘，为医疗机构连接合格专业人员，覆盖长期岗位、替岗和临时任务。", "依托对医疗领域及机构实际需求的深入理解，公司提供定制招聘服务，审慎匹配候选人能力与岗位要求。", "服务覆盖医生、护士、护理助理、物理治疗师及其他医疗辅助专业人员。"] },
  "appel-medical-tunisie": { role: "联合创始人", tagline: "突尼斯医疗人才招聘与配置", description: ["Appel Médical Tunisie 由 Ahmed Ben Lallahom 医生联合创立，连接合格医疗专业人员与需要人才的医院和诊所。", "公司回应突尼斯市场对医疗人力资源的需求，帮助医疗机构与可用执业人员建立联系。", "凭借广泛的专业人员网络和对突尼斯医疗体系的了解，公司提供定制配置方案。"] },
  "octopus-talent": { role: "联合创始人", tagline: "IT、数据、人工智能与网络安全咨询", description: ["Octopus Talent 是一家位于巴黎、由 Ahmed Ben Lallahom 医生联合创立的 IT、数据、人工智能和网络安全咨询公司，为组织提供定制化技术方案以推进数字化转型。", "公司帮助客户将人工智能、大数据和网络安全转化为促进增长的战略杠杆。", "团队将前沿技术专长与业务理解相结合，提供高价值解决方案。"] },
  "sawa4you": { role: "联合创始人", tagline: "国际商业与人本咨询", description: ["Sawa4You 由 Ahmed Ben Lallahom 医生联合创立，为企业家和组织提供国际商业与人本咨询支持。", "其方法超越传统商业咨询，将个人辅导融入领导者的职业与个人目标。", "多元文化的国际经验使其能够在不同环境中支持各类项目。"] },
  "pratique-clinique": { role: "麻醉与重症医学医师", tagline: "麻醉与重症医学的临床卓越", description: ["Ahmed Ben Lallahom 医生在法国领先医疗机构从事麻醉与重症医学工作，包括勒芒中心医院和西部肿瘤研究所。", "其临床实践涵盖全身与区域麻醉、危重患者管理、围手术期疼痛管理和急诊医学。", "凭借十余年临床经验，他将技术专长与以患者为中心的照护相结合，应对复杂手术情境。"] },
};
