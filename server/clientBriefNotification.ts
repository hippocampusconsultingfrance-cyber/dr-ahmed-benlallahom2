import { adminLink } from "./adminLinks";
import { PARIS_TIME_ZONE } from "../shared/parisTime";

/**
 * Owner notification for a new employer brief: everything needed to qualify
 * and call back. Subject « [BRIEF…] Brief employeur – Organisation », the
 * reference first (INTL-11); a link to the Missions tab (ADM-09).
 */
export function buildClientBriefOwnerNotification(input: {
  briefId: string;
  organizationName: string;
  contactName: string;
  email: string;
  phone?: string | null;
  targetEnvironment: string;
  specialtyNeeded: string;
  country: string;
  requiredCertifications?: string | null;
  timeline?: string | null;
  notes?: string | null;
  /** Language of the page, that of the employer's acknowledgement (REC-12). */
  language?: string | null;
  receivedAt?: Date;
  adminUrl?: string;
}) {
  const receivedAt = (input.receivedAt ?? new Date()).toLocaleString("fr-FR", {
    timeZone: PARIS_TIME_ZONE,
    dateStyle: "long",
    timeStyle: "short",
  });
  const optional = (value: string | null | undefined) =>
    value && value.trim() ? value.trim() : "non précisé";
  return {
    reference: input.briefId,
    title: "Brief employeur",
    name: input.organizationName,
    content: [
      `Reçu le : ${receivedAt}`,
      `Organisation : ${input.organizationName}`,
      `Contact : ${input.contactName}`,
      `Email : ${input.email}`,
      `Téléphone : ${optional(input.phone)}`,
      `Environnement : ${input.targetEnvironment}`,
      `Spécialité recherchée : ${input.specialtyNeeded}`,
      `Pays : ${input.country}`,
      `Certifications / exigences : ${optional(input.requiredCertifications)}`,
      `Calendrier : ${optional(input.timeline)}`,
      `Notes de l’employeur : ${optional(input.notes)}`,
      `Langue de la page : ${input.language || "non précisée"}`,
      "",
      `Qualifier le brief et préparer la shortlist : ${input.adminUrl ?? adminLink("employerBriefs", input.briefId)} (onglet « Missions »).`,
    ].join("\n"),
  };
}
