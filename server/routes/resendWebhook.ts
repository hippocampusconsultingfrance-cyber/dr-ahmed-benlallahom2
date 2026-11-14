import express, { type Express } from "express";
import {
  recordResendEmailEvent,
  type ResendWebhookEventData,
} from "../resendWebhookEvents";
import { logError } from "../_core/logError";

// svix is loaded at the first Resend event, not at the Vercel function's cold
// start (EXPL-15). The load is kept; a failed one is tried again at the next event.
let svix: Promise<typeof import("svix")> | undefined;
function loadSvix(): Promise<typeof import("svix")> {
  svix ??= import("svix").catch(error => {
    svix = undefined;
    throw error;
  });
  return svix;
}

/** Verifies the Svix signature on the raw body: createApp registers it before express.json(). */
export function registerResendWebhookRoute(app: Express) {
  app.post(
    "/api/webhooks/resend",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
      if (!webhookSecret) {
        res.status(503).send("Resend webhook is not configured");
        return;
      }
      // A svix that cannot be loaded is our failure, not an invalid signature:
      // 500, which Resend retries and the smoke test of the built server tells
      // apart from the 400 of a refused signature, as for Stripe's webhook.
      let Webhook: typeof import("svix").Webhook;
      try {
        ({ Webhook } = await loadSvix());
      } catch (error) {
        logError("Resend webhook unavailable", error, { req });
        res.status(500).send("Resend webhook unavailable");
        return;
      }
      try {
        const payload = Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : String(req.body || "");
        const event = new Webhook(webhookSecret).verify(payload, {
          "svix-id": String(req.headers["svix-id"] || ""),
          "svix-timestamp": String(req.headers["svix-timestamp"] || ""),
          "svix-signature": String(req.headers["svix-signature"] || ""),
        }) as {
          type?: string;
          created_at?: string;
          data?: ResendWebhookEventData;
        };
        const providerEventId = String(req.headers["svix-id"] || "");
        if (!providerEventId || !event.type) {
          res.status(400).send("Invalid Resend webhook payload");
          return;
        }
        // The event and its effects are written together (DATA-04): a failure
        // answers an error, and Resend's next delivery applies it all again.
        const { duplicate } = await recordResendEmailEvent({
          providerEventId,
          event: {
            type: event.type,
            created_at: event.created_at,
            data: event.data,
          },
          payload,
        });
        res
          .status(200)
          .json(
            duplicate ? { received: true, duplicate: true } : { received: true }
          );
      } catch (error) {
        logError("Resend webhook verification failed", error, { req });
        res.status(400).send("Invalid Resend webhook");
      }
    }
  );
}
