// Shared by the contact and GDPR forms and by the booking: persistent rate limits, anti-robot check, refusals with a stable reason, public tracking numbers.

import { randomInt } from "node:crypto";
import { PublicErrorReason } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { enforcePersistentRateLimit, hashSecurityValue, logSecurityEvent, releasePersistentRateLimitAttempt, requestIpHash } from "../candidateSecurity";
import { enforcePublicEmailIpRateLimit, PUBLIC_EMAIL_IP_RATE_LIMITS, publicFormRateLimitSubject, type PublicFormRateLimitScope } from "../publicFormRateLimit";
import { verifyCandidateTurnstile } from "../candidateTurnstile";
import type { BookingRefusalReason } from "../../shared/bookingPolicy";
import type { PublicFormRefusalReason } from "../../shared/publicFormRefusalReasons";

type PublicFormRateLimitPolicy = {
  action: string;
  /** Clé de comptage : couple IP + email (formulaires), IP seule ou email seul (réservation). */
  scope: PublicFormRateLimitScope;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
  blockedMessage?: string;
  /** Motif stable joint au refus, que la page de réservation (EN-06), le contact et le RGPD (ABUS-01) traduisent. */
  reason: BookingRefusalReason | PublicFormRefusalReason;
};

const DEFAULT_PUBLIC_FORM_BLOCKED_MESSAGE = "Veuillez patienter avant de soumettre une nouvelle demande.";
export const BOOKING_RATE_LIMIT_MESSAGE = "Trop de tentatives de réservation ont été effectuées. Veuillez réessayer dans une heure ou nous contacter directement.";

export const PUBLIC_FORM_RATE_LIMITS = {
  contact: { action: "public_contact_submit", scope: "ip_email", maxAttempts: 5, windowMs: 15 * 60 * 1000, blockMs: 60 * 60 * 1000, reason: "rate_limited" },
  gdpr: { action: "public_gdpr_submit", scope: "ip_email", maxAttempts: 3, windowMs: 24 * 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000, reason: "rate_limited" },
  // Chaque réservation bloque un créneau de 30 minutes et ouvre une session
  // Stripe. Le compteur par IP borne un script qui change d’email à chaque
  // appel ; le compteur par email borne une même identité qui change d’IP.
  bookingIp: { action: "public_booking_create_ip", scope: "ip", maxAttempts: 6, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000, blockedMessage: BOOKING_RATE_LIMIT_MESSAGE, reason: "rate_limited" },
  bookingEmail: { action: "public_booking_create_email", scope: "email", maxAttempts: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000, blockedMessage: BOOKING_RATE_LIMIT_MESSAGE, reason: "rate_limited" },
  // Réservations refusées faute de vérification anti-robot, que les deux
  // compteurs précédents ne retiennent pas (ABUS-02) : bornées à part, bien
  // plus haut. Au-delà, ces refus comptent de nouveau dans les deux compteurs
  // précédents, qui arrêtent un script qui ne la passe jamais avant l’agenda.
  // Un patient n’en reçoit qu’une par réservation.
  bookingChallengeIp: { action: "public_booking_challenge_ip", scope: "ip", maxAttempts: 30, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000, blockedMessage: BOOKING_RATE_LIMIT_MESSAGE, reason: "rate_limited" },
} as const satisfies Record<string, PublicFormRateLimitPolicy>;

const NO_ATTEMPT_COUNTED = async () => undefined;

/**
 * Compte un essai et renvoie de quoi le rendre, pour une demande refusée
 * ensuite sans y être pour rien (vérification anti-robot demandée, ABUS-02).
 */
export async function enforcePublicFormRateLimit(input: {
  kind: keyof typeof PUBLIC_FORM_RATE_LIMITS;
  email: string;
  headers: Record<string, unknown>;
  remoteIp?: string | null;
}): Promise<() => Promise<void>> {
  // Les tests d’intégration réemploient volontairement les mêmes adresses dans
  // plusieurs scénarios indépendants. La protection persistante reste active
  // dans tous les environnements réels ; ses seuils sont couverts séparément.
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return NO_ATTEMPT_COUNTED;

  const ipHash = requestIpHash(input.headers) ?? (input.remoteIp ? hashSecurityValue(input.remoteIp) : null);
  const { scope, blockedMessage, reason, ...policy }: PublicFormRateLimitPolicy = PUBLIC_FORM_RATE_LIMITS[input.kind];
  const subject = publicFormRateLimitSubject(scope, ipHash, input.email);
  if (!subject) return NO_ATTEMPT_COUNTED;
  try {
    await enforcePersistentRateLimit({
      ...policy,
      subject,
    });
  } catch {
    await logSecurityEvent({
      actorKind: "anonymous",
      category: `${policy.action}_rate_limit`,
      outcome: "blocked",
      severity: "warning",
      ipHash,
    });
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: blockedMessage ?? DEFAULT_PUBLIC_FORM_BLOCKED_MESSAGE, cause: new PublicErrorReason(reason) });
  }
  return () => releasePersistentRateLimitAttempt({ ...policy, subject });
}

export const PUBLIC_FORM_SECURITY_CHECK_FAILED_MESSAGE = "La vérification anti-robot a échoué. Rechargez la page, puis renvoyez votre demande.";

export const PUBLIC_FORM_SECURITY_CHECK_UNAVAILABLE_MESSAGE = "La vérification anti-robot est momentanément indisponible. Votre demande n’a pas été envoyée : veuillez réessayer dans quelques minutes.";

/** Refus du contact ou du RGPD : message français et motif stable que le formulaire traduit (ABUS-01). */
function publicFormRefusal(code: "BAD_REQUEST" | "TOO_MANY_REQUESTS" | "SERVICE_UNAVAILABLE", reason: PublicFormRefusalReason, message: string) {
  return new TRPCError({ code, message, cause: new PublicErrorReason(reason) });
}

function publicFormIpHash(req: { headers: unknown; ip?: string | null }) {
  return requestIpHash(req.headers as Record<string, unknown>) ?? (req.ip ? hashSecurityValue(req.ip) : null);
}

/**
 * Anti-robot du contact et du RGPD : un jeton refusé ou absent est un refus
 * 400 avec un motif stable, et non plus une erreur interne (500). Quand
 * Cloudflare n’a pas pu juger le jeton (siteverify injoignable ou en erreur,
 * secret absent), le visiteur n’y est pour rien et recharger la page n’y
 * changerait rien : refus 503 distinct, comme à la réservation. Appelé avant
 * les deux limites (IP + email, puis IP seule), il n’entame pas leur budget.
 */
export async function verifyPublicFormTurnstile(kind: "contact" | "gdpr", token: string | undefined, req: { headers: unknown; ip?: string | null }) {
  try {
    await verifyCandidateTurnstile({ token: token ?? "", remoteIp: req.ip });
  } catch (error) {
    const unavailable = Boolean(token) && !(error instanceof Error && error.message === "candidate_turnstile_invalid");
    const category = `${PUBLIC_FORM_RATE_LIMITS[kind].action}_turnstile${unavailable ? "_unavailable" : ""}`;
    await logSecurityEvent({ actorKind: "anonymous", category, outcome: unavailable ? "failed" : "blocked", severity: "warning", ipHash: publicFormIpHash(req) }).catch(() => undefined);
    throw unavailable
      ? publicFormRefusal("SERVICE_UNAVAILABLE", "security_check_unavailable", PUBLIC_FORM_SECURITY_CHECK_UNAVAILABLE_MESSAGE)
      : publicFormRefusal("BAD_REQUEST", "security_check_failed", PUBLIC_FORM_SECURITY_CHECK_FAILED_MESSAGE);
  }
}

/**
 * ABUS-01 : limite par IP seule du contact et des demandes RGPD, en plus de
 * leur limite IP + email. Appelée une fois l’anti-robot passé, pour ne compter
 * que les demandes acceptées ; renvoie l’empreinte d’IP pour rendre l’essai si
 * l’enregistrement échoue ensuite.
 */
export async function enforcePublicFormIpLimit(kind: "contact" | "gdpr", req: { headers: unknown; ip?: string | null }) {
  const ipHash = publicFormIpHash(req);
  try {
    await enforcePublicEmailIpRateLimit(kind, ipHash);
  } catch (error) {
    if (!(error instanceof Error && error.message === "candidate_security_rate_limited")) throw error;
    await logSecurityEvent({ actorKind: "anonymous", category: `${PUBLIC_EMAIL_IP_RATE_LIMITS[kind].action}_rate_limit`, outcome: "blocked", severity: "warning", ipHash });
    throw publicFormRefusal("TOO_MANY_REQUESTS", "rate_limited", DEFAULT_PUBLIC_FORM_BLOCKED_MESSAGE);
  }
  return ipHash;
}

const PUBLIC_TRACKING_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Numéro de suivi imprévisible pour les formulaires publics (contact, RGPD) :
 * préfixe + 12 caractères alphanumériques majuscules tirés par le générateur
 * cryptographique (≈ 62 bits), soit 13 caractères pour une colonne varchar(20).
 */
export function createPublicTrackingId(prefix: "C" | "G"): string {
  let suffix = "";
  for (let index = 0; index < 12; index += 1) {
    suffix += PUBLIC_TRACKING_ID_ALPHABET[randomInt(PUBLIC_TRACKING_ID_ALPHABET.length)];
  }
  return `${prefix}${suffix}`;
}
