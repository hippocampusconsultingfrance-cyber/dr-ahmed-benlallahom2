/**
 * Interrupteurs des fonctionnalités publiques du site, lus à la fois par le client
 * (pages, index de recherche) et par le serveur (pré-rendu SEO, sitemap, API publique).
 * Modifier une valeur ici suffit : aucune autre configuration n'est nécessaire.
 */
export type PublicFeatureFlags = {
  /**
   * Témoignages publics : section de l'accueil, page /testimonials, son pré-rendu,
   * son entrée de sitemap et la liste publique `testimonials.list`.
   *
   * Désactivé par défaut (audit de lancement, LEGAL-08) : le Code de déontologie
   * médicale (art. R4127-19-1 CSP) interdit le recours aux témoignages de tiers dans
   * la communication du médecin. Les données et la gestion dans /admin sont conservées ;
   * ne le réactiver qu'après validation juridique.
   */
  testimonials: boolean;
};

export const PUBLIC_FEATURES: Readonly<PublicFeatureFlags> = Object.freeze({
  testimonials: false,
});

export function isPublicTestimonialsEnabled(flags: Readonly<PublicFeatureFlags> = PUBLIC_FEATURES): boolean {
  return flags.testimonials === true;
}
