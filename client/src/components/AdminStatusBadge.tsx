import type { ReactNode } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { UserLanguage } from "@/contexts/userPreferences";
import { cn } from "@/lib/utils";
import { APPOINTMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "./appointmentStatusLabels";
import { GDPR_REQUEST_STATUS_LABELS } from "./gdprRequestAdmin";

/**
 * A11Y-12: the colours of the admin's badges. In the light theme, a -700 text
 * on a -50 background (4.8:1 at least, AdminStatusBadge.test.ts); in the dark
 * one, a -300 text on its tint.
 */
export const ADMIN_BADGE_TONES = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  alert: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-300",
  danger: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300",
  info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300",
  accent: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300",
  neutral: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/15 dark:text-slate-300",
} as const;

export type AdminBadgeTone = keyof typeof ADMIN_BADGE_TONES;

/** A badge of the admin in one of its tones; `title` explains it on hover. */
export function AdminBadge({ tone, title, className, children }: { tone: AdminBadgeTone; title?: string; className?: string; children: ReactNode }) {
  return <span title={title} className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium", ADMIN_BADGE_TONES[tone], className)}>{children}</span>;
}

/**
 * ADM-07: what the admin shows a status of, in words rather than as its stored
 * value. « featured » is not a testimonial's status: its « Mis en avant » badge.
 */
const ADMIN_STATUS_TONES = {
  payment: { pending: "warning", completed: "success", failed: "danger", refunded: "accent" },
  appointment: { held: "warning", confirmed: "info", cancelled: "danger", completed: "success", no_show: "neutral" },
  medicalQuestion: { submitted: "warning", drafting: "info", answered: "success", published: "accent", rejected: "neutral" },
  testimonial: { pending: "warning", approved: "success", rejected: "danger", featured: "accent" },
  gdprRequest: { pending: "warning", in_progress: "info", completed: "success", rejected: "danger" },
} as const satisfies Record<string, Record<string, AdminBadgeTone>>;

export type AdminStatusKind = keyof typeof ADMIN_STATUS_TONES;

/**
 * The labels, in French (those of the bookings and of the GDPR requests shared
 * with a person's data) and in English; another language of the site reads the
 * French ones, as the rest of these tabs.
 */
const ADMIN_STATUS_LABELS: Record<"fr" | "en", Record<AdminStatusKind, Record<string, string>>> = {
  fr: {
    payment: PAYMENT_STATUS_LABELS,
    appointment: APPOINTMENT_STATUS_LABELS,
    medicalQuestion: { submitted: "À répondre", drafting: "Brouillon", answered: "Répondue", published: "Publiée", rejected: "Classée sans suite" },
    testimonial: { pending: "À modérer", approved: "Approuvé", rejected: "Rejeté", featured: "Mis en avant" },
    gdprRequest: GDPR_REQUEST_STATUS_LABELS,
  },
  en: {
    payment: { pending: "Awaiting payment", completed: "Paid", failed: "Failed", refunded: "Refunded" },
    appointment: { held: "Slot held", confirmed: "Confirmed", cancelled: "Cancelled", completed: "Completed", no_show: "No-show" },
    medicalQuestion: { submitted: "To answer", drafting: "Draft", answered: "Answered", published: "Published", rejected: "Closed without follow-up" },
    testimonial: { pending: "To moderate", approved: "Approved", rejected: "Rejected", featured: "Featured" },
    gdprRequest: { pending: "To process", in_progress: "In progress", completed: "Processed", rejected: "Refused" },
  },
};

/** « Payé » for a payment "completed", « Terminé » for an appointment "completed"; a status these lists do not know as it is stored. */
export function adminStatusLabel(kind: AdminStatusKind, status: string, language: UserLanguage = "fr"): string {
  const labels = language === "en" ? ADMIN_STATUS_LABELS.en : ADMIN_STATUS_LABELS.fr;
  return labels[kind][status] ?? status;
}

export function adminStatusTone(kind: AdminStatusKind, status: string): AdminBadgeTone {
  return (ADMIN_STATUS_TONES[kind] as Record<string, AdminBadgeTone>)[status] ?? "neutral";
}

/** The badge of a payment, an appointment, a health question, a testimonial or a GDPR request, in the admin's language. */
export default function AdminStatusBadge({ kind, status, className }: { kind: AdminStatusKind; status: string; className?: string }) {
  const { language } = useLanguage();
  return <AdminBadge tone={adminStatusTone(kind, status)} className={className}>{adminStatusLabel(kind, status, language)}</AdminBadge>;
}
