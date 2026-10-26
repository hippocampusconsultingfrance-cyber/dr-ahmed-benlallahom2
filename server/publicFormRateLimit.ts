import { enforcePersistentRateLimit, recordPersistentRateLimitAttempt, releasePersistentRateLimitAttempt } from "./candidateSecurity";
import { notifyOwner } from "./_core/notification";

/** Clé de comptage : couple IP + email (formulaires), IP seule ou email seul (réservation). */
export type PublicFormRateLimitScope = "ip_email" | "ip" | "email";

export function publicFormRateLimitSubject(scope: PublicFormRateLimitScope, ipHash: string | null, email: string): string | null {
  if (scope === "ip_email") return `${ipHash ?? "unknown"}:${email}`;
  if (scope === "email") return `email:${email}`;
  // Sans IP identifiable, ne jamais regrouper tous les patients dans un seul
  // compteur « unknown » : quelques appels suffiraient à bloquer l’agenda pour
  // tout le monde. Le compteur par email et le plafond de créneaux retenus
  // restent appliqués dans ce cas.
  return ipHash ? `ip:${ipHash}` : null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// MAIL-01 : ces formulaires envoient un email à une adresse que personne n’a
// encore vérifiée. Leurs compteurs IP + email laissent un script changer
// d’adresse destinataire à chaque appel ; ce compteur par IP seule, ajouté
// aux existants, borne le nombre d’emails qu’une même IP fait partir. Le
// renvoi du lien d’activation a le sien : sans lui, chaque compte en attente
// inscrit au fil des heures redonnerait 4 envois par heure à la même IP.
// Seuls les envois acceptés comptent : chaque point d’entrée l’appelle après
// ses vérifications (anti-robot, fichier), juste avant l’enregistrement. La
// candidature en admet 10 : plusieurs soignants d’un même hôpital partagent
// souvent la même IP. Le contact et les demandes RGPD (ABUS-01) écrivent
// chacun au propriétaire : même compteur, en plus de leur limite IP + email.
export const PUBLIC_EMAIL_IP_RATE_LIMITS = {
  contact: { action: "public_contact_submit_ip", maxAttempts: 10, windowMs: HOUR_MS, blockMs: HOUR_MS },
  gdpr: { action: "public_gdpr_submit_ip", maxAttempts: 5, windowMs: DAY_MS, blockMs: DAY_MS },
  medicalQuestion: { action: "public_medical_question_submit_ip", maxAttempts: 5, windowMs: HOUR_MS, blockMs: HOUR_MS },
  recruitmentApply: { action: "public_recruitment_apply_ip", maxAttempts: 10, windowMs: HOUR_MS, blockMs: HOUR_MS },
  candidateRegister: { action: "candidate_register_ip", maxAttempts: 5, windowMs: HOUR_MS, blockMs: HOUR_MS },
  candidateVerificationResend: { action: "candidate_verification_resend_ip", maxAttempts: 5, windowMs: HOUR_MS, blockMs: HOUR_MS },
} as const;

/**
 * Compte un envoi accepté pour l’empreinte d’IP et lève, comme
 * enforcePersistentRateLimit, « candidate_security_rate_limited » au-delà du
 * seuil. Sans IP identifiable rien n’est compté (voir publicFormRateLimitSubject).
 */
export async function enforcePublicEmailIpRateLimit(kind: keyof typeof PUBLIC_EMAIL_IP_RATE_LIMITS, ipHash: string | null): Promise<void> {
  const subject = publicFormRateLimitSubject("ip", ipHash, "");
  if (!subject) return;
  await enforcePersistentRateLimit({ ...PUBLIC_EMAIL_IP_RATE_LIMITS[kind], subject });
}

/** Rend l’envoi compté par enforcePublicEmailIpRateLimit quand la demande échoue ensuite de notre côté (erreur 500). */
export async function releasePublicEmailIpRateLimit(kind: keyof typeof PUBLIC_EMAIL_IP_RATE_LIMITS, ipHash: string | null): Promise<void> {
  const subject = publicFormRateLimitSubject("ip", ipHash, "");
  if (!subject) return;
  await releasePersistentRateLimitAttempt({ ...PUBLIC_EMAIL_IP_RATE_LIMITS[kind], subject });
}

/**
 * ABUS-01 : nombre de demandes acceptées en un jour, tous visiteurs confondus,
 * au-delà duquel un formulaire continue d’enregistrer les demandes mais en
 * coupe les effets coûteux (accusé envoyé à l’adresse saisie, email au
 * propriétaire pour chaque demande, analyse IA d’un CV). Le propriétaire reçoit
 * une seule alerte groupée, et les demandes restent dans l’administration.
 * Le bilan quotidien de sécurité compare aussi à ces seuils le nombre de
 * demandes des dernières 24 heures ; la création d’espace candidat n’y a qu’une
 * alerte : son email d’activation est le service lui-même, il n’est jamais coupé.
 */
export const PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS = {
  contact: 50,
  gdpr: 20,
  medicalQuestion: 50,
  recruitmentApply: 100,
  candidateRegister: 50,
} as const;

export type PublicFormVolumeKind = keyof typeof PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS;
export type PublicFormDailyVolumeKind = Exclude<PublicFormVolumeKind, "candidateRegister">;

/** Libellés des alertes au propriétaire (pluriel, « 50 messages de contact »). */
export const PUBLIC_FORM_VOLUME_LABELS: Record<PublicFormVolumeKind, string> = {
  contact: "messages de contact",
  gdpr: "demandes RGPD",
  medicalQuestion: "questions santé",
  recruitmentApply: "candidatures",
  candidateRegister: "créations d’espace candidat",
};

const PUBLIC_FORM_DAILY_VOLUME_ACTIONS: Record<PublicFormDailyVolumeKind, string> = {
  contact: "public_contact_daily_volume",
  gdpr: "public_gdpr_daily_volume",
  medicalQuestion: "public_medical_question_daily_volume",
  recruitmentApply: "public_recruitment_apply_daily_volume",
};

const PUBLIC_FORM_SKIPPED_EFFECTS: Record<PublicFormDailyVolumeKind, string> = {
  contact: "sans email de notification pour chacune",
  gdpr: "sans email de notification pour chacune",
  medicalQuestion: "sans accusé de réception à l’adresse saisie ni email de notification pour chacune",
  recruitmentApply: "sans email de confirmation au candidat, sans email de notification pour chacune et sans analyse IA du CV (« Analyser le CV » sur les dossiers légitimes)",
};

/**
 * Compte une demande acceptée, déjà enregistrée, dans le volume du jour.
 * Renvoie false au-delà du seuil : l’appelant garde la demande et saute ses
 * effets coûteux pendant 24 heures. Le propriétaire reçoit une seule alerte
 * par jour, quel que soit le nombre de demandes ainsi traitées (même pour des
 * demandes simultanées). Un compteur indisponible ne coupe rien.
 */
export async function countPublicFormDailyVolume(kind: PublicFormDailyVolumeKind): Promise<boolean> {
  const threshold = PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS[kind];
  const action = PUBLIC_FORM_DAILY_VOLUME_ACTIONS[kind];
  let state: Awaited<ReturnType<typeof recordPersistentRateLimitAttempt>>;
  try {
    state = await recordPersistentRateLimitAttempt({ action, subject: "global", maxAttempts: threshold, windowMs: DAY_MS, blockMs: DAY_MS });
  } catch (error) {
    console.error("public_form_daily_volume_unavailable", error instanceof Error ? error.name : "UnknownError");
    return true;
  }
  if (!state.blocked) return true;
  const alertSlot = await recordPersistentRateLimitAttempt({ action: `${action}_alert`, subject: "global", maxAttempts: 1, windowMs: DAY_MS, blockMs: DAY_MS }).catch(() => null);
  if (alertSlot && !alertSlot.blocked) {
    await notifyOwner({
      title: `Volume inhabituel : plus de ${threshold} ${PUBLIC_FORM_VOLUME_LABELS[kind]} en 24 heures`,
      content: [
        `Le seuil quotidien de ${threshold} ${PUBLIC_FORM_VOLUME_LABELS[kind]} est dépassé (moins de 24 heures, tous visiteurs confondus).`,
        `Le formulaire reste ouvert : pendant les 24 prochaines heures, les demandes suivantes sont enregistrées ${PUBLIC_FORM_SKIPPED_EFFECTS[kind]}. Aucun autre email ne vous sera envoyé pour ce volume.`,
        "Consultez-les dans l’administration. S’il s’agit d’envois automatisés, activez l’Attack Challenge Mode du pare-feu Vercel.",
      ].join("\n\n"),
    }).catch(() => false);
  }
  return false;
}
