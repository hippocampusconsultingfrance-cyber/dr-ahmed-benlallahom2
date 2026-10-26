import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { securityEvents } from "../../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "../testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "../testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const send = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send } })),
}));
vi.mock("../db", () => ({ getDb: async () => state.db }));

describe("notifyOwner", () => {
  beforeEach(() => {
    vi.resetModules();
    state.db = createInMemoryDrizzle();
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
    expect((state.db as InMemoryDrizzle).rows(securityEvents)).toEqual([]);
  });

  it("logs a used-up Resend quota as a high-severity event, without an alert loop (ABUS-03)", async () => {
    send.mockResolvedValue({ data: null, error: { name: "daily_quota_exceeded", statusCode: 429, message: "You have reached your daily quota" } });
    const { notifyOwner } = await import("./notification");

    await expect(notifyOwner({ title: "Nouveau message", content: "Référence C123" })).resolves.toBe(false);

    // The owner alert about the quota is refused too: one more event, then its window stops the chain.
    const events = (state.db as InMemoryDrizzle).rows(securityEvents);
    expect(events.map(event => ({ category: event.category, severity: event.severity, metadata: JSON.parse(String(event.metadata)) }))).toEqual([
      { category: "resend_quota_exceeded", severity: "high", metadata: { quota: "daily", emailKind: "owner_notification" } },
      { category: "resend_quota_exceeded", severity: "high", metadata: { quota: "daily", emailKind: "owner_notification" } },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].subject).toContain("resend_quota_exceeded");
  });
});
