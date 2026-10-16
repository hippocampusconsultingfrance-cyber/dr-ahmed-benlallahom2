import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send } })),
}));

describe("notifyOwner", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("RESEND_API_KEY", "re_test_owner_notifications");
    send.mockReset();
    send.mockResolvedValue({ data: { id: "email-owner" }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends the private notification to the active owner mailbox", async () => {
    const { notifyOwner } = await import("./notification");
    await expect(notifyOwner({ title: "Nouveau message", content: "Référence C123" })).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: "Hippocampus Consulting <recrutement@drahmedbenlallahom.com>",
      to: ["hippocampusconsultingfrance@gmail.com"],
      subject: "Nouveau message",
    }));
  });

  it("escapes untrusted form content in the HTML email", async () => {
    const { notifyOwner } = await import("./notification");
    await notifyOwner({ title: "Contact", content: "<script>alert('x')</script>" });
    const message = send.mock.calls[0][0];
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it("passes a caller idempotency key to Resend so retries cannot duplicate the email", async () => {
    const { notifyOwner } = await import("./notification");
    await notifyOwner({ title: "Nouvelle réservation", content: "APT1" }, { idempotencyKey: "appointment-owner-APT1" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: "Nouvelle réservation" }), { idempotencyKey: "appointment-owner-APT1" });
  });

  it("returns false when Resend rejects the delivery", async () => {
    send.mockResolvedValue({ data: null, error: { message: "rejected" } });
    const { notifyOwner } = await import("./notification");
    await expect(notifyOwner({ title: "Alerte", content: "Contenu" })).resolves.toBe(false);
  });
});
