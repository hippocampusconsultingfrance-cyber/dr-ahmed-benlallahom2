import express, { type Express } from "express";
import type Stripe from "stripe";
import { internalErrorSummary } from "../_core/trpc";
import { safeErrorName } from "./routeHelpers";

/** Verifies the signature on the raw body: createApp registers it before express.json(). */
export function registerStripeWebhookRoute(app: Express) {
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

    // A Stripe SDK that cannot be loaded or configured is our failure, not an
    // invalid signature: 500, which Stripe retries and the smoke test of the
    // built server tells apart from the 400 of a refused signature (CODE-14).
    let stripe: Stripe;
    try {
      const { default: StripeSdk } = await import("stripe");
      stripe = new StripeSdk(process.env.STRIPE_SECRET_KEY || "");
    } catch (error) {
      console.error("Stripe webhook unavailable", internalErrorSummary(error));
      return res.status(500).json({ error: "Webhook unavailable" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (error) {
      console.error("Stripe webhook signature validation failed", safeErrorName(error));
      return res.status(400).json({ error: "Invalid webhook" });
    }

    try {
      if (event.type === "checkout.session.completed") {
        console.log("Stripe checkout completion received");
        // Requires a paid session matching the stored one, confirms only a slot
        // still held for this patient (conditional UPDATE), alerts the owner when
        // money arrives for a slot that can no longer be confirmed, and sends the
        // confirmation + invoice right away (bounded) instead of waiting for a cron.
        const { handleCheckoutSessionCompleted } = await import("../appointmentPaymentWebhook");
        const completion = await handleCheckoutSessionCompleted(event.data.object);
        return res.status(completion.httpStatus).json(completion.body);
      } else if (event.type === "charge.refunded") {
        // A full refund made in Stripe (or not recorded by the dashboard) is
        // applied to the appointment: refunded, cancelled and slot freed if it
        // was still confirmed, patient emailed and owner alerted, once, through
        // the retried post-payment queue.
        const { handleChargeRefunded } = await import("../appointmentPaymentWebhook");
        const refund = await handleChargeRefunded(event.data.object);
        return res.status(refund.httpStatus).json(refund.body);
      } else if (event.type === "charge.dispute.created") {
        // A chargeback: the owner is alerted once, with the deadline to answer.
        const { handleChargeDisputeCreated } = await import("../appointmentPaymentWebhook");
        const dispute = await handleChargeDisputeCreated(event.data.object);
        return res.status(dispute.httpStatus).json(dispute.body);
      } else if (event.type === "checkout.session.expired") {
        const session = event.data.object as any;
        const trackingId = session.metadata?.trackingId;
        if (trackingId) {
          const { getDb } = await import("../db");
          const { appointments } = await import("../../drizzle/schema");
          const { and, eq } = await import("drizzle-orm");
          const { getExpiredAppointmentHoldUpdate } = await import("../appointmentHolds");
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          await db
            .update(appointments)
            .set(getExpiredAppointmentHoldUpdate())
            .where(
              and(
                eq(appointments.trackingId, trackingId),
                eq(appointments.stripeSessionId, session.id),
                eq(appointments.paymentStatus, "pending"),
                eq(appointments.appointmentStatus, "held")
              )
            );
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook processing failed", safeErrorName(error));
      res.status(500).json({ received: false });
    }
  });
}
