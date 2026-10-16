/** Owner notification for a new employer brief: everything needed to qualify and call back. */
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
  receivedAt?: Date;
  adminUrl?: string;
}) {
  const receivedAt = (input.receivedAt ?? new Date()).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" });
  const optional = (value: string | null | undefined) => value && value.trim() ? value.trim() : "non précisé";
  return {
    title: `Nouveau brief employeur (${input.briefId}) — ${input.organizationName}`,
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
      "",
      `Qualifier le brief et préparer la shortlist : ${input.adminUrl ?? "https://drahmedbenlallahom.com/admin"} (onglet « Missions »).`,
    ].join("\n"),
  };
}
