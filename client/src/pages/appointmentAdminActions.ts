import { BOOKING_PATIENT_REFUND_DEADLINE_HOURS } from "@shared/bookingPolicy";

/** Which dashboard actions an appointment allows; mirrors server/appointmentAdminActions.ts. */
export const PATIENT_REFUND_DEADLINE_HOURS = BOOKING_PATIENT_REFUND_DEADLINE_HOURS;

/** Said before and after refunding a booking whose patient data was erased (RGPD-12). */
export const PATIENT_DATA_ERASED_REFUND_NOTICE = "Données du patient effacées (RGPD) : il n’est plus joignable par le site et ne sera pas prévenu par email.";
/** The reason is stored on a row reduced to its accounting record: nothing that identifies the patient goes back into it. */
export const PATIENT_DATA_ERASED_REASON_PROMPT = "Motif (obligatoire, sans donnée personnelle : ni nom, ni coordonnées, ni état de santé) :";

export type AdminAppointmentRow = {
  appointmentDate: string | Date;
  paymentStatus: string;
  appointmentStatus: string;
  stripePaymentIntentId?: string | null;
  customerEmail?: string | null;
};

export function getAppointmentAdminActions(appointment: AdminAppointmentRow, now = Date.now()) {
  const start = new Date(appointment.appointmentDate).getTime();
  const started = start <= now;
  const paid = appointment.paymentStatus === "completed" && Boolean(appointment.stripePaymentIntentId);
  const confirmed = appointment.appointmentStatus === "confirmed";
  const unconfirmedPayment = appointment.paymentStatus === "pending"
    && appointment.appointmentStatus !== "held"
    && Boolean(appointment.stripePaymentIntentId);
  const patientDataErased = typeof appointment.customerEmail === "string" && !appointment.customerEmail.trim();
  return {
    /** Reduced to its accounting record (RGPD-12): a refund stays possible, but the patient can no longer be told. */
    patientDataErased,
    /** « Terminer » / « Absent » only once the consultation has started. */
    canComplete: confirmed && started,
    canMarkNoShow: confirmed && started,
    canReconfirm: !patientDataErased && appointment.paymentStatus === "completed" && ["completed", "no_show"].includes(appointment.appointmentStatus),
    /** Patient-requested cancellation: 24 h rule. */
    canPatientRefund: paid && confirmed && (start - now) / 3_600_000 >= PATIENT_REFUND_DEADLINE_HOURS,
    /** Practitioner cancellation: always a full refund, reason mandatory. */
    canPractitionerCancel: paid && confirmed,
    /** Practitioner refund after the fact (gesture), the status is kept. */
    canPractitionerRefund: paid && !confirmed,
    /** Payment received after the hold was released: shown "à régulariser". */
    unconfirmedPayment,
    /** An unpaid appointment can be cancelled without any refund. */
    canCancelUnpaid: confirmed && appointment.paymentStatus !== "completed",
  };
}
