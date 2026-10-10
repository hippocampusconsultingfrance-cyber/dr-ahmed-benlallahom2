import { venturesFr } from "../client/src/data/ventures-fr";

/** Marqueur de client/index.html remplacé par le <head> propre à chaque route. */
export const ROUTE_SEO_MARKER = "<!--route-seo-->";
/** Copie intacte du shell SPA (avec marqueur) écrite au build pour Express. */
export const SPA_TEMPLATE_FILE = "_spa-template.html";
/** Shell SPA générique (noindex, sans canonique) servi par la réécriture Vercel. */
export const SPA_FALLBACK_FILE = "_spa-fallback.html";

const ORIGIN = "https://drahmedbenlallahom.com";
const SITE_NAME = "Dr. Ahmed Ben Lallahom";
const DEFAULT_IMAGE = `${ORIGIN}/assets/abl-logo.svg`;

type RouteSeo = {
  title: string;
  description: string;
  canonicalPath: string;
  keywords?: string;
  noIndex?: boolean;
  notFound?: boolean;
};

type PublicRouteSeo = Omit<RouteSeo, "canonicalPath"> & {
  /** URL canonique d'un alias (ex. /vvip-offshore → /recruitment/vvip-offshore). */
  canonicalPath?: string;
};

// Même extrait que ventureMetaDescription (client/src/pages/VenturePage.tsx) :
// le <head> initial et le <head> hydraté côté client restent identiques.
function ventureDescription(description: string[]) {
  const text = description[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length <= 160) return text;

  const excerpt = text.slice(0, 159);
  const lastWordBoundary = excerpt.lastIndexOf(" ");
  const end = lastWordBoundary >= 120 ? lastWordBoundary : 159;
  return `${excerpt.slice(0, end).trimEnd()}…`;
}

// Les pages /venture/:slug sont générées depuis la même source que la page
// client (ventures-fr.ts) pour qu'aucune entreprise publiée ne reste sans
// titre, description ni balises Open Graph.
const VENTURE_ROUTES: Record<string, PublicRouteSeo> = Object.fromEntries(
  venturesFr.map(venture => [
    `/venture/${venture.slug}`,
    {
      title: `${venture.company} — ${venture.role} | ${SITE_NAME}`,
      description: ventureDescription(venture.description),
      keywords: venture.tags.join(", "),
    },
  ]),
);

const PUBLIC_ROUTES: Record<string, PublicRouteSeo> = {
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
  "/questions-anesthesie": {
    title: "Questions santé | Anesthésie et opération",
    description: "Posez une question générale sur l’anesthésie ou une opération et recevez une réponse relue par email.",
    keywords: "questions anesthésie, information opération, information santé, préparation intervention",
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
    canonicalPath: "/recruitment/vvip-offshore",
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
  "/resources": {
    title: "Ressources médicales institutionnelles | Dr. Ben Lallahom",
    description: "Une sélection de portails institutionnels de santé pour prolonger votre information, sans remplacer un avis médical.",
  },
  "/press": {
    title: "Presse et publications | Dr. Ben Lallahom",
    description: "Informations institutionnelles vérifiables sur le parcours et les activités du Dr. Ahmed Ben Lallahom.",
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
  ...VENTURE_ROUTES,
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
  if (known) return { ...known, canonicalPath: known.canonicalPath ?? pathname };

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

/**
 * Routes publiques pré-rendues au build (scripts/prerender-route-seo.ts) :
 * chacune reçoit un fichier HTML statique avec son propre <head>, car Vercel
 * sert le HTML sans passer par Express.
 */
export function getPrerenderRoutes(): string[] {
  return Object.keys(PUBLIC_ROUTES);
}

type HeadInput = {
  title: string;
  description: string;
  keywords?: string;
  noIndex?: boolean;
  /** Absent pour la page de repli SPA : aucune URL canonique ni og:url. */
  canonicalUrl?: string;
};

function renderHead(input: HeadInput): string {
  const title = escapeHtml(input.title);
  const description = escapeHtml(input.description);
  const canonical = input.canonicalUrl ? escapeHtml(input.canonicalUrl) : undefined;
  const keywords = input.keywords ? `<meta name="keywords" content="${escapeHtml(input.keywords)}" />` : "";
  const robots = input.noIndex ? "noindex, follow" : "index, follow";

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    keywords,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:type" content="website" />`,
    canonical ? `<meta property="og:url" content="${canonical}" />` : "",
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${DEFAULT_IMAGE}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    canonical ? `<meta name="twitter:url" content="${canonical}" />` : "",
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${DEFAULT_IMAGE}" />`,
    canonical ? `<link rel="canonical" href="${canonical}" />` : "",
  ].filter(Boolean).join("\n    ");
}

export function renderRouteSeoHead(url: string): string {
  const seo = getRouteSeo(url);
  return renderHead({ ...seo, canonicalUrl: `${ORIGIN}${seo.canonicalPath}` });
}

/**
 * <head> de la page de repli SPA servie par Vercel pour toute URL sans
 * fichier pré-rendu (espaces candidat/admin, confirmation de réservation,
 * URL inconnues) : générique, non indexable, sans canonique vers l'accueil.
 */
export function renderFallbackSeoHead(): string {
  return renderHead({
    title: SITE_NAME,
    description: "Anesthésiste-réanimateur, entrepreneur en santé et consultant médical basé en France.",
    noIndex: true,
  });
}
