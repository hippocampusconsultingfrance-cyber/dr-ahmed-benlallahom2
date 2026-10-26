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
    vi.useRealTimers();
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

  it("sends once more after a short retry-after when Resend rate-limits it, with the same idempotency key (ABUS-03)", async () => {
    vi.useFakeTimers();
    send.mockResolvedValueOnce({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" }, headers: { "retry-after": "1" } });
    const { notifyOwner } = await import("./notification");

    const delivery = notifyOwner({ title: "Réservations : au moins 6 créneaux retenus sans paiement", content: "Alerte" }, { idempotencyKey: "owner-alert-1" });
    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(delivery).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toEqual({ idempotencyKey: "owner-alert-1" });
    expect((state.db as InMemoryDrizzle).rows(securityEvents)).toEqual([]);
  });

  it("does not hold the request for a long retry-after, nor retry a rate limit twice", async () => {
    send.mockResolvedValue({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" }, headers: { "retry-after": "60" } });
    const { notifyOwner } = await import("./notification");
    await expect(notifyOwner({ title: "Alerte", content: "Contenu" })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(1);

    send.mockReset();
    send.mockResolvedValue({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" }, headers: { "retry-after": "0" } });
    await expect(notifyOwner({ title: "Alerte", content: "Contenu" })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("asks again at once under the same key after an uncertain answer, so an email Resend took is not sent twice (REC-09)", async () => {
    // Resend took the email but answered 500; under the same key it answers with that email.
    send.mockResolvedValueOnce({ data: null, error: { name: "internal_server_error", statusCode: 500, message: "Internal server error" } });
    const { notifyOwner } = await import("./notification");

    await expect(notifyOwner({ title: "Recrutement : Google Drive à reconnecter", content: "Alerte" }, { idempotencyKey: "google-drive-reconnection-1" })).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([, options]) => options)).toEqual([{ idempotencyKey: "google-drive-reconnection-1" }, { idempotencyKey: "google-drive-reconnection-1" }]);
  });

  it("asks again after a network error too, but only once, and reports the failure to the caller", async () => {
    send.mockRejectedValueOnce(new TypeError("fetch failed"));
    send.mockResolvedValueOnce({ data: null, error: { name: "application_error", statusCode: null, message: "Unable to fetch data. The request could not be resolved." } });
    const { notifyOwner } = await import("./notification");

    await expect(notifyOwner({ title: "Alerte", content: "Contenu" }, { idempotencyKey: "owner-alert-2" })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("an alert queued as a job (stopAtDeadline) is not asked again once the immediate budget of the processing it runs in is spent: the request has answered (ABUS-03)", async () => {
    const { runWithProcessingDeadline, deadlineCutShort } = await import("../processingDeadline");
    const { notifyOwner } = await import("./notification");
    let now = 2_500;
    // The uncertain answer comes back after the end of the budget.
    send.mockImplementationOnce(async () => {
      now = 3_100;
      return { data: null, error: { name: "internal_server_error", statusCode: 500, message: "Internal server error" } };
    });

    await runWithProcessingDeadline(3_000, async () => {
      await expect(notifyOwner({ title: "Remboursement", content: "APT1" }, { idempotencyKey: "appointment-stripe-refund-APT1", stopAtDeadline: true })).resolves.toBe(false);
      // Its job goes back to the queue without counting the attempt.
      expect(deadlineCutShort()).toBe(true);
    }, () => now);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("an alert queued nowhere is asked again under its key even after the immediate budget, rather than lost", async () => {
    const { runWithProcessingDeadline, deadlineCutShort } = await import("../processingDeadline");
    const { notifyOwner } = await import("./notification");
    let now = 2_500;
    send.mockImplementationOnce(async () => {
      now = 3_100;
      return { data: null, error: { name: "internal_server_error", statusCode: 500, message: "Internal server error" } };
    });

    await runWithProcessingDeadline(3_000, async () => {
      await expect(notifyOwner({ title: "Échec d’envoi après paiement (APT1)", content: "APT1" }, { idempotencyKey: "appointment-confirmation-failure-APT1-refused" })).resolves.toBe(true);
      expect(deadlineCutShort()).toBe(false);
    }, () => now);
    expect(send.mock.calls.map(([, options]) => options)).toEqual([{ idempotencyKey: "appointment-confirmation-failure-APT1-refused" }, { idempotencyKey: "appointment-confirmation-failure-APT1-refused" }]);
  });

  it("does not ask again without a key (a second email could leave), nor after a clear refusal", async () => {
    send.mockResolvedValue({ data: null, error: { name: "internal_server_error", statusCode: 500, message: "Internal server error" } });
    const { notifyOwner } = await import("./notification");
    await expect(notifyOwner({ title: "Nouveau message", content: "Référence C123" })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(1);

    send.mockReset();
    send.mockResolvedValue({ data: null, error: { name: "validation_error", statusCode: 422, message: "Invalid `to` field" } });
    await expect(notifyOwner({ title: "Alerte", content: "Contenu" }, { idempotencyKey: "owner-alert-3" })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
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
