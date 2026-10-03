import { describe, expect, it } from "vitest";
import { buildCandidatePortalActivationEmailEvent, buildCandidatePortalInvitationEmailEvent, buildCvConfirmationEmailEvent, buildFailedConfirmationRetryCandidateQuery, canRetryCvConfirmation, candidatePortalAccountMatchesApplication, cvConfirmationRetryOutcome, resolveCandidatePortalActivationDelivery, resolveCandidatePortalInvitationDelivery, resolveCvConfirmationDelivery } from "./recruitmentEmailTrace";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/neon-http";

const traceSource = readFileSync(new URL("./recruitmentEmailTrace.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

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

  it("distingue une livraison indéterminée d’un échec confirmé", () => {
    const event = buildCvConfirmationEmailEvent(input, {
      status: "failed",
      providerEmailId: null,
      failureCode: "delivery_exception",
    }, { localEventId: "unknown-1" });

    expect(event.eventType).toBe("email.delivery_unknown");
    expect(JSON.parse(event.payload)).toMatchObject({ outcome: "unknown", failureCode: "delivery_exception" });
    expect(canRetryCvConfirmation(resolveCvConfirmationDelivery([event]), new Date("2026-09-09T09:00:00Z"))).toBe(false);
    expect(cvConfirmationRetryOutcome({ status: "failed", providerEmailId: null, failureCode: "delivery_exception" })).toBe("delivery_unknown");
    expect(cvConfirmationRetryOutcome({ status: "failed", providerEmailId: null, failureCode: "provider_rejected" })).toBe("failed");
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

  it("ignore un webhook tardif d’une ancienne tentative après la réussite de la reprise", () => {
    const events = [
      { eventType: "email.bounced", providerEmailId: "confirmation_1", payload: JSON.stringify({ type: "email.bounced" }), occurredAt: new Date("2026-09-08T09:20:00Z") },
      { eventType: "email.delivered", providerEmailId: "confirmation_2", payload: JSON.stringify({ type: "email.delivered" }), occurredAt: new Date("2026-09-08T09:16:00Z") },
      { eventType: "email.sent", providerEmailId: "confirmation_2", payload: JSON.stringify({ kind: "application_confirmation", outcome: "sent", attempt: 2 }), occurredAt: new Date("2026-09-08T09:15:00Z") },
      { eventType: "email.failed", providerEmailId: "confirmation_1", payload: JSON.stringify({ type: "email.failed" }), occurredAt: new Date("2026-09-08T09:10:00Z") },
      { eventType: "email.sent", providerEmailId: "confirmation_1", payload: JSON.stringify({ kind: "application_confirmation", outcome: "sent", attempt: 1 }), occurredAt: new Date("2026-09-08T09:00:00Z") },
    ];

    expect(resolveCvConfirmationDelivery(events)).toMatchObject({
      eventType: "email.delivered",
      attempts: 2,
      providerEmailId: "confirmation_2",
    });
  });

  it("attend cinq minutes avant la deuxième tentative et s'arrête après trois", () => {
    const occurredAt = new Date("2026-09-08T09:00:00Z");
    const failed = resolveCvConfirmationDelivery([
      { eventType: "email.failed", providerEmailId: null, payload: JSON.stringify({ kind: "application_confirmation", outcome: "failed", failureCode: "provider_rejected" }), occurredAt },
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

  it("relie l’invitation de l’espace candidat et ses webhooks à la candidature", () => {
    const sent = buildCandidatePortalInvitationEmailEvent(input, {
      status: "sent",
      providerEmailId: "portal_123",
      failureCode: null,
    }, { now: new Date("2026-09-08T10:00:00Z") });
    const events = [
      { eventType: "email.delivered", providerEmailId: "portal_123", payload: JSON.stringify({ type: "email.delivered" }), occurredAt: new Date("2026-09-08T10:05:00Z") },
      sent,
    ];

    expect(resolveCandidatePortalInvitationDelivery(events)).toMatchObject({
      eventType: "email.delivered",
      attempts: 1,
      providerEmailId: "portal_123",
    });
    expect(JSON.parse(sent.payload)).toMatchObject({ kind: "candidate_portal_invitation", trackingId: "CV-TRACE-42" });
  });

  it("considère l’accusé de dépôt comme une invitation au portail", () => {
    expect(resolveCandidatePortalInvitationDelivery([buildCvConfirmationEmailEvent(input, {
      status: "sent",
      providerEmailId: "confirmation_with_invite",
      failureCode: null,
    })])).toMatchObject({ eventType: "email.sent", attempts: 1 });
  });

  it("relie séparément l’e-mail d’activation et ses webhooks à la candidature", () => {
    const sent = buildCandidatePortalActivationEmailEvent(input, {
      status: "sent",
      providerEmailId: "activation_123",
      failureCode: null,
    }, { now: new Date("2026-09-08T11:00:00Z") });
    const events = [
      { eventType: "email.delivered", providerEmailId: "activation_123", payload: JSON.stringify({ type: "email.delivered" }), occurredAt: new Date("2026-09-08T11:05:00Z") },
      sent,
    ];

    expect(resolveCandidatePortalActivationDelivery(events)).toMatchObject({
      eventType: "email.delivered",
      attempts: 1,
      providerEmailId: "activation_123",
    });
    expect(JSON.parse(sent.payload)).toMatchObject({ kind: "candidate_portal_activation", trackingId: "CV-TRACE-42" });
    expect(resolveCandidatePortalInvitationDelivery(events).eventType).toBeNull();
  });

  it("reconnaît un espace actif par candidature liée ou par adresse vérifiée", () => {
    const application = { id: 42, email: "Candidate@Example.COM" };
    expect(candidatePortalAccountMatchesApplication({ linkedApplicationId: 42, email: "other@example.com", emailVerifiedAt: new Date() }, application)).toBe(true);
    expect(candidatePortalAccountMatchesApplication({ linkedApplicationId: null, email: "candidate@example.com", emailVerifiedAt: new Date() }, application)).toBe(true);
    expect(candidatePortalAccountMatchesApplication({ linkedApplicationId: null, email: "candidate@example.com", emailVerifiedAt: null }, application)).toBe(false);
  });

  it("autorise uniquement l'administrateur à reprendre un accusé sans trace", () => {
    expect(routerSource).toContain("retryCvConfirmationEmail(input.id, { allowUntracked: true })");
    expect(traceSource).toContain("const maySendUntracked = !current.eventType && options.allowUntracked");
    expect(traceSource).toContain('current.eventType !== "email.failed" && !maySendUntracked');
    expect(traceSource).toContain('current.eventType === "email.failed" ? current.attempts + 1 : 1');
  });

  it("ne laisse pas les échecs de campagne évincer la file de reprise des confirmations", () => {
    const query = buildFailedConfirmationRetryCandidateQuery(drizzle.mock()).toSQL();
    expect(query.sql).toContain('"recruitment_email_events"."payload" like');
    expect(query.sql).toContain('exists (select "id" from "recruitment_email_events" "confirmation_attempt_events"');
    expect(query.params).toEqual([
      "email.failed",
      '%"kind":"application_confirmation"%',
      '%"kind":"application_confirmation"%',
      100,
    ]);
  });
});
