/**
 * Ouvre en haut la page qu'atteint une navigation côté client (PUB-01), comme le ferait un
 * chargement complet : un lien wouter, navigate() ou un remplacement vers une autre route. Sans
 * cela, la page atteinte par le pied de page s'affichait défilée de la hauteur de la précédente
 * (/legal?tab=privacy à 3 667 px), son onglet hors de vue. wouter signale chaque pushState et
 * replaceState par un événement du même nom, une fois l'adresse changée.
 * Restent tels quels :
 * - une adresse avec une ancre (#contact), que la page amène elle-même (scrollToSectionTop) ;
 * - Retour et Avance (popstate), dont le navigateur restaure la position ;
 * - un remplacement qui reste sur la page : l'onglet choisi dans /legal, ?lang= retiré.
 * Un lien vers la page affichée (le pied de page de /legal vers ?tab=privacy) la remonte, pour
 * montrer l'onglet qu'il ouvre. Renvoie de quoi retirer l'écoute.
 */
export function scrollToTopOnNavigation(target: Window = window) {
  let pathname = target.location.pathname;
  const navigated = (event: Event) => {
    const samePage = target.location.pathname === pathname;
    pathname = target.location.pathname;
    if (target.location.hash || (event.type === "replaceState" && samePage)) return;
    target.scrollTo({ top: 0, left: 0, behavior: "instant" });
  };
  const restored = () => {
    pathname = target.location.pathname;
  };
  target.addEventListener("pushState", navigated);
  target.addEventListener("replaceState", navigated);
  target.addEventListener("popstate", restored);
  return () => {
    target.removeEventListener("pushState", navigated);
    target.removeEventListener("replaceState", navigated);
    target.removeEventListener("popstate", restored);
  };
}
