import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";

/**
 * Place le focus sur le h1 de la page affichée dans `root`, à défaut sur son <main>, sans la faire
 * défiler : elle s'ouvre toujours en haut (PUB-01). Une page chargée à la demande n'a son titre
 * qu'une fois affichée : on l'attend, au plus `timeoutMs`. Une page qui a déjà placé le focus chez
 * elle (le champ autoFocus de /search) le garde. Renvoie de quoi arrêter l'attente.
 */
function focusPageHeading(root: HTMLElement, timeoutMs = 10_000) {
  const focusHeading = () => {
    const active = root.ownerDocument.activeElement;
    if (active && active !== root.ownerDocument.body && root.contains(active)) return true;
    const target = root.querySelector<HTMLElement>("h1") ?? root.querySelector<HTMLElement>("main");
    if (!target) return false;
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    return true;
  };
  if (focusHeading()) return () => undefined;
  const observer = new MutationObserver(() => {
    if (focusHeading()) stop();
  });
  const timer = window.setTimeout(() => stop(), timeoutMs);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
  }
  observer.observe(root, { childList: true, subtree: true });
  return stop;
}

/**
 * Transition courte de contenu, automatiquement neutralisée par les préférences de réduction de mouvement.
 * Après un changement de page sans rechargement, le focus va au titre de la nouvelle page, qu'un
 * lecteur d'écran annonce, et la tabulation repart de là (A11Y-17). Il reste où il est au premier
 * chargement, pour une adresse avec ancre (/#contact, que la page amène elle-même) et quand seul
 * ?tab= change dans la même page (/legal, /admin) : le chemin, clé de la transition, est le même.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const pageRef = useRef<HTMLDivElement>(null);
  const shownLocation = useRef(location);

  useEffect(() => {
    if (shownLocation.current === location) return;
    shownLocation.current = location;
    if (window.location.hash || !pageRef.current) return;
    return focusPageHeading(pageRef.current);
  }, [location]);

  return <div key={location} ref={pageRef} className="page-transition">{children}</div>;
}
