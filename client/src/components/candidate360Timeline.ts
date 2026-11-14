import { certificationExpiryInFrench } from "@shared/recruitmentFactOrigins";
import { formatAdminDate } from "./adminDateFormat";

export type CandidateTimelineEvent = {
  id: string;
  date: Date;
  kind: "application" | "action" | "email" | "campaign" | "follow_up";
  title: string;
  detail?: string;
};

type AuditEntry = {
  id: number;
  action: string;
  metadata: string | null;
  createdAt: Date;
};
type CampaignEntry = {
  id: number;
  campaignTitle: string | null;
  deliveryStatus: string;
  error: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  lastEventAt: Date | null;
};
type FollowUpEntry = {
  id: number;
  kind: string;
  status: string;
  notes: string | null;
  dueAt: Date;
  completedAt: Date | null;
};

/** ADM-07: a campaign email's delivery in words, not as stored (recruitment_campaign_recipients.delivery_status). */
const DELIVERY_STATUS_LABELS: Record<string, string> = {
  queued: "en attente d’envoi",
  sent: "envoyé",
  delivered: "remis",
  delayed: "remise retardée",
  bounced: "rejeté par la messagerie du destinataire",
  complained: "signalé comme indésirable",
  failed: "échec de l’envoi",
  suppressed: "adresse bloquée par le service d’envoi",
  skipped: "non envoyé (consentement retiré ou profil fermé)",
};

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function auditTitle(action: string, metadata: Record<string, unknown>) {
  if (action === "email") {
    return metadata.template === "additional_information"
      ? "Demande de complément envoyée"
      : "Proposition d’échange envoyée";
  }
  // IA-02, RGPD-03.
  if (metadata.event === "certification_confirmed")
    return `Certification confirmée : ${metadata.certification}`;
  if (metadata.event === "certification_unconfirmed")
    return `Confirmation retirée : ${metadata.certification}${metadata.notRetainedByAnalysis ? " (non retenue par la dernière analyse du CV)" : ""}`;
  if (metadata.event === "certification_renewed")
    return `Renouvellement confirmé : ${metadata.certification} (${typeof metadata.expiresAt === "string" ? `expire ${certificationExpiryInFrench(metadata.expiresAt)}` : "sans date d’expiration"})`;
  if (metadata.event === "mission_consent")
    return metadata.consentDate
      ? "Accord du candidat noté pour une mission"
      : "Accord du candidat retiré pour une mission";
  const labels: Record<string, string> = {
    created: "Candidature créée",
    status_update: "Statut ou suivi mis à jour",
    reanalyze: "Analyse IA relancée",
    download: "CV consulté par l’administration",
    erase: "Action d’effacement RGPD",
  };
  return labels[action] || "Action administrative";
}

export function buildCandidateTimeline(input: {
  createdAt: Date;
  audits: AuditEntry[];
  campaignRecipients: CampaignEntry[];
  followUps: FollowUpEntry[];
}): CandidateTimelineEvent[] {
  const events: CandidateTimelineEvent[] = [
    {
      id: "application",
      date: input.createdAt,
      kind: "application",
      title: "Candidature reçue",
    },
  ];

  input.audits.forEach(audit => {
    const metadata = parseMetadata(audit.metadata);
    const requested =
      typeof metadata.customRequest === "string" &&
      metadata.customRequest.trim()
        ? `Pièces ou informations demandées : ${metadata.customRequest}`
        : undefined;
    events.push({
      id: `audit-${audit.id}`,
      date: audit.createdAt,
      kind: audit.action === "email" ? "email" : "action",
      title: auditTitle(audit.action, metadata),
      detail: requested,
    });
  });

  input.campaignRecipients.forEach(recipient => {
    const date =
      recipient.lastEventAt || recipient.deliveredAt || recipient.sentAt;
    if (!date) return;
    events.push({
      id: `campaign-${recipient.id}`,
      date,
      kind: "campaign",
      title: `Campagne : ${recipient.campaignTitle || "offre de recrutement"}`,
      detail:
        recipient.error ||
        `Statut de délivrabilité : ${DELIVERY_STATUS_LABELS[recipient.deliveryStatus] ?? recipient.deliveryStatus}`,
    });
  });

  input.followUps.forEach(task => {
    events.push({
      id: `followup-${task.id}`,
      date: task.completedAt || task.dueAt,
      kind: "follow_up",
      title:
        task.status === "completed"
          ? "Relance terminée"
          : task.status === "dismissed"
            ? "Relance écartée"
            : "Relance à effectuer",
      detail: task.notes || `Échéance : ${formatAdminDate(task.dueAt)}`,
    });
  });

  return events.sort(
    (left, right) => right.date.getTime() - left.date.getTime()
  );
}
