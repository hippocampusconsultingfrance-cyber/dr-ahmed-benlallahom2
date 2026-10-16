import { siteConfig } from "../client/src/data/site-config";
import { BOOKING_PATIENT_REFUND_DEADLINE_HOURS } from "../shared/bookingPolicy";

/**
 * Sender, Reply-To and contact details of the patient emails (booking
 * confirmation, invoice, reminder, refund / cancellation).
 *
 * Defaults: the public contact email and phone of the site
 * (client/src/data/site-config.ts) and the existing transactional sender.
 * Optional overrides, without code change:
 * - CONSULTATION_REPLY_TO: mailbox that receives the patients' replies;
 * - CONSULTATION_FROM_EMAIL: sender, e.g. "Dr Ahmed Ben Lallahom <consultation@…>"
 *   (the domain must be verified in Resend);
 * - CONSULTATION_MODALITY_TEXT: how the consultation takes place (phone call,
 *   video link…), printed in the confirmation and the reminder when set.
 */
export const DEFAULT_TRANSACTIONAL_FROM = "Hippocampus Consulting <recrutement@drahmedbenlallahom.com>";

export type ConsultationContact = {
  from: string;
  replyTo: string;
  email: string;
  phone: string;
  modalityText: string | null;
};

type Env = Record<string, string | undefined>;

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SENDER_PATTERN = /^(?:[^<>]{1,120}<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

function envValue(env: Env, key: string, pattern?: RegExp): string | null {
  const value = env[key]?.trim();
  if (!value) return null;
  if (pattern && !pattern.test(value)) {
    console.warn(`[ConsultationContact] ${key} ignored: invalid format`);
    return null;
  }
  return value.slice(0, 500);
}

export function resolveConsultationContact(env: Env = process.env): ConsultationContact {
  return {
    from: envValue(env, "CONSULTATION_FROM_EMAIL", SENDER_PATTERN) ?? DEFAULT_TRANSACTIONAL_FROM,
    replyTo: envValue(env, "CONSULTATION_REPLY_TO", EMAIL_PATTERN) ?? siteConfig.email,
    email: siteConfig.email,
    phone: siteConfig.phone,
    modalityText: envValue(env, "CONSULTATION_MODALITY_TEXT"),
  };
}

/** Same rule as the booking page: full refund more than 24 h before, none after. */
export const PATIENT_CANCELLATION_POLICY = `Annulation : remboursement intégral si vous annulez plus de ${BOOKING_PATIENT_REFUND_DEADLINE_HOURS} heures avant le rendez-vous ; passé ce délai, la réservation n’est pas remboursable. Pour annuler, contactez-nous en indiquant votre référence.`;
