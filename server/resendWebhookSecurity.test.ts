import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Webhook } from "svix";

describe("secret de webhook Resend", () => {
  it("vérifie une charge utile signée avec le secret configuré", () => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/=]+$/);

    const payload = JSON.stringify({ type: "email.delivered", created_at: "2026-08-18T08:40:00.000Z", data: { email_id: "email_test" } });
    const id = "msg_test_recruitment";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(secret!.slice("whsec_".length), "base64");
    const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
    const verified = new Webhook(secret!).verify(payload, {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    }) as { type: string };

    expect(verified.type).toBe("email.delivered");
  });
});
