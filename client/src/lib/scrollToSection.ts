/**
 * Amène le haut d'une section de l'accueil en haut de l'écran, que l'on vienne du menu, du bouton
 * « Me contacter » ou d'une adresse /#section (Home). Pas de scrollIntoView : le scroll-padding-top
 * réservé à l'en-tête fixe (index.css) s'ajouterait à la marge haute que chaque section a déjà, et
 * la section arriverait une centaine de pixels plus bas (PUB-01).
 */
export function scrollToSectionTop(section: HTMLElement | null, behavior: ScrollBehavior = "smooth") {
  if (!section) return;
  window.scrollTo({ top: layoutTop(section), behavior });
}

/**
 * Position de la section dans la page, sans les transformations en cours : une section pas encore
 * révélée (.fade-in-up, translateY(24px)) se mesure 24 px plus bas que là où elle s'arrête, et
 * défiler jusqu'à sa mesure la laissait 24 px au-dessus du haut de l'écran une fois l'animation
 * finie. offsetTop ignore les transformations.
 */
function layoutTop(section: HTMLElement) {
  let top = 0;
  for (let node: HTMLElement | null = section; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}
