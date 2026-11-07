import { adminPath, type AdminTab } from "../shared/adminTabs";
import { DEFAULT_PUBLIC_ORIGIN } from "./routers/publicOrigin";

/**
 * ADM-09: the link of an owner notification to its section of the dashboard
 * and, by its reference, to the element itself, on the site's public address
 * (PUBLIC_APP_ORIGIN), never on a host taken from the request. The link names
 * the section and the reference only: no name, email or other personal data.
 */
export function adminLink(tab: AdminTab, reference?: string): string {
  return new URL(adminPath(tab, reference), DEFAULT_PUBLIC_ORIGIN).toString();
}
