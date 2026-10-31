import express, { type Express } from "express";
import { Webhook } from "svix";
import { recordResendEmailEvent } from "../resendWebhookEvents";
import { safeErrorName } from "./routeHelpers";

/** Verifies the Svix signature on the raw body: createApp registers it before express.json(). */
export function registerResendWebhookRoute(app: Express) {
  app.post("/api/webhooks/resend", express.raw({ type: "application/json" }), async (req, res) => {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(503).send("Resend webhook is not configured");
      return;
    }
    try {
      const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
      const event = new Webhook(webhookSecret).verify(payload, {
        "svix-id": String(req.headers["svix-id"] || ""),
        "svix-timestamp": String(req.headers["svix-timestamp"] || ""),
        "svix-signature": String(req.headers["svix-signature"] || ""),
      }) as { type?: string; created_at?: string; data?: Record<string, any> };
      const providerEventId = String(req.headers["svix-id"] || "");
      if (!providerEventId || !event.type) {
        res.status(400).send("Invalid Resend webhook payload");
        return;
      }
      // The event and its effects are written together (DATA-04): a failure
      // answers an error, and Resend's next delivery applies it all again.
      const { duplicate } = await recordResendEmailEvent({ providerEventId, event: { type: event.type, created_at: event.created_at, data: event.data }, payload });
      res.status(200).json(duplicate ? { received: true, duplicate: true } : { received: true });
    } catch (error) {
      console.error("Resend webhook verification failed:", safeErrorName(error));
      res.status(400).send("Invalid Resend webhook");
    }
  });
}
