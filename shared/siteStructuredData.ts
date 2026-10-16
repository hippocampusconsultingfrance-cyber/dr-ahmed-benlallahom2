import { siteConfig } from "../client/src/data/site-config";
import { SITE_NAME, SITE_ORIGIN } from "./routeMetadata";

/**
 * Données structurées schema.org du site (SEO-04), générées au pré-rendu de l'accueil
 * depuis client/src/data/site-config.ts : même email, même profil LinkedIn et même
 * téléphone que le pied de page. Images matricielles uniquement (Google n'accepte pas
 * le SVG pour Person/Organization). Pas de SearchAction (Google n'affiche plus la
 * sitelinks searchbox) ni de LocalBusiness sans adresse d'accueil du public.
 */
export const PERSON_IMAGE_URL = `${SITE_ORIGIN}/assets/team/ahmed-ben-lallahom.webp`;
export const ORGANIZATION_LOGO_URL = `${SITE_ORIGIN}/icon-512.png`;

export function buildSiteStructuredData(): Record<string, unknown>[] {
  const contactPoint = {
    "@type": "ContactPoint",
    contactType: "customer service",
    telephone: siteConfig.phone,
    email: siteConfig.email,
    availableLanguage: ["fr", "en"],
  };
  const address = { "@type": "PostalAddress", addressCountry: "FR" };
  const sameAs = [siteConfig.linkedin];

  return [
    {
      "@context": "https://schema.org",
      "@type": "Person",
      name: SITE_NAME,
      url: SITE_ORIGIN,
      image: PERSON_IMAGE_URL,
      description: "Anesthésiste-réanimateur, entrepreneur en santé et consultant médical basé en France.",
      jobTitle: "Anesthésiste-réanimateur",
      honorificSuffix: siteConfig.credentials,
      worksFor: {
        "@type": "Organization",
        name: "Hippocampus Consulting",
        url: `${SITE_ORIGIN}/venture/hippocampus-consulting`,
      },
      sameAs,
      contactPoint,
      address,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_ORIGIN,
      logo: ORGANIZATION_LOGO_URL,
      description: "Conseil en santé, information sur l’anesthésie et recrutement médical international (Hippocampus Consulting).",
      sameAs,
      contactPoint,
      address,
      knowsAbout: ["Anesthésie", "Réanimation", "Entrepreneuriat en santé", "Conseil médical", "Recrutement médical"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_ORIGIN,
      inLanguage: "fr-FR",
    },
  ];
}

/** Sérialisation sûre dans un <script> (aucune séquence </script> possible). */
export function renderStructuredDataScripts(schemas: Record<string, unknown>[]): string {
  return schemas
    .map(schema => `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`)
    .join("\n    ");
}
