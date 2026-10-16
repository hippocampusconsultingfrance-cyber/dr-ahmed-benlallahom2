// ============================================================
// CONTENU DES PAGES ENTREPRISES EN FRANÇAIS
// Modifiez ce fichier pour changer les textes des sous-pages entreprises.
// ============================================================

// Profil LinkedIn du Dr Ben Lallahom : source unique dans site-config.ts (PUB-CONTACT-01).
import { siteConfig } from "./site-config";

export interface TeamMember {
  name: string;
  role: string;
  linkedin?: string;
  photo?: string; // URL de la photo — laissez vide pour afficher une silhouette
}

export interface VentureDetail {
  slug: string;
  company: string;
  role: string;
  tagline: string;
  description: string[];
  highlights: { label: string; value: string }[];
  services: string[];
  tags: string[];
  team?: TeamMember[];
  website?: string; // URL du site web de la société
  logo?: string; // URL du logo de la société
}

export const venturesFr: VentureDetail[] = [
  {
    slug: "hippocampus-consulting",
    company: "Hippocampus Consulting",
    role: "CEO & Fondateur",
    tagline: "Conseil en stratégie et management orienté export",
    logo: "/assets/logos/hippocampus-consulting.webp",
    description: [
      "Hippocampus Consulting est un cabinet de conseil en stratégie et management entièrement orienté export, fondé et dirigé par le Dr. Ahmed Ben Lallahom. Le cabinet accompagne les entreprises dans leur transformation digitale, leur développement international et leur croissance durable.",
      "Fort d'une approche unique mêlant rigueur médicale et vision entrepreneuriale, Hippocampus Consulting propose des solutions sur mesure pour les organisations qui souhaitent se développer à l'international tout en maintenant l'excellence opérationnelle.",
      "Le cabinet intervient principalement dans les secteurs de la santé, de la technologie et des services professionnels, avec une expertise particulière dans l'accompagnement des entreprises françaises vers les marchés internationaux.",
    ],
    highlights: [
      { label: "Statut", value: "CEO & Fondateur" },
      { label: "Secteur", value: "Conseil en Stratégie" },
      { label: "Orientation", value: "Export International" },
      { label: "Siège", value: "France" },
    ],
    services: [
      "Stratégie de développement international",
      "Transformation digitale",
      "Conseil en management et organisation",
      "Accompagnement à la croissance durable",
      "Audit stratégique et opérationnel",
    ],
    tags: ["Stratégie", "Transformation Digitale", "Croissance", "Export"],
    team: [
      {
        name: "Dr. Ahmed Ben Lallahom",
        role: "CEO & Fondateur",
        linkedin: siteConfig.linkedin,
        photo: "/assets/team/ahmed-ben-lallahom.webp",
      },
      {
        name: "Youssef Ben Lallahom",
        role: "Consultant IA",
        linkedin: "https://www.linkedin.com/in/youssef-ben-lallahom/",
        photo: "/assets/team/youssef-ben-lallahom.webp",
      },
      {
        name: "Omar Ben Lallahom",
        role: "Consultant Data & IA",
        linkedin: "https://www.linkedin.com/in/omar-ben-lallahom/",
        photo: "/assets/team/omar-ben-lallahom.webp",
      },
      {
        name: "Lotfi Ben Lallahom",
        role: "Consultant Santé",
        photo: "/assets/team/lotfi-ben-lallahom.webp",
      },
      {
        name: "Monia Ben Lallahom",
        role: "Consultante Santé",
        photo: "/assets/team/monia-ben-lallahom.webp",
      },
    ],
  },
  {
    slug: "laska-corporate",
    company: "Laska Corporate",
    role: "Co-Fondateur",
    tagline: "Recrutement médical et paramédical spécialisé",
    website: "https://laskacorp.com/home",
    logo: "/assets/logos/laska-corporate.webp",
    description: [
      "Laska Corporate est une entreprise spécialisée dans le recrutement médical et paramédical, co-fondée par le Dr. Ahmed Ben Lallahom. Elle connecte les établissements de santé avec des professionnels qualifiés pour des postes permanents, des remplacements et des missions intérimaires.",
      "Grâce à une connaissance approfondie du terrain médical et des besoins réels des établissements, Laska Corporate propose un service de recrutement sur mesure qui garantit l'adéquation entre les compétences des candidats et les exigences des postes.",
      "L'entreprise couvre l'ensemble du spectre des professions de santé : médecins, infirmiers, aides-soignants, kinésithérapeutes et autres professionnels paramédicaux.",
    ],
    highlights: [
      { label: "Statut", value: "Co-Fondateur" },
      { label: "Secteur", value: "Recrutement Santé" },
      { label: "Spécialité", value: "Médical & Paramédical" },
      { label: "Services", value: "CDI, CDD, Intérim" },
    ],
    services: [
      "Recrutement médical permanent",
      "Missions intérimaires en santé",
      "Remplacement de professionnels de santé",
      "Conseil RH pour établissements de santé",
      "Sourcing international de talents médicaux",
    ],
    tags: ["Recrutement Médical", "Intérim", "RH Santé"],
    team: [
      {
        name: "Amine Hachicha",
        role: "Président",
        linkedin: "https://www.linkedin.com/in/amine-hachicha-66904683/",
        photo: "/assets/team/amine-hachicha.webp",
      },
      {
        name: "Sonia Siala",
        role: "Directrice Générale",
        linkedin: "https://www.linkedin.com/in/sonia-siala-3412251b8/",
        photo: "/assets/team/sonia-siala.webp",
      },
      {
        name: "Dr. Ahmed Ben Lallahom",
        role: "Directeur Médical",
        linkedin: siteConfig.linkedin,
        photo: "/assets/team/ahmed-ben-lallahom.webp",
      },
    ],
  },
  {
    slug: "appel-medical-tunisie",
    company: "Appel Médical Tunisie",
    role: "Co-Fondateur",
    tagline: "Recrutement et staffing médical en Tunisie",
    logo: "/assets/logos/appel-medical-tunisie.webp",
    description: [
      "Appel Médical Tunisie est une venture de recrutement et de staffing médical co-fondée par le Dr. Ahmed Ben Lallahom, connectant les professionnels de santé qualifiés avec les hôpitaux et cliniques qui en ont besoin.",
      "L'entreprise répond à un besoin critique du marché tunisien en matière de ressources humaines médicales, en facilitant la mise en relation entre les établissements de santé et les praticiens disponibles.",
      "Appel Médical Tunisie s'appuie sur un réseau étendu de professionnels de santé et une connaissance fine du système de santé tunisien pour proposer des solutions de staffing adaptées.",
    ],
    highlights: [
      { label: "Statut", value: "Co-Fondateur" },
      { label: "Secteur", value: "Staffing Médical" },
      { label: "Marché", value: "Tunisie" },
      { label: "Focus", value: "Hôpitaux & Cliniques" },
    ],
    services: [
      "Staffing médical hospitalier",
      "Recrutement de praticiens",
      "Missions temporaires et permanentes",
      "Conseil en organisation des soins",
    ],
    tags: ["Recrutement", "Tunisie", "Staffing"],
    team: [
      {
        name: "Amine Hachicha",
        role: "Président",
        linkedin: "https://www.linkedin.com/in/amine-hachicha-66904683/",
        photo: "/assets/team/amine-hachicha.webp",
      },
      {
        name: "Sonia Siala",
        role: "Directrice Générale",
        linkedin: "https://www.linkedin.com/in/sonia-siala-3412251b8/",
        photo: "/assets/team/sonia-siala.webp",
      },
      {
        name: "Dr. Ahmed Ben Lallahom",
        role: "Directeur Médical",
        linkedin: siteConfig.linkedin,
        photo: "/assets/team/ahmed-ben-lallahom.webp",
      },
    ],
  },
  {
    slug: "octopus-talent",
    company: "Octopus Talent",
    role: "Co-Fondateur",
    tagline: "Conseil en IT, Data, IA et Cybersécurité",
    website: "https://www.octopustalent.io/",
    logo: "/assets/logos/octopus-talent.webp",
    description: [
      "Octopus Talent est un cabinet de conseil en IT, Data, IA et cybersécurité basé à Paris, co-fondé par le Dr. Ahmed Ben Lallahom. L'entreprise accompagne la transformation digitale des organisations avec des solutions technologiques sur mesure.",
      "Dans un monde où la technologie est devenue un levier stratégique incontournable, Octopus Talent aide les entreprises à exploiter le plein potentiel de l'intelligence artificielle, du big data et de la cybersécurité pour accélérer leur croissance.",
      "Le cabinet se distingue par sa capacité à combiner expertise technique pointue et compréhension des enjeux business, permettant de délivrer des solutions à forte valeur ajoutée.",
    ],
    highlights: [
      { label: "Statut", value: "Co-Fondateur" },
      { label: "Secteur", value: "Tech & Conseil" },
      { label: "Spécialités", value: "IA, Data, Cyber" },
      { label: "Siège", value: "Paris" },
    ],
    services: [
      "Conseil en intelligence artificielle",
      "Stratégie data et analytics",
      "Audit et conseil en cybersécurité",
      "Transformation digitale",
      "Recrutement de talents tech",
    ],
    tags: ["IT", "IA", "Cybersécurité", "Data"],
    team: [
      {
        name: "Dr. Ahmed Ben Lallahom",
        role: "Consultant",
        linkedin: siteConfig.linkedin,
        photo: "/assets/team/ahmed-ben-lallahom.webp",
      },
      {
        name: "Sonia Siala",
        role: "Consultante",
        linkedin: "https://www.linkedin.com/in/sonia-siala-3412251b8/",
        photo: "/assets/team/sonia-siala.webp",
      },
      {
        name: "Amine Hachicha",
        role: "Consultant",
        linkedin: "https://www.linkedin.com/in/amine-hachicha-66904683/",
        photo: "/assets/team/amine-hachicha.webp",
      },
      {
        name: "Ines Dhaouadi",
        role: "Consultante",
        linkedin: "https://www.linkedin.com/in/ines-dhaouadi/",
        photo: "/assets/team/ines-dhaouadi.webp",
      },
    ],
  },
  {
    slug: "sawa4you",
    company: "Sawa4You",
    role: "Co-Fondateur",
    tagline: "Conseil international en business et accompagnement humain",
    website: "https://sawayou.com/",
    description: [
      "Sawa4You est une entreprise de conseil international en business et accompagnement humain, co-fondée par le Dr. Ahmed Ben Lallahom. Elle propose un accompagnement global aux entrepreneurs et aux entreprises dans leur développement.",
      "L'approche de Sawa4You se distingue par sa dimension humaine : au-delà du conseil business traditionnel, l'entreprise intègre une dimension d'accompagnement personnel pour aider les dirigeants à atteindre leurs objectifs professionnels et personnels.",
      "Sawa4You intervient à l'international avec une expertise multiculturelle qui permet d'accompagner des projets dans des contextes variés.",
    ],
    highlights: [
      { label: "Statut", value: "Co-Fondateur" },
      { label: "Secteur", value: "Conseil & Coaching" },
      { label: "Portée", value: "International" },
      { label: "Approche", value: "Business & Humain" },
    ],
    services: [
      "Conseil en développement business",
      "Accompagnement entrepreneurial",
      "Coaching de dirigeants",
      "Stratégie internationale",
    ],
    tags: ["Conseil International", "Business Advisory", "Coaching"],
    team: [
      {
        name: "Wafa Dahmeni",
        role: "CEO",
        linkedin: "https://www.linkedin.com/in/wafadahmeni/",
        photo: "/manus-storage/photo-wafa-clean_fe6f20ad.png",
      },
      {
        name: "Amine Hachicha",
        role: "Consultant",
        linkedin: "https://www.linkedin.com/in/amine-hachicha-66904683/",
        photo: "/assets/team/amine-hachicha.webp",
      },
      {
        name: "Sonia Siala",
        role: "Consultante",
        linkedin: "https://www.linkedin.com/in/sonia-siala-3412251b8/",
        photo: "/assets/team/sonia-siala.webp",
      },
      {
        name: "Dr. Ahmed Ben Lallahom",
        role: "Consultant",
        linkedin: siteConfig.linkedin,
        photo: "/assets/team/ahmed-ben-lallahom.webp",
      },
    ],
  },
  {
    slug: "pratique-clinique",
    company: "Pratique Clinique",
    role: "Anesthésiste-Réanimateur",
    tagline: "Excellence clinique en anesthésie et soins intensifs",
    description: [
      "Le Dr. Ahmed Ben Lallahom exerce en tant qu'anesthésiste-réanimateur dans des hôpitaux français de référence, dont le Centre Hospitalier du Mans et l'Institut de Cancérologie de l'Ouest.",
      "Sa pratique clinique couvre l'ensemble du spectre de l'anesthésie-réanimation : anesthésie générale et locorégionale, prise en charge des patients critiques, gestion de la douleur périopératoire et médecine d'urgence.",
      "Fort de plus de 10 ans d'expérience clinique, il allie expertise technique de pointe et approche centrée sur le patient pour garantir la sécurité et la qualité des soins dans des contextes chirurgicaux complexes.",
    ],
    highlights: [
      { label: "Spécialité", value: "Anesthésie-Réanimation" },
      { label: "Expérience", value: "10+ ans" },
      { label: "Certification", value: "DESAIC" },
      { label: "Lieu", value: "France" },
    ],
    services: [
      "Anesthésie générale et locorégionale",
      "Réanimation et soins intensifs",
      "Gestion de la douleur périopératoire",
      "Prise en charge des patients critiques",
      "Médecine d'urgence",
    ],
    tags: ["Anesthésie", "Réanimation", "Cancérologie"],
  },
];
