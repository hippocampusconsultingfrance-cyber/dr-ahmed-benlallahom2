/** The route of an address, without its query, hash and trailing slashes ("/" for the home page). */
export function routePath(pathname: string): string {
  return pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

/**
 * Private areas (candidate space, administration) show none of the public site's
 * floating controls: neither the WhatsApp button, which covered the portal's
 * actions on mobile (CAND-21), nor the cookie banner and its preferences, nor
 * the audience measurement, which runs nowhere there whatever the visitor chose
 * on the public site (ADM-16, App's FloatingWidgets and AnalyticsConsent).
 */
export function isPrivateAreaPath(pathname: string): boolean {
  const path = routePath(pathname);
  return path === "/admin" || path.startsWith("/admin/") || path === "/candidate" || path.startsWith("/candidate/");
}
