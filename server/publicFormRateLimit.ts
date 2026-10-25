import { enforcePersistentRateLimit, releasePersistentRateLimitAttempt } from "./candidateSecurity";

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

// MAIL-01 : ces formulaires envoient un email à une adresse que personne n’a
// encore vérifiée. Leurs compteurs IP + email laissent un script changer
// d’adresse destinataire à chaque appel ; ce compteur par IP seule, ajouté
// aux existants, borne le nombre d’emails qu’une même IP fait partir. Le
// renvoi du lien d’activation a le sien : sans lui, chaque compte en attente
// inscrit au fil des heures redonnerait 4 envois par heure à la même IP.
// Seuls les envois acceptés comptent : chaque point d’entrée l’appelle après
// ses vérifications (anti-robot, fichier), juste avant l’enregistrement. La
// candidature en admet 10 : plusieurs soignants d’un même hôpital partagent
// souvent la même IP.
export const PUBLIC_EMAIL_IP_RATE_LIMITS = {
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
