import { adminProcedure } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../../db";
import { appointments } from "../../../drizzle/schema";
import { eq, and, sql, isNotNull, ne } from "drizzle-orm";

/**
 * « À traiter » en tête du tableau de bord, lu depuis la base (EXPL-02) :
 * envois après paiement en échec (tentatives épuisées, refus du service
 * d’envoi, ou nouvel essai automatique en attente), envois pas encore
 * partis quelques minutes après le paiement (ABUS-03), et paiements reçus
 * sans rendez-vous confirmé (patient à contacter, puis à rembourser).
 */
export const adminAttentionProcedure = adminProcedure.query(async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de données indisponible." });
  const { listAppointmentDeliveriesToHandle } = await import("../../appointmentFulfillment");
  const deliveries = await listAppointmentDeliveriesToHandle();
  // Same rule as isUnconfirmedPaidAppointment (server/appointmentAdminActions.ts).
  const unconfirmed = and(eq(appointments.paymentStatus, "pending"), ne(appointments.appointmentStatus, "held"), isNotNull(appointments.stripePaymentIntentId));
  const unconfirmedItems = await db
    .select({ trackingId: appointments.trackingId, customerName: appointments.customerName, appointmentDate: appointments.appointmentDate })
    .from(appointments)
    .where(unconfirmed)
    .orderBy(appointments.updatedAt)
    .limit(20);
  const [unconfirmedCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(appointments).where(unconfirmed);
  return {
    failedDeliveries: deliveries.failed,
    refusedDeliveries: deliveries.refused,
    retryingDeliveries: deliveries.retrying,
    waitingDeliveries: deliveries.waiting,
    unconfirmedPayments: { total: Number(unconfirmedCount?.count ?? 0), items: unconfirmedItems },
  };
});
