import type { GdprRequestType } from "../shared/gdprRequestTypes";
import { adminLink } from "./adminLinks";

const REQUEST_TYPE_LABELS: Record<GdprRequestType, string> = {
  access: "Accès aux données",
  rectification: "Rectification de données",
  deletion: "Suppression de données (droit à l'oubli)",
  restriction: "Limitation du traitement",
  portability: "Portabilité des données",
  objection: "Opposition au traitement",
  consent_withdrawal: "Retrait du consentement",
};

/**
 * Owner notification for a new GDPR request: subject « [G…] Demande RGPD –
 * Nom », the reference first (INTL-11). The description, which can speak of
 * health, stays in the administration: a link to the GDPR tab instead, and
 * whether the requester's acknowledgement left (RGPD-13).
 */
export function buildGdprRequestOwnerNotification(input: {
  trackingId: string;
  requestType: GdprRequestType;
  name: string;
  email: string;
  phone?: string | null;
  hasDescription: boolean;
  acknowledged: boolean;
}) {
  return {
    reference: input.trackingId,
    title: "Demande RGPD",
    name: input.name,
    content: `**Numéro de suivi:** ${input.trackingId}\n**Type de demande:** ${REQUEST_TYPE_LABELS[input.requestType]}\n**De:** ${input.name}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n**Description:** ${input.hasDescription ? "à lire dans l’administration" : "aucune"}\n\n**Accusé de réception:** ${input.acknowledged ? "envoyé, avec un lien qui confirme l’adresse ; l’onglet RGPD indique si la personne a confirmé" : "non envoyé (voir les journaux du serveur)"}\n\n**Ouvrir la demande:** ${adminLink("gdpr", input.trackingId)}`,
  };
}
