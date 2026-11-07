/**
 * ADM-09: the sections of the admin dashboard, in the order of its tab bar,
 * as its address names them: /admin?tab=…&ref=… opens the section and, in
 * a list that searches by reference, the element of that reference. The
 * owner's notifications link there (server/adminLinks.ts).
 */
export const ADMIN_TABS = [
  "overview",
  "appointments",
  "contacts",
  "medicalQuestions",
  "gdpr",
  "testimonials",
  "availability",
  "recruitment",
  "candidateDocuments",
  "security",
  "vivier",
  "mailing",
  "employerBriefs",
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

function isAdminTab(value: unknown): value is AdminTab {
  return typeof value === "string" && (ADMIN_TABS as readonly string[]).includes(value);
}

/**
 * A reference as the site writes them (C…, G…, APT…, QMED-…-…, CV…,
 * BRIEF…): letters, digits and hyphens only, so that an address of the
 * admin never carries a name, an email or any other personal data.
 */
const ADMIN_REFERENCE_PATTERN = /^[A-Za-z0-9-]{1,40}$/;

/** The path of a section of the dashboard, with the element of `reference` when it has the shape of one. */
export function adminPath(tab: AdminTab, reference?: string | null): string {
  const params = new URLSearchParams();
  if (tab !== "overview") params.set("tab", tab);
  if (reference && ADMIN_REFERENCE_PATTERN.test(reference)) params.set("ref", reference);
  const search = params.toString();
  return search ? `/admin?${search}` : "/admin";
}

/** The section and the reference an address of the dashboard names; the overview for a missing or unknown section. */
export function adminLocationOf(search: string): { tab: AdminTab; reference: string } {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  const reference = params.get("ref") ?? "";
  return { tab: isAdminTab(tab) ? tab : "overview", reference: ADMIN_REFERENCE_PATTERN.test(reference) ? reference : "" };
}
