// ============================================================
// CONFIGURATION GÉNÉRALE DU SITE
// Modifiez ce fichier pour changer les informations de contact,
// les liens sociaux et les paramètres généraux du site.
// ============================================================

export const siteConfig = {
  // Informations de contact publiques : SOURCE UNIQUE (PUB-CONTACT-01).
  // Réutilisées par le pied de page, les mentions légales, les pages entreprises,
  // les données structurées (shared/siteStructuredData.ts), la facture et la
  // réponse aux emails patients (Reply-To par défaut).
  phone: "+33 9 72 15 24 13",
  email: "executive.office@drahmedbenlallahom.com",
  linkedin: "https://www.linkedin.com/in/ahmed-ben-lallahom-md-desaic-7a086b13a/",

  // Nom complet et titre
  name: "Dr. Ahmed Ben Lallahom",
  credentials: "MD, DESAIC",
  specialty: "Anesthesiology & Critical Care",

  // Statistiques (section About)
  stats: {
    yearsClinical: "9+",
    ventures: "5+",
    certifications: "16+",
    languages: "3",
  },

  // Langue par défaut ('fr', 'en', 'de', 'zh')
  defaultLanguage: "fr" as "fr" | "en" | "de" | "zh",
};
