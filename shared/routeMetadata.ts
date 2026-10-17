import { isPublicTestimonialsEnabled } from "./publicFeatures";

/**
 * Source unique des métadonnées SEO des routes publiques (SEO-02 / PUB-SEO-01).
 *
 * Lue par :
 *  - server/routeSeo.ts → <head> pré-rendu au build (scripts/prerender-route-seo.ts),
 *    servi tel quel par Vercel et lu par les robots d'aperçu (LinkedIn, WhatsApp…) ;
 *  - client/src/components/SEOHead.tsx → <head> après hydratation (lu par Google).
 * En français (langue par défaut et seule langue indexée), titre, description, mots-clés,
 * canonique, robots et image de partage sont donc identiques dans les deux cas. Les props
 * de SEOHead ne servent plus qu'aux autres langues et aux routes dynamiques (/venture/*,
 * pages privées), dont les valeurs FR sont générées depuis les mêmes données.
 */
export const SITE_ORIGIN = "https://drahmedbenlallahom.com";
export const SITE_NAME = "Dr. Ahmed Ben Lallahom";

/** Robots d'une page publique indexable / non indexable (pré-rendu et client). */
export const ROBOTS_INDEX = "index, follow, max-image-preview:large";
export const ROBOTS_NOINDEX = "noindex, follow";
/** Pages privées hors table (espace candidat, confirmation…) : rien à suivre ni archiver. */
export const ROBOTS_PRIVATE = "noindex, nofollow, noarchive";

export type ShareImage = { url: string; width: number; height: number; type: string; alt: string };

/** Image de partage raster 1200x630 (SEO-01) : LinkedIn, Facebook, WhatsApp et X n'affichent pas les SVG. */
export const DEFAULT_SHARE_IMAGE: ShareImage = {
  url: `${SITE_ORIGIN}/assets/og/og-default.png`,
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Dr Ahmed Ben Lallahom — anesthésie-réanimation, conseil en santé et recrutement médical (Hippocampus Consulting)",
};

export type RouteMetadata = {
  title: string;
  description: string;
  keywords?: string;
  noIndex?: boolean;
  /** URL canonique d'un alias (ex. /vvip-offshore → /recruitment/vvip-offshore). */
  canonicalPath?: string;
};

/** Routes publiques statiques. Les pages /venture/:slug sont ajoutées par server/routeSeo.ts depuis ventures-fr.ts. */
export const STATIC_ROUTE_METADATA: Readonly<Record<string, RouteMetadata>> = {
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
  // Publiée uniquement si les témoignages sont réactivés (LEGAL-08, shared/publicFeatures.ts).
  ...(isPublicTestimonialsEnabled()
    ? {
        "/testimonials": {
          title: "Témoignages de partenaires | Dr. Ben Lallahom",
          description: "Découvrez les témoignages de partenaires ayant collaboré avec le Dr. Ahmed Ben Lallahom.",
        },
      }
    : {}),
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
};

export function normalizePathname(url: string): string {
  return new URL(url, SITE_ORIGIN).pathname.replace(/\/+$/, "") || "/";
}

export function canonicalUrlFor(path: string): string {
  return `${SITE_ORIGIN}${path}`;
}

export function getStaticRouteMetadata(url: string): (RouteMetadata & { canonicalPath: string }) | null {
  const pathname = normalizePathname(url);
  const known = STATIC_ROUTE_METADATA[pathname];
  return known ? { ...known, canonicalPath: known.canonicalPath ?? pathname } : null;
}

export type ClientSeoProps = {
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
  ogUrl?: string;
  noIndex?: boolean;
};

export type ResolvedSeo = {
  title: string;
  description: string;
  keywords?: string;
  robots: string;
  /** Absente pour une page privée sans URL explicite : jamais l'accueil comme canonique. */
  canonicalUrl?: string;
  ogUrl: string;
  image: ShareImage;
};

/**
 * <head> appliqué par SEOHead après hydratation. Pour une route publique connue, la table
 * ci-dessus fait foi (en français) ; sinon les props de la page sont utilisées.
 */
export function resolveClientSeo(pathname: string, language: string, props: ClientSeoProps): ResolvedSeo {
  const image = props.ogImage ? { ...DEFAULT_SHARE_IMAGE, url: props.ogImage } : DEFAULT_SHARE_IMAGE;
  const meta = getStaticRouteMetadata(pathname);
  if (meta) {
    const french = language === "fr";
    const canonicalUrl = canonicalUrlFor(meta.canonicalPath);
    return {
      title: french ? meta.title : props.title,
      description: french ? meta.description : props.description,
      keywords: french ? meta.keywords : props.keywords,
      robots: meta.noIndex ? ROBOTS_NOINDEX : ROBOTS_INDEX,
      canonicalUrl,
      ogUrl: canonicalUrl,
      image,
    };
  }
  const homeUrl = canonicalUrlFor("/");
  return {
    title: props.title,
    description: props.description,
    keywords: props.keywords,
    robots: props.noIndex ? ROBOTS_PRIVATE : ROBOTS_INDEX,
    canonicalUrl: props.ogUrl ?? (props.noIndex ? undefined : homeUrl),
    ogUrl: props.ogUrl ?? homeUrl,
    image,
  };
}
