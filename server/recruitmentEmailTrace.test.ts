import { describe, expect, it } from "vitest";
import { buildCvConfirmationEmailEvent } from "./recruitmentEmailTrace";

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
});
