import { describe, expect, it, vi } from "vitest";
import { buildCandidatePortalActivationEmailEvent, buildCandidatePortalInvitationEmailEvent, buildCvConfirmationEmailEvent, buildFailedConfirmationRetryCandidateQuery, canRetryCvConfirmation, candidatePortalAccountMatchesApplication, cvConfirmationRetryOutcome, resolveCandidatePortalActivationDelivery, resolveCandidatePortalInvitationDelivery, resolveCvConfirmationDelivery, retryDueFailedCvConfirmationEmails } from "./recruitmentEmailTrace";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/neon-http";

const retryMocks = vi.hoisted(() => ({ getDb: vi.fn(), sendEmail: vi.fn() }));

vi.mock("./db", () => ({ getDb: retryMocks.getDb }));
vi.mock("./_core/notifications", () => ({ sendCvApplicationConfirmationEmail: retryMocks.sendEmail }));
vi.mock("./candidateAuth", () => ({ createCandidateInvitationToken: () => "synthetic-invitation-token" }));

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

  it("atteint un échec ancien malgré cent échecs récents non encore éligibles", async () => {
    const now = new Date("2026-10-04T10:00:00Z");
    const cursorEventId = "internal:cv_confirmation_retry_cursor:v1";
    const recentFailure = new Date("2026-10-04T09:59:00Z");
    const oldFailure = new Date("2026-10-04T08:00:00Z");
    const failedEvents = Array.from({ length: 101 }, (_, index) => ({
      id: index + 1,
      applicationId: index + 1,
      eventType: "email.failed",
      providerEmailId: null,
      payload: JSON.stringify({ kind: "application_confirmation", outcome: "failed", attempt: 1 }),
      occurredAt: index === 0 ? oldFailure : recentFailure,
    }));
    let persistedCursor: { lastScannedFailedEventId: number | null } | null = null;
    const cursorWrites: Array<number | null> = [];
    const candidatePages: number[][] = [];
    const db = drizzle.mock();

    const indexedParam = (sql: string, params: unknown[], pattern: RegExp): unknown => {
      const match = pattern.exec(sql);
      return match ? params[Number(match[1]) - 1] : undefined;
    };

    vi.spyOn(db.session, "prepareQuery").mockImplementation(query => {
      const prepared = {
        setToken: () => prepared,
        execute: async () => {
          const { sql, params } = query;
          if (/^select/i.test(sql) && sql.includes('from "recruitment_email_events"') && params.includes("email.failed")) {
            const beforeId = indexedParam(sql, params, /"recruitment_email_events"\."id"\s*<\s*\$(\d+)/);
            const pageSize = indexedParam(sql, params, /limit\s+\$(\d+)/);
            const page = failedEvents
              .filter(event => typeof beforeId !== "number" || event.id < beforeId)
              .sort((left, right) => right.id - left.id)
              .slice(0, typeof pageSize === "number" ? pageSize : 100)
              .map(event => ({ id: event.id, applicationId: event.applicationId }));
            candidatePages.push(page.map(event => event.id));
            return page;
          }
          if (/^select/i.test(sql) && sql.includes('from "recruitment_email_events"') && params.includes(cursorEventId)) {
            return persistedCursor ? [{ payload: JSON.stringify(persistedCursor) }] : [];
          }
          if (/^select/i.test(sql) && sql.includes('from "cv_applications"')) {
            const applicationId = indexedParam(sql, params, /"cv_applications"\."id"\s*=\s*\$(\d+)/);
            if (typeof applicationId !== "number") throw new Error(`Unexpected application query: ${sql}`);
            return [{
              id: applicationId, firstName: "Synthetic",
              email: `candidate${applicationId}@example.invalid`, trackingId: `CV-TEST-${applicationId}`,
              // The first application was made from the English form (EN-02).
              language: applicationId === 1 ? "en" : "fr",
            }];
          }
          if (/^select/i.test(sql) && sql.includes('from "recruitment_email_events"')) {
            const applicationId = indexedParam(sql, params, /"recruitment_email_events"\."application_id"\s*=\s*\$(\d+)/);
            const event = failedEvents.find(entry => entry.applicationId === applicationId);
            if (!event) throw new Error(`Unexpected event query: ${sql}`);
            return [event];
          }
          if (/^(insert|update)/i.test(sql) && sql.includes('"recruitment_email_events"')) {
            if (params.includes(cursorEventId)) {
              const cursorPayload = params
                .filter((value): value is string => typeof value === "string")
                .map(value => { try { return JSON.parse(value) as { lastScannedFailedEventId?: number | null }; } catch { return null; } })
                .find(value => value && "lastScannedFailedEventId" in value);
              if (!cursorPayload || cursorPayload.lastScannedFailedEventId === undefined) {
                throw new Error(`Cursor write without cursor payload: ${sql}`);
              }
              persistedCursor = { lastScannedFailedEventId: cursorPayload.lastScannedFailedEventId };
              cursorWrites.push(persistedCursor.lastScannedFailedEventId);
            }
            return { rows: [], rowCount: 1 };
          }
          throw new Error(`Unexpected SQL in synthetic retry database: ${sql}`);
        },
      };
      return prepared as never;
    });
    retryMocks.getDb.mockResolvedValue(db);
    retryMocks.sendEmail.mockResolvedValue({ status: "sent", providerEmailId: "synthetic-email-1", failureCode: null });

    const firstRun = await retryDueFailedCvConfirmationEmails(1, now);
    const secondRun = await retryDueFailedCvConfirmationEmails(1, now);

    expect(firstRun.processed + secondRun.processed).toBe(1);
    expect(candidatePages.some(page => page.includes(1))).toBe(true);
    expect(cursorWrites).toContain(2);
    expect(retryMocks.sendEmail).toHaveBeenCalledOnce();
    expect(retryMocks.sendEmail).toHaveBeenCalledWith(
      "candidate1@example.invalid", "Synthetic", "CV-TEST-1",
      expect.stringContaining("synthetic-invitation-token"), "cv-application-confirmation-CV-TEST-1-attempt-2", "en",
    );

    // An empty older page wraps the durable scan to the newest failures.
    expect((await retryDueFailedCvConfirmationEmails(1, now)).processed).toBe(0);
    expect(candidatePages.at(-1)).toEqual([]);
    expect(cursorWrites.at(-1)).toBeNull();

    // Two failures become due in the newest page. The one-send cap must leave
    // the cursor at the last inspected row so the other one remains reachable.
    failedEvents[1].occurredAt = oldFailure;
    failedEvents[2].occurredAt = oldFailure;
    expect((await retryDueFailedCvConfirmationEmails(1, now)).processed).toBe(1);
    expect(cursorWrites.at(-1)).toBe(3);
    expect((await retryDueFailedCvConfirmationEmails(1, now)).processed).toBe(1);
    expect(cursorWrites.at(-1)).toBe(2);
    expect(retryMocks.sendEmail).toHaveBeenCalledTimes(3);
    vi.restoreAllMocks();
    retryMocks.getDb.mockReset();
    retryMocks.sendEmail.mockReset();
  });
});
