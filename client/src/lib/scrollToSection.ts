/**
 * Amène le haut d'une section de l'accueil en haut de l'écran, que l'on vienne du menu, du bouton
 * « Me contacter » ou d'une adresse /#section (Home). Pas de scrollIntoView : le scroll-padding-top
 * réservé à l'en-tête fixe (index.css) s'ajouterait à la marge haute que chaque section a déjà, et
 * la section arriverait une centaine de pixels plus bas (PUB-01).
 */
export function scrollToSectionTop(section: Element | null, behavior: ScrollBehavior = "smooth") {
  if (!section) return;
  window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY, behavior });
}
