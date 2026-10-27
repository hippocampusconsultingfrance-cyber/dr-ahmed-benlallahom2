import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../../db";
import { appointments } from "../../../drizzle/schema";
import { isLastingStorageError } from "../../storage";
import { eq, and, sql, desc } from "drizzle-orm";
import { logSecurityEvent } from "../../candidateSecurity";
import { adminSearchCondition, adminSearchInput } from "../../adminSearch";
import { getStripeClient, bookingCustomerEmail } from "../appointments";

// List all appointments with pagination
export const adminAppointmentsRouter = router({
  list: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
        status: z.enum(["pending", "completed", "failed", "refunded"]).optional(),
        /** Patient name, email or booking reference (ADM-02). */
        search: adminSearchInput,
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions = [];
      if (input.status) {
        conditions.push(eq(appointments.paymentStatus, input.status));
      }
      const search = adminSearchCondition(input.search, [appointments.customerName, appointments.customerEmail, appointments.trackingId], { fullName: appointments.customerName });
      if (search) conditions.push(search);

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(appointments)
        .where(whereClause)
        .orderBy(desc(appointments.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(appointments)
        .where(whereClause);

      // Post-payment emails and the issued invoice of each appointment (EXPL-02).
      const { getAppointmentDeliveries } = await import("../../appointmentFulfillment");
      const { findAppointmentInvoices } = await import("../../invoiceNumbering");
      const appointmentIds = rows.map(row => row.id);
      const deliveries = await getAppointmentDeliveries(appointmentIds);
      const invoices = await findAppointmentInvoices(appointmentIds).catch(error => {
        console.error("[Admin] Issued invoices could not be read", error instanceof Error ? error.name : "UnknownError");
        return new Map<number, { invoiceNumber: string }>();
      });
      const items = rows.map(row => ({
        ...row,
        deliveries: deliveries.get(row.id) ?? [],
        invoiceNumber: invoices.get(row.id)?.invoiceNumber ?? null,
      }));

      return { items, total: Number(countResult[0]?.count ?? 0) };
    }),

  /** « Renvoyer » : relance tout de suite les envois après paiement qui n’ont pas abouti (EXPL-02). */
  retryFulfillment: adminProcedure
    .input(z.object({ trackingId: z.string().min(1).max(20) }))
    .mutation(async ({ input }) => {
      const { retryAppointmentFulfillment } = await import("../../appointmentFulfillment");
      const result = await retryAppointmentFulfillment(input.trackingId);
      if (result.outcome === "not_found") throw new TRPCError({ code: "NOT_FOUND", message: "Rendez-vous introuvable." });
      if (result.outcome === "not_paid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Ce rendez-vous n’est pas payé : aucun envoi après paiement à relancer." });
      return { requeued: result.requeued, requeuedJobTypes: result.requeuedJobTypes, deliveries: result.deliveries };
    }),

  /**
   * Corrige l’adresse du patient après un envoi refusé (EXPL-02), avec la
   * règle de la réservation, et seulement après un tel refus, comme la
   * fiche ; « Renvoyer » écrit ensuite à la nouvelle adresse, la facture
   * déjà émise gardant ses mentions. Tracé dans le journal de sécurité,
   * sans les adresses.
   */
  updateCustomerEmail: adminProcedure
    // No length limit here: an address too long gets the same clear message
    // as any other invalid one, not Zod's raw report (bounded by the JSON body limit).
    .input(z.object({ trackingId: z.string().min(1).max(20), customerEmail: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const customerEmail = input.customerEmail.trim();
      if (!bookingCustomerEmail.safeParse(customerEmail).success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Adresse email invalide : saisissez une adresse complète, par exemple prenom.nom@exemple.fr." });
      }
      const { updateAppointmentCustomerEmailByAdmin } = await import("../../appointmentAdminActions");
      const result = await updateAppointmentCustomerEmailByAdmin({ trackingId: input.trackingId, customerEmail });
      if (!result.unchanged) {
        await logSecurityEvent({ actorKind: "admin", actorReference: ctx.user.openId, category: "admin_appointment_email_corrected", outcome: "allowed", metadata: { trackingId: input.trackingId } });
      }
      return result;
    }),

  /** Facture déjà émise : la copie archivée à son émission, celle envoyée au patient ; n’attribue jamais de numéro (EXPL-02). */
  invoicePdf: adminProcedure
    .input(z.object({ trackingId: z.string().min(1).max(20) }))
    .mutation(async ({ input }) => {
      const { regenerateAppointmentInvoice } = await import("../../appointmentFulfillment");
      let invoice: Awaited<ReturnType<typeof regenerateAppointmentInvoice>>;
      try {
        invoice = await regenerateAppointmentInvoice(input.trackingId);
      } catch (error) {
        // The copy stored at its issue could not be checked or read (storage
        // outage, EXPL-02): the invoice is not rebuilt in its place. A
        // storage failure is named, lasting (to fix in Vercel) or passing.
        const message = error instanceof Error ? error.message : "";
        const code = (error as { code?: unknown } | null)?.code;
        const storageFailure = message.startsWith("storage_");
        console.error("[AppointmentFulfillment] Invoice download failed", storageFailure ? { message, code } : error instanceof Error ? error.name : "UnknownError");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: !storageFailure ? "La facture n’a pas pu être préparée pour l’instant : réessayez dans un instant."
            : isLastingStorageError(code) ? "La facture archivée est inaccessible : le stockage des factures (Vercel Blob) refuse l’accès (store suspendu ou introuvable, jeton BLOB_READ_WRITE_TOKEN absent ou invalide). Vérifiez-le dans Vercel, puis réessayez."
              : "La facture archivée n’a pas pu être lue : le stockage des factures (Vercel Blob) ne répond pas pour l’instant ; réessayez dans un instant.",
        });
      }
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Aucune facture n’a encore été émise pour ce rendez-vous." });
      return { invoiceNumber: invoice.invoiceNumber, filename: `Facture-${invoice.invoiceNumber}.pdf`, contentBase64: invoice.buffer.toString("base64") };
    }),

  updateStatus: adminProcedure
    .input(
      z.object({
        trackingId: z.string().min(1).max(20),
        appointmentStatus: z.enum(["confirmed", "cancelled", "completed", "no_show"]),
      })
    )
    .mutation(async ({ input }) => {
      const { updateAppointmentStatusByAdmin } = await import("../../appointmentAdminActions");
      return updateAppointmentStatusByAdmin(input);
    }),

  /**
   * Remboursement intégral. « patient » : annulation demandée par le patient,
   * possible jusqu’à 24 h avant. « practitioner » : annulation (ou geste) du
   * praticien, toujours possible, motif obligatoire communiqué au patient.
   */
  refund: adminProcedure
    .input(
      z.object({
        trackingId: z.string().min(1).max(20),
        reason: z.string().trim().min(3, "Indiquez le motif du remboursement.").max(500),
        initiator: z.enum(["patient", "practitioner"]).default("patient"),
      })
    )
    .mutation(async ({ input }) => {
      const { refundAppointmentPayment } = await import("../../appointmentAdminActions");
      return refundAppointmentPayment(getStripeClient(), input);
    }),

  /** Paiement Stripe reçu mais non rattachable au rendez-vous (session indiquée dans l’alerte). */
  refundUnconfirmedSession: adminProcedure
    .input(z.object({ sessionId: z.string().trim().regex(/^cs_[A-Za-z0-9_]{6,250}$/, "Identifiant de session Stripe invalide (cs_…)") }))
    .mutation(async ({ input }) => {
      const { refundUnconfirmedCheckoutSession } = await import("../../appointmentAdminActions");
      return refundUnconfirmedCheckoutSession(getStripeClient(), input);
    }),
});
