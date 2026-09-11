import { describe, expect, it } from "vitest";
import { buildCvConfirmationEmailEvent, canRetryCvConfirmation, resolveCvConfirmationDelivery } from "./recruitmentEmailTrace";

describe("traçabilité de l'email de confirmation de candidature", () => {
  const input = {
    applicationId: 42,
    candidateEmail: " Candidate@Example.COM ",
    trackingId: "CV-TRACE-42",
  };

  it("relie un envoi accepté à la candidature et à l'identifiant Resend", () => {
    const occurredAt = new Date("2026-09-08T08:00:00.000Z");
    const event = buildCvConfirmationEmailEvent(input, {
      status: "sent",
      providerEmailId: "email_123",
      failureCode: null,
    }, { now: occurredAt });

    expect(event).toMatchObject({
      providerEventId: "send:email_123",
      providerEmailId: "email_123",
      applicationId: 42,
      eventType: "email.sent",
      recipientEmail: "candidate@example.com",
      occurredAt,
    });
    expect(JSON.parse(event.payload)).toEqual({
      kind: "application_confirmation",
      outcome: "sent",
      failureCode: null,
      trackingId: "CV-TRACE-42",
    });
  });

  it("conserve une preuve minimale d'un échec sans contenu du CV", () => {
    const event = buildCvConfirmationEmailEvent(input, {
      status: "failed",
      providerEmailId: null,
      failureCode: "provider_rejected",
    }, { localEventId: "attempt-1" });

    expect(event.providerEventId).toBe("local:attempt-1");
    expect(event.eventType).toBe("email.failed");
    expect(event.payload).not.toContain("Candidate@Example.COM");
    expect(event.payload).not.toContain("cvFile");
  });

  it("isole l'accusé de dépôt des autres emails et suit ses webhooks Resend", () => {
    const events = [
      { eventType: "email.failed", providerEmailId: "campaign_1", payload: JSON.stringify({ kind: "campaign" }), occurredAt: new Date("2026-09-08T10:00:00Z") },
      { eventType: "email.delivered", providerEmailId: "confirmation_1", payload: JSON.stringify({ type: "email.delivered" }), occurredAt: new Date("2026-09-08T09:05:00Z") },
      { eventType: "email.sent", providerEmailId: "confirmation_1", payload: JSON.stringify({ kind: "application_confirmation", outcome: "sent", failureCode: null }), occurredAt: new Date("2026-09-08T09:00:00Z") },
    ];

    expect(resolveCvConfirmationDelivery(events)).toMatchObject({
      eventType: "email.delivered",
      attempts: 1,
      providerEmailId: "confirmation_1",
    });
  });

  it("attend cinq minutes avant la deuxième tentative et s'arrête après trois", () => {
    const occurredAt = new Date("2026-09-08T09:00:00Z");
    const failed = resolveCvConfirmationDelivery([
      { eventType: "email.failed", providerEmailId: null, payload: JSON.stringify({ kind: "application_confirmation", outcome: "failed", failureCode: "delivery_exception" }), occurredAt },
    ]);
    expect(canRetryCvConfirmation(failed, new Date("2026-09-08T09:04:59Z"))).toBe(false);
    expect(canRetryCvConfirmation(failed, new Date("2026-09-08T09:05:00Z"))).toBe(true);

    const exhausted = resolveCvConfirmationDelivery([1, 2, 3].map(attempt => ({
      eventType: "email.failed",
      providerEmailId: null,
      payload: JSON.stringify({ kind: "application_confirmation", outcome: "failed", attempt }),
      occurredAt: new Date(`2026-09-08T0${attempt}:00:00Z`),
    })));
    expect(canRetryCvConfirmation(exhausted, new Date("2026-09-10T09:00:00Z"))).toBe(false);
  });
});
