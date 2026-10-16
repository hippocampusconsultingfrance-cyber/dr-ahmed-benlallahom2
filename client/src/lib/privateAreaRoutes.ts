/**
 * Private areas (candidate space, administration) do not show the floating
 * WhatsApp button nor the floating cookie-preferences pill: on mobile they
 * covered the portal's actions (CAND-21). The cookie consent banner itself is
 * still shown there when no choice has been made yet.
 */
export function isPrivateAreaPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return path === "/admin" || path.startsWith("/admin/") || path === "/candidate" || path.startsWith("/candidate/");
}
