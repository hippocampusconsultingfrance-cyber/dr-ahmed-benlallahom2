export type CampaignLanguage = "fr" | "en";

export type RecruitmentCampaignTemplateId = "europe" | "canada" | "middle_east" | "offshore";

type LocalizedTemplate = {
  title: string;
  subject: string;
  body: string;
};

export type RecruitmentCampaignTemplate = {
  id: RecruitmentCampaignTemplateId;
  label: Record<CampaignLanguage, string>;
  content: Record<CampaignLanguage, LocalizedTemplate>;
};

export const RECRUITMENT_CAMPAIGN_TEMPLATES: RecruitmentCampaignTemplate[] = [
  {
    id: "europe",
    label: { fr: "Mission médicale – Europe", en: "Medical mission – Europe" },
    content: {
      fr: {
        title: "Recrutement médical – Europe",
        subject: "Opportunité médicale en Europe – [spécialité]",
        body: "Bonjour,\n\nHippocampus Consulting accompagne actuellement une organisation de santé pour une mission en Europe (France, Allemagne ou Italie).\n\nSpécialité recherchée : [spécialité]\nLocalisation : [pays / ville]\nType de mission : [CDI, remplacement, mission ponctuelle]\n\nSi cette opportunité vous intéresse, répondez à cet email avec vos disponibilités actualisées.\n\nBien cordialement,\nHippocampus Consulting",
      },
      en: {
        title: "Medical recruitment – Europe",
        subject: "Medical opportunity in Europe – [specialty]",
        body: "Hello,\n\nHippocampus Consulting is supporting a healthcare organisation for a mission in Europe (France, Germany or Italy).\n\nRequired specialty: [specialty]\nLocation: [country / city]\nMission type: [permanent role, locum, short assignment]\n\nIf you are interested, please reply with your current availability.\n\nKind regards,\nHippocampus Consulting",
      },
    },
  },
  {
    id: "canada",
    label: { fr: "Mission médicale – Canada", en: "Medical mission – Canada" },
    content: {
      fr: {
        title: "Recrutement médical – Canada",
        subject: "Opportunité médicale au Canada – [spécialité]",
        body: "Bonjour,\n\nUne opportunité de recrutement médical est ouverte au Canada.\n\nSpécialité recherchée : [spécialité]\nProvince / ville : [localisation]\nExigences de licence : [à préciser]\nCalendrier envisagé : [à préciser]\n\nRépondez à cet email si vous souhaitez recevoir le brief complet.\n\nBien cordialement,\nHippocampus Consulting",
      },
      en: {
        title: "Medical recruitment – Canada",
        subject: "Medical opportunity in Canada – [specialty]",
        body: "Hello,\n\nA medical recruitment opportunity is open in Canada.\n\nRequired specialty: [specialty]\nProvince / city: [location]\nLicensing requirements: [to be specified]\nExpected timeline: [to be specified]\n\nReply to this email if you would like to receive the full brief.\n\nKind regards,\nHippocampus Consulting",
      },
    },
  },
  {
    id: "middle_east",
    label: { fr: "Mission médicale – Moyen-Orient", en: "Medical mission – Middle East" },
    content: {
      fr: {
        title: "Recrutement médical – Moyen-Orient",
        subject: "Opportunité médicale au Moyen-Orient – [spécialité]",
        body: "Bonjour,\n\nHippocampus Consulting recrute pour une mission médicale auprès d’un groupe de santé au Moyen-Orient.\n\nSpécialité recherchée : [spécialité]\nPays : [pays]\nEnvironnement : [hôpital, clinique, groupe industriel]\nConditions et calendrier : [à préciser]\n\nRépondez à cet email avec vos disponibilités si vous souhaitez être contacté.\n\nBien cordialement,\nHippocampus Consulting",
      },
      en: {
        title: "Medical recruitment – Middle East",
        subject: "Medical opportunity in the Middle East – [specialty]",
        body: "Hello,\n\nHippocampus Consulting is recruiting for a medical mission with a healthcare group in the Middle East.\n\nRequired specialty: [specialty]\nCountry: [country]\nSetting: [hospital, clinic, industrial group]\nTerms and timeline: [to be specified]\n\nReply with your availability if you would like to be contacted.\n\nKind regards,\nHippocampus Consulting",
      },
    },
  },
  {
    id: "offshore",
    label: { fr: "Mission VVIP / offshore", en: "VVIP / offshore mission" },
    content: {
      fr: {
        title: "Recrutement médical – Mission offshore",
        subject: "Mission médicale offshore internationale – [spécialité]",
        body: "Bonjour,\n\nUne mission médicale internationale est ouverte dans un environnement offshore ou industriel à forte exigence.\n\nSpécialité recherchée : [spécialité]\nZone : [pays / région]\nEnvironnement : [plateforme pétrolière, site offshore, groupe industriel]\nCertifications attendues : [à préciser]\n\nRépondez à cet email pour recevoir les modalités confidentielles de la mission.\n\nBien cordialement,\nHippocampus Consulting",
      },
      en: {
        title: "Medical recruitment – Offshore mission",
        subject: "International offshore medical mission – [specialty]",
        body: "Hello,\n\nAn international medical mission is open in a high-requirement offshore or industrial environment.\n\nRequired specialty: [specialty]\nRegion: [country / region]\nSetting: [oil platform, offshore site, industrial group]\nRequired certifications: [to be specified]\n\nReply to this email to receive the confidential mission details.\n\nKind regards,\nHippocampus Consulting",
      },
    },
  },
];

export function getRecruitmentCampaignTemplate(id: string, language: CampaignLanguage) {
  return RECRUITMENT_CAMPAIGN_TEMPLATES.find(template => template.id === id)?.content[language] ?? null;
}
