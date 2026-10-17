import { venturesFr } from "../client/src/data/ventures-fr";
import {
  DEFAULT_SHARE_IMAGE,
  ROBOTS_INDEX,
  ROBOTS_NOINDEX,
  SITE_NAME,
  SITE_ORIGIN,
  STATIC_ROUTE_METADATA,
  canonicalUrlFor,
  normalizePathname,
  type RouteMetadata,
  type ShareImage,
} from "../shared/routeMetadata";
import { buildSiteStructuredData, renderStructuredDataScripts } from "../shared/siteStructuredData";

/** Marqueur de client/index.html remplacé par le <head> propre à chaque route. */
export const ROUTE_SEO_MARKER = "<!--route-seo-->";
/** Copie intacte du shell SPA (avec marqueur) écrite au build pour Express. */
export const SPA_TEMPLATE_FILE = "_spa-template.html";
/** Shell SPA générique (noindex, sans canonique) servi par la réécriture Vercel. */
export const SPA_FALLBACK_FILE = "_spa-fallback.html";

type RouteSeo = RouteMetadata & {
  canonicalPath: string;
  notFound?: boolean;
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
const VENTURE_ROUTES: Record<string, RouteMetadata> = Object.fromEntries(
  venturesFr.map(venture => [
    `/venture/${venture.slug}`,
    {
      title: `${venture.company} — ${venture.role} | ${SITE_NAME}`,
      description: ventureDescription(venture.description),
      keywords: venture.tags.join(", "),
    },
  ]),
);

// Table statique partagée avec SEOHead (shared/routeMetadata.ts) + pages /venture/*.
const PUBLIC_ROUTES: Record<string, RouteMetadata> = {
  ...STATIC_ROUTE_METADATA,
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
  const pathname = normalizePathname(url);
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

/**
 * Routes du sitemap.xml (SEO-03) : routes pré-rendues indexables, sans les alias
 * dont la canonique pointe vers une autre URL. Généré au build, jamais à la main.
 */
export function getSitemapRoutes(): string[] {
  return getPrerenderRoutes().filter(route => {
    const seo = getRouteSeo(route);
    return !seo.noIndex && !seo.notFound && seo.canonicalPath === route;
  });
}

export function renderSitemapXml(lastmod: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) throw new Error(`lastmod invalide : ${lastmod}`);
  const urls = getSitemapRoutes().map(route => {
    const priority = route === "/" ? "1.0" : route.split("/").length > 2 ? "0.6" : "0.8";
    return [
      "  <url>",
      `    <loc>${escapeHtml(canonicalUrlFor(route))}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      "    <changefreq>monthly</changefreq>",
      `    <priority>${priority}</priority>`,
      "  </url>",
    ].join("\n");
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

type HeadInput = {
  title: string;
  description: string;
  keywords?: string;
  noIndex?: boolean;
  /** Absent pour la page de repli SPA : aucune URL canonique ni og:url. */
  canonicalUrl?: string;
  image?: ShareImage;
  structuredData?: Record<string, unknown>[];
};

function renderHead(input: HeadInput): string {
  const title = escapeHtml(input.title);
  const description = escapeHtml(input.description);
  const canonical = input.canonicalUrl ? escapeHtml(input.canonicalUrl) : undefined;
  const keywords = input.keywords ? `<meta name="keywords" content="${escapeHtml(input.keywords)}" />` : "";
  const robots = input.noIndex ? ROBOTS_NOINDEX : ROBOTS_INDEX;
  const image = input.image ?? DEFAULT_SHARE_IMAGE;
  const imageUrl = escapeHtml(image.url);
  const imageAlt = escapeHtml(image.alt);

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    keywords,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:type" content="website" />`,
    canonical ? `<meta property="og:url" content="${canonical}" />` : "",
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${imageUrl}" />`,
    `<meta property="og:image:type" content="${escapeHtml(image.type)}" />`,
    `<meta property="og:image:width" content="${image.width}" />`,
    `<meta property="og:image:height" content="${image.height}" />`,
    `<meta property="og:image:alt" content="${imageAlt}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    canonical ? `<meta name="twitter:url" content="${canonical}" />` : "",
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${imageUrl}" />`,
    `<meta name="twitter:image:alt" content="${imageAlt}" />`,
    canonical ? `<link rel="canonical" href="${canonical}" />` : "",
    input.structuredData?.length ? renderStructuredDataScripts(input.structuredData) : "",
  ].filter(Boolean).join("\n    ");
}

export function renderRouteSeoHead(url: string): string {
  const seo = getRouteSeo(url);
  return renderHead({
    ...seo,
    canonicalUrl: canonicalUrlFor(seo.canonicalPath),
    // Données structurées du site uniquement sur l'accueil (pas sur les pages non indexables).
    structuredData: seo.canonicalPath === "/" && !seo.noIndex ? buildSiteStructuredData() : undefined,
  });
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

