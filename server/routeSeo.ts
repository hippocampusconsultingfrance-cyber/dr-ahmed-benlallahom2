const ORIGIN = "https://drahmedbenlallahom.com";
const SITE_NAME = "Dr. Ahmed Ben Lallahom";
const DEFAULT_IMAGE = `${ORIGIN}/manus-storage/logo-abl_2afbc5e0.png`;

type RouteSeo = {
  title: string;
  description: string;
  canonicalPath: string;
  keywords?: string;
  noIndex?: boolean;
  notFound?: boolean;
};

const PUBLIC_ROUTES: Record<string, Omit<RouteSeo, "canonicalPath">> = {
  "/": {
    title: "Dr. Ahmed Ben Lallahom | Médecine et Conseil",
    description: "Anesthésiste-réanimateur, entrepreneur en santé et consultant médical basé en France.",
    keywords: "anesthésiste, réanimateur, consultant médical, santé, France",
  },
  "/booking": {
    title: "Réserver une consultation | Dr. Ben Lallahom",
    description: "Réservez en ligne une consultation de conseil en santé avec le Dr. Ahmed Ben Lallahom.",
    keywords: "réservation consultation santé, téléconsultation, conseil médical",
  },
  "/recruitment": {
    title: "Recrutement santé international | Hippocampus",
    description: "Découvrez les opportunités internationales pour professionnels médicaux et paramédicaux.",
    keywords: "recrutement médical international, recrutement paramédical, Hippocampus Consulting",
  },
  "/recruitment/standard": {
    title: "Candidature santé internationale | Hippocampus",
    description: "Déposez votre candidature pour des opportunités médicales et paramédicales internationales.",
    keywords: "candidature médicale, emploi paramédical, mobilité internationale",
  },
  "/recruitment/unsubscribe": {
    title: "Préférences recrutement | Hippocampus Consulting",
    description: "Gérez vos préférences de communications de recrutement.",
    noIndex: true,
  },
  "/recruitment/vvip-offshore": {
    title: "Missions santé offshore et Moyen-Orient | Hippocampus",
    description: "Postulez pour des missions médicales spécialisées offshore, industrielles et au Moyen-Orient.",
    keywords: "mission médicale offshore, santé Moyen-Orient, plateforme pétrolière",
  },
  "/vvip-offshore": {
    title: "Missions santé offshore et Moyen-Orient | Hippocampus",
    description: "Postulez pour des missions médicales spécialisées offshore, industrielles et au Moyen-Orient.",
    keywords: "mission médicale offshore, santé Moyen-Orient, plateforme pétrolière",
  },
  "/employers": {
    title: "Recruter des soignants | Hippocampus Consulting",
    description: "Confiez votre besoin de recrutement médical ou paramédical international à Hippocampus Consulting.",
    keywords: "recrutement soignants, recrutement médical, recrutement paramédical",
  },
  "/why-hippocampus": {
    title: "Pourquoi Hippocampus Consulting | Employeurs",
    description: "Méthode, confidentialité et accompagnement pour vos recrutements médicaux internationaux.",
    keywords: "cabinet recrutement médical, méthode recrutement santé, Hippocampus Consulting",
  },
  "/testimonials": {
    title: "Témoignages de partenaires | Dr. Ben Lallahom",
    description: "Découvrez les témoignages de partenaires ayant collaboré avec le Dr. Ahmed Ben Lallahom.",
  },
  "/gdpr": {
    title: "Protection des données | Dr. Ben Lallahom",
    description: "Consultez les informations de protection des données personnelles et RGPD du site.",
  },
  "/legal": {
    title: "Mentions légales | Dr. Ben Lallahom",
    description: "Consultez les mentions légales et conditions d’utilisation du site Dr. Ahmed Ben Lallahom.",
  },
  "/faq": {
    title: "Questions fréquentes | Dr. Ben Lallahom",
    description: "Retrouvez les informations pratiques sur la consultation, la réservation et Hippocampus Consulting.",
  },
  "/search": {
    title: "Recherche | Dr. Ben Lallahom",
    description: "Recherchez les informations publiques du site.",
    noIndex: true,
  },
  "/error": {
    title: "Service temporairement indisponible | Dr. Ben Lallahom",
    description: "Information de disponibilité du service.",
    noIndex: true,
  },
  "/maintenance": {
    title: "Maintenance en cours | Dr. Ben Lallahom",
    description: "Information de maintenance du service.",
    noIndex: true,
  },
  "/venture/novarena": {
    title: "Novarena | Dr. Ben Lallahom",
    description: "Découvrez Novarena, initiative entrepreneuriale en santé portée par le Dr. Ahmed Ben Lallahom.",
  },
  "/venture/sawa4you": {
    title: "SAWA4YOU | Dr. Ben Lallahom",
    description: "Découvrez SAWA4YOU, initiative entrepreneuriale en santé portée par le Dr. Ahmed Ben Lallahom.",
  },
};

const PRIVATE_PREFIXES = ["/candidate/", "/admin"];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function getRouteSeo(url: string): RouteSeo {
  const pathname = new URL(url, ORIGIN).pathname.replace(/\/+$/, "") || "/";
  const known = PUBLIC_ROUTES[pathname];
  if (known) return { ...known, canonicalPath: pathname };

  if (pathname === "/booking/confirmation" || PRIVATE_PREFIXES.some(prefix => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix))) {
    return {
      title: `${SITE_NAME} | Espace sécurisé`,
      description: "Espace sécurisé du site Dr. Ahmed Ben Lallahom.",
      canonicalPath: pathname,
      noIndex: true,
    };
  }

  return {
    title: SITE_NAME,
    description: "Anesthésiste-réanimateur, entrepreneur en santé et consultant médical basé en France.",
    canonicalPath: pathname,
    noIndex: true,
    notFound: true,
  };
}

export function renderRouteSeoHead(url: string): string {
  const seo = getRouteSeo(url);
  const title = escapeHtml(seo.title);
  const description = escapeHtml(seo.description);
  const canonical = escapeHtml(`${ORIGIN}${seo.canonicalPath}`);
  const keywords = seo.keywords ? `<meta name="keywords" content="${escapeHtml(seo.keywords)}" />` : "";
  const robots = seo.noIndex ? "noindex, follow" : "index, follow";

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    keywords,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${DEFAULT_IMAGE}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:url" content="${canonical}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${DEFAULT_IMAGE}" />`,
    `<link rel="canonical" href="${canonical}" />`,
  ].filter(Boolean).join("\n    ");
}
