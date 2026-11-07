import { randomUUID } from "node:crypto";
import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../../db";
import {
  candidateAccounts,
  cvApplications,
  cvCandidateCertifications,
  recruitmentAuditLogs,
  recruitmentCampaigns,
  recruitmentCampaignRecipients,
  recruitmentEmailEvents,
  recruitmentFollowUpTasks,
} from "../../../drizzle/schema";
import { and, eq, sql, desc, getTableColumns, inArray } from "drizzle-orm";
import { sendCandidatePortalAccessEmail, candidatePortalAccessEmailFailureCode } from "../../_core/notifications";
import { recordWithRecruitmentAudit, recruitmentAuditInsert, traceRecruitmentActionDone } from "../../recruitmentAudit";
import { analysedCertificationNames, CERTIFICATION_NAME_MAX_LENGTH, certificationFacts, declaredCertificationNames, sameRecruitmentFact } from "../../clientBriefMatching";
import { certificationDateIsCurrent, latestCertificationRenewalDay, CERTIFICATION_RENEWAL_MAX_YEARS } from "../../../shared/recruitmentFactOrigins";
import { createCandidateInvitationToken } from "../../candidateAuth";
import { emailLanguageFor } from "../../emailLanguage";
import { buildCandidatePortalInvitationEmailEvent, canForceCandidatePortalInvitation, resolveCandidatePortalInvitationDelivery } from "../../recruitmentEmailTrace";
import { CANDIDATE_INVITATION_FORCED_RESEND_DELAY_MS, candidateInvitationForcedResendAt } from "../../../shared/candidatePortalInvitationResend";
import { MANUAL_REVIEW_FALLBACK_MODEL, RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "../../recruitmentAnalysis";
import { getSafeCheckoutOrigin } from "../publicOrigin";
import { parseAdminDate, parisDateKey } from "../parisTime";
import { missionRefusal, certificationFactsByApplication } from "./recruitmentShared";

export const adminRecruitmentCandidateRouter = router({
  // force: « Renvoyer quand même » after an uncertain attempt (REC-14).
  sendPortalInvitation: adminProcedure.input(z.object({ id: z.number().int().positive(), force: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de données indisponible." });
    const application = (await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, email: cvApplications.email, trackingId: cvApplications.trackingId, language: cvApplications.language })
      .from(cvApplications)
      .where(eq(cvApplications.id, input.id))
      .limit(1))[0];
    if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable." });
    const existingAccount = (await db.select({ emailVerifiedAt: candidateAccounts.emailVerifiedAt })
      .from(candidateAccounts)
      .where(sql`LOWER(${candidateAccounts.email}) = LOWER(${application.email})`)
      .limit(1))[0];
    if (existingAccount?.emailVerifiedAt) throw new TRPCError({ code: "CONFLICT", message: "Un espace candidat actif existe déjà pour cette adresse email." });
    const invitationEvents = await db.select({
      eventType: recruitmentEmailEvents.eventType,
      providerEmailId: recruitmentEmailEvents.providerEmailId,
      payload: recruitmentEmailEvents.payload,
      occurredAt: recruitmentEmailEvents.occurredAt,
    }).from(recruitmentEmailEvents)
      .where(eq(recruitmentEmailEvents.applicationId, application.id))
      .orderBy(desc(recruitmentEmailEvents.occurredAt));
    const invitationDelivery = resolveCandidatePortalInvitationDelivery(invitationEvents);
    // REC-14: once its tracking is checked, an uncertain invitation is sent again anyway, at
    // least 10 minutes after that attempt, as the next attempt under its own idempotency key.
    const uncertain = invitationDelivery.eventType === "email.delivery_unknown";
    if (uncertain && !input.force) {
      throw new TRPCError({ code: "CONFLICT", message: `La livraison de l’invitation précédente est incertaine. Vérifiez son suivi avant tout nouvel envoi pour éviter un doublon ; « Renvoyer quand même » est proposé ${CANDIDATE_INVITATION_FORCED_RESEND_DELAY_MS / 60_000} minutes après cette tentative.` });
    }
    if (uncertain && !canForceCandidatePortalInvitation(invitationDelivery)) {
      const resendAt = candidateInvitationForcedResendAt(invitationDelivery.occurredAt!).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
      throw new TRPCError({ code: "CONFLICT", message: `La tentative d’invitation incertaine date de moins de ${CANDIDATE_INVITATION_FORCED_RESEND_DELAY_MS / 60_000} minutes : elle peut encore aboutir. « Renvoyer quand même » sera possible à ${resendAt}.` });
    }
    const invitationAttempt = invitationDelivery.attempts + 1;
    const invitationToken = createCandidateInvitationToken(application.id);
    const invitationUrl = `${getSafeCheckoutOrigin()}/candidate/access?invite=${encodeURIComponent(invitationToken)}`;
    let result: { id: string };
    try {
      result = await sendCandidatePortalAccessEmail({
        to: application.email,
        firstName: application.firstName,
        kind: "invite",
        actionUrl: invitationUrl,
        // In the language of the application form (EN-02).
        language: emailLanguageFor(application.language),
        idempotencyKey: `candidate-portal-invitation-${application.trackingId}-attempt-${invitationAttempt}`,
      });
    } catch (error) {
      const failureCode = candidatePortalAccessEmailFailureCode(error);
      await db.insert(recruitmentEmailEvents).values(buildCandidatePortalInvitationEmailEvent({
        applicationId: application.id,
        candidateEmail: application.email,
        trackingId: application.trackingId,
        deliveryAttempt: invitationAttempt,
      }, {
        status: "failed",
        providerEmailId: null,
        failureCode,
      }, { localEventId: randomUUID() }));
      const message = failureCode === "delivery_exception"
        ? `La livraison de l’invitation est incertaine. Vérifiez son suivi avant tout nouvel envoi pour éviter un doublon ; « Renvoyer quand même » sera proposé dans ${CANDIDATE_INVITATION_FORCED_RESEND_DELAY_MS / 60_000} minutes.`
        : "L’invitation a été refusée par le service d’envoi. L’échec est enregistré pour reprise.";
      // Its audit line refused, the admin is told what became of the invitation all the same (DATA-01).
      await traceRecruitmentActionDone([{ applicationId: application.id, adminOpenId: ctx.user.openId, action: "email", metadata: { template: "candidate_portal_invitation", outcome: failureCode === "delivery_exception" ? "unknown" : "failed", trackingId: application.trackingId, attempt: invitationAttempt, ...(uncertain ? { forced: true } : {}) } }], message);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
    }
    const invitationEvent = buildCandidatePortalInvitationEmailEvent({
      applicationId: application.id,
        candidateEmail: application.email,
        trackingId: application.trackingId,
        deliveryAttempt: invitationAttempt,
    }, {
      status: "sent",
      providerEmailId: result.id,
      failureCode: null,
    });
    const [existingInvitationEvent] = await db.select({ id: recruitmentEmailEvents.id })
      .from(recruitmentEmailEvents)
      .where(eq(recruitmentEmailEvents.providerEventId, invitationEvent.providerEventId))
      .limit(1);
    if (!existingInvitationEvent) await db.insert(recruitmentEmailEvents).values(invitationEvent);
    await traceRecruitmentActionDone([{ applicationId: application.id, adminOpenId: ctx.user.openId, action: "email", metadata: { template: "candidate_portal_invitation", resendId: result.id, trackingId: application.trackingId, attempt: invitationAttempt, ...(uncertain ? { forced: true } : {}) } }], "L’invitation est envoyée.");
    return { success: true };
  }),
  detail: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    // The extracted CV text is never sent to the browser (the UI does not
    // use it, and a legacy row could hold an oversized text).
    const { extractedText: _extractedText, ...detailColumns } = getTableColumns(cvApplications);
    const [candidate] = await db.select(detailColumns).from(cvApplications).where(eq(cvApplications.id, input.id)).limit(1);
    if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable" });
    const [audits, campaignRecipients, followUps] = await Promise.all([
      db.select().from(recruitmentAuditLogs).where(eq(recruitmentAuditLogs.applicationId, input.id)).orderBy(desc(recruitmentAuditLogs.createdAt)).limit(100),
      db.select({
        id: recruitmentCampaignRecipients.id,
        campaignId: recruitmentCampaignRecipients.campaignId,
        campaignTitle: recruitmentCampaigns.title,
        deliveryStatus: recruitmentCampaignRecipients.deliveryStatus,
        error: recruitmentCampaignRecipients.error,
        sentAt: recruitmentCampaignRecipients.sentAt,
        deliveredAt: recruitmentCampaignRecipients.deliveredAt,
        lastEventAt: recruitmentCampaignRecipients.lastEventAt,
      }).from(recruitmentCampaignRecipients).leftJoin(recruitmentCampaigns, eq(recruitmentCampaignRecipients.campaignId, recruitmentCampaigns.id)).where(eq(recruitmentCampaignRecipients.applicationId, input.id)).orderBy(desc(recruitmentCampaignRecipients.createdAt)).limit(100),
      db.select().from(recruitmentFollowUpTasks).where(eq(recruitmentFollowUpTasks.applicationId, input.id)).orderBy(recruitmentFollowUpTasks.status, recruitmentFollowUpTasks.dueAt).limit(50),
    ]);
    const certifications = (await certificationFactsByApplication(db, [candidate])).get(candidate.id) ?? [];
    return { candidate, audits, campaignRecipients, followUps, certifications };
  }),
  // IA-02: an admin confirms a certification after checking it, or
  // withdraws the confirmation. Only a confirmed certification, declared
  // or read in the CV, earns points in a mission's matching.
  // The name is the one shown, as long as the declared term (the form
  // takes 1,000 characters); a row keeps its first 180.
  // renewal: the certificate checked was renewed since the date read in
  // the CV. The renewal gets a row of its own with the new expiry (none
  // when the certificate has none), so that an expired certification
  // counts again; the rows read in the CV keep their date. An expired
  // certification is confirmed only that way: confirmed as it is, it
  // would still score nothing, so the admin is told to renew it
  // (renewal_required). Withdrawing the confirmation removes the
  // renewal with it, and the rows read in the CV when the latest
  // analysis, under the current prompt and with the AI available, no
  // longer retains the certification.
  confirmCertification: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(1000),
    confirmed: z.boolean(),
    renewal: z.object({ expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    const renewal = input.confirmed ? input.renewal : undefined;
    if (renewal?.expiresAt) {
      if (!parseAdminDate(renewal.expiresAt)) throw missionRefusal("BAD_REQUEST", "renewal_date_invalid", "Nouvelle date d’expiration invalide.");
      if (!certificationDateIsCurrent(renewal.expiresAt)) throw missionRefusal("BAD_REQUEST", "renewal_date_past", "La nouvelle date d’expiration est déjà passée : la certification resterait expirée.");
      // Nor years beyond what a certificate gives: a typing error (9999-12-31) would count it for good.
      const latest = latestCertificationRenewalDay(parisDateKey(new Date()));
      if (renewal.expiresAt > latest) throw missionRefusal("BAD_REQUEST", "renewal_date_too_far", `La nouvelle date d’expiration est à plus de ${CERTIFICATION_RENEWAL_MAX_YEARS} ans : vérifiez-la sur le justificatif (le ${latest.split("-").reverse().join("/")} au plus tard).`, latest);
    }
    const [application] = await db.select({ id: cvApplications.id, certifications: cvApplications.certifications, normalizedCertifications: cvApplications.normalizedCertifications, analysisPromptVersion: cvApplications.analysisPromptVersion, analysisStatus: cvApplications.analysisStatus, analysisModel: cvApplications.analysisModel }).from(cvApplications).where(eq(cvApplications.id, input.id)).limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable." });
    const rows = (await db.select({ id: cvCandidateCertifications.id, name: cvCandidateCertifications.name, source: cvCandidateCertifications.source, confirmedAt: cvCandidateCertifications.confirmedAt, expiresAt: cvCandidateCertifications.expiresAt })
      .from(cvCandidateCertifications)
      .where(eq(cvCandidateCertifications.applicationId, application.id)))
      .filter(row => sameRecruitmentFact(row.name, input.name));
    const declared = declaredCertificationNames(application.certifications).find(name => sameRecruitmentFact(name, input.name));
    // The expiry the CV gives a declared certification while its
    // analysis retained no facts is no reading to confirm: it only dates
    // the certification, and stays unconfirmed until the next analysis.
    const expiryRows = rows.filter(row => row.source === "cv_expiry");
    const factRows = rows.filter(row => row.source !== "cv_expiry");
    if (!factRows.length && !declared) throw new TRPCError({ code: "NOT_FOUND", message: "Cette certification ne figure pas dans le dossier." });
    // Expired, as the mission and the 360° sheet show it (the CV's date,
    // or the confirmed one): only a confirmed renewal makes it count again.
    const expiresAt = certificationFacts(application.certifications, rows).find(fact => sameRecruitmentFact(fact.name, input.name))?.expiresAt;
    if (input.confirmed && !renewal && !certificationDateIsCurrent(expiresAt)) {
      throw missionRefusal("BAD_REQUEST", "renewal_required", "Cette certification a expiré : confirmez son renouvellement, avec la nouvelle date d’expiration lue sur le justificatif, ou cochez qu’il n’en porte pas.");
    }
    const renewalRows = factRows.filter(row => row.source === "renewed");
    const readRows = factRows.filter(row => row.source !== "renewed");
    // Rows whose confirmation changes, a renewal new or redated, a
    // declared certification's first confirmation, a renewal withdrawn:
    // nothing is logged when nothing changes.
    const changed = readRows.filter(row => (row.confirmedAt === null) === input.confirmed);
    // Withdrawn, a row read in the CV goes when the latest analysis does
    // not retain the certification (it found a contradiction or hidden
    // text since, or no longer reads it): nothing vouches for it any
    // more, and kept unconfirmed it would show « à confirmer » in the
    // mission and the 360° sheet while the certification filters, which
    // read that analysis, no longer find it. An analysis under an older
    // prompt, which the filters do not read, says nothing either way:
    // its row stays, unconfirmed, until the dossier is analysed again. So
    // does a degraded one: the AI was unavailable, the CV was not read.
    const analysisIsCurrent = application.analysisPromptVersion === RECRUITMENT_ANALYSIS_PROMPT_VERSION
      && application.analysisStatus !== "degraded" && application.analysisModel !== MANUAL_REVIEW_FALLBACK_MODEL;
    const retainedByAnalysis = analysedCertificationNames(application.normalizedCertifications).some(name => sameRecruitmentFact(name, input.name));
    const dropped = input.confirmed || !analysisIsCurrent || retainedByAnalysis ? [] : changed.filter(row => row.source === "extracted");
    const updated = changed.filter(row => !dropped.includes(row));
    const renewalChanged = renewal !== undefined && (!renewalRows.length || renewalRows.some(row => row.expiresAt !== renewal.expiresAt));
    // A certification declared in the form only: its confirmation gets a
    // row of its own, unless its renewal's row holds it.
    const declaredConfirmation = input.confirmed && !factRows.length && !renewal;
    const renewalWithdrawn = !input.confirmed && renewalRows.length > 0;
    if (!changed.length && !renewalChanged && !declaredConfirmation && !renewalWithdrawn) return { success: true, changed: false };
    const certification = factRows[0]?.name ?? declared;
    // The audit line and the rows in one batch, all or nothing (DATA-01):
    // when the database refuses one, the confirmation is not recorded
    // either, as the screen then says.
    await db.batch([
      recruitmentAuditInsert(db, [{
        applicationId: application.id,
        adminOpenId: ctx.user.openId,
        action: "status_update",
        metadata: renewal
          ? { event: "certification_renewed", certification, expiresAt: renewal.expiresAt, previousExpiresAt: Array.from(new Set((renewalRows.length ? renewalRows : [...readRows, ...expiryRows]).map(row => row.expiresAt))) }
          : { event: input.confirmed ? "certification_confirmed" : "certification_unconfirmed", certification, ...(dropped.length ? { notRetainedByAnalysis: true } : {}) },
      }]),
      ...(updated.length ? [db.update(cvCandidateCertifications).set({ confirmedAt: input.confirmed ? new Date() : null }).where(inArray(cvCandidateCertifications.id, updated.map(row => row.id)))] : []),
      ...(dropped.length ? [db.delete(cvCandidateCertifications).where(inArray(cvCandidateCertifications.id, dropped.map(row => row.id)))] : []),
      ...(declaredConfirmation ? [db.insert(cvCandidateCertifications).values({ applicationId: application.id, name: declared!.slice(0, CERTIFICATION_NAME_MAX_LENGTH), source: "declared", confirmedAt: new Date() })] : []),
      ...(renewal && renewalChanged ? [renewalRows.length
        ? db.update(cvCandidateCertifications).set({ expiresAt: renewal.expiresAt }).where(inArray(cvCandidateCertifications.id, renewalRows.map(row => row.id)))
        : db.insert(cvCandidateCertifications).values({ applicationId: application.id, name: (factRows[0]?.name ?? declared!).slice(0, CERTIFICATION_NAME_MAX_LENGTH), source: "renewed", confirmedAt: new Date(), expiresAt: renewal.expiresAt })] : []),
      ...(renewalWithdrawn ? [db.delete(cvCandidateCertifications).where(inArray(cvCandidateCertifications.id, renewalRows.map(row => row.id)))] : []),
    ]);
    return { success: true, changed: true, ...(dropped.length ? { notRetainedByAnalysis: true } : {}) };
  }),
  // ADM-13: « Le candidat a répondu ». Dated for the response rate, and the candidate's
  // follow-ups still to review closed as handled, so that « Relances à faire » no longer
  // lists someone who answered. A dossier that does not exist is refused, with no audit line.
  markResponse: adminProcedure.input(z.object({ id: z.number().int().positive(), note: z.string().trim().max(1000).optional() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    const [application] = await db.select({ id: cvApplications.id }).from(cvApplications).where(eq(cvApplications.id, input.id)).limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable." });
    const pendingFollowUp = and(eq(recruitmentFollowUpTasks.applicationId, input.id), eq(recruitmentFollowUpTasks.status, "suggested"));
    const closed = await db.select({ id: recruitmentFollowUpTasks.id }).from(recruitmentFollowUpTasks).where(pendingFollowUp);
    const responseAt = new Date();
    // The response, the follow-ups closed and their audit lines in one batch, all or none (DATA-01).
    await db.batch([
      db.update(cvApplications).set({ lastCandidateResponseAt: responseAt, updatedAt: responseAt }).where(eq(cvApplications.id, input.id)),
      db.update(recruitmentFollowUpTasks).set({ status: "completed", completedAt: responseAt, completedByOpenId: ctx.user.openId, updatedAt: responseAt }).where(pendingFollowUp),
      recruitmentAuditInsert(db, [
        { applicationId: input.id, adminOpenId: ctx.user.openId, action: "status_update", metadata: { event: "candidate_response", note: input.note || null } },
        ...closed.map(task => ({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "status_update" as const, metadata: { event: "follow_up", taskId: task.id, status: "completed", reason: "candidate_response" } })),
      ]),
    ]);
    return { success: true, responseAt, closedFollowUps: closed.length };
  }),
});

export const adminRecruitmentFollowUpsRouter = router({
  list: adminProcedure.input(z.object({ status: z.enum(["suggested", "completed", "dismissed"]).optional() }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const whereClause = input?.status ? eq(recruitmentFollowUpTasks.status, input.status) : undefined;
    return db.select({
      id: recruitmentFollowUpTasks.id,
      applicationId: recruitmentFollowUpTasks.applicationId,
      campaignId: recruitmentFollowUpTasks.campaignId,
      kind: recruitmentFollowUpTasks.kind,
      dueAt: recruitmentFollowUpTasks.dueAt,
      status: recruitmentFollowUpTasks.status,
      notes: recruitmentFollowUpTasks.notes,
      completedAt: recruitmentFollowUpTasks.completedAt,
      firstName: cvApplications.firstName,
      lastName: cvApplications.lastName,
      specialty: cvApplications.specialty,
      email: cvApplications.email,
    }).from(recruitmentFollowUpTasks).innerJoin(cvApplications, eq(recruitmentFollowUpTasks.applicationId, cvApplications.id)).where(whereClause).orderBy(recruitmentFollowUpTasks.dueAt).limit(200);
  }),
  update: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["suggested", "completed", "dismissed"]), notes: z.string().trim().max(2000).optional() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    const [task] = await db.select().from(recruitmentFollowUpTasks).where(eq(recruitmentFollowUpTasks.id, input.id)).limit(1);
    if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Relance introuvable" });
    // With its audit line, both or neither (DATA-01).
    await recordWithRecruitmentAudit(db, db.update(recruitmentFollowUpTasks).set({
      status: input.status,
      notes: input.notes ?? task.notes,
      completedAt: input.status === "suggested" ? null : new Date(),
      completedByOpenId: input.status === "suggested" ? null : ctx.user.openId,
      updatedAt: new Date(),
    }).where(eq(recruitmentFollowUpTasks.id, input.id)), [{ applicationId: task.applicationId, adminOpenId: ctx.user.openId, action: "status_update", metadata: { event: "follow_up", taskId: task.id, status: input.status } }]);
    return { success: true };
  }),
  // ADM-13: « Marquer traitée » or « Ignorer » for the follow-ups selected in
  // « Relances à faire »: only those still to review, each with its audit
  // line, in one batch (DATA-01). updated: how many changed.
  updateMany: adminProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(200), status: z.enum(["completed", "dismissed"]) })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    const tasks = await db.select({ id: recruitmentFollowUpTasks.id, applicationId: recruitmentFollowUpTasks.applicationId })
      .from(recruitmentFollowUpTasks)
      .where(and(inArray(recruitmentFollowUpTasks.id, input.ids), eq(recruitmentFollowUpTasks.status, "suggested")));
    if (!tasks.length) return { success: true, updated: 0 };
    const now = new Date();
    // The change and its audit lines in one batch. A follow-up another admin handles between the read
    // above and the batch keeps its status (the update is filtered on 'suggested') but is still counted
    // and logged here: a rare race, accepted rather than splitting the change from its audit.
    await db.batch([
      db.update(recruitmentFollowUpTasks)
        .set({ status: input.status, completedAt: now, completedByOpenId: ctx.user.openId, updatedAt: now })
        .where(and(inArray(recruitmentFollowUpTasks.id, tasks.map(task => task.id)), eq(recruitmentFollowUpTasks.status, "suggested"))),
      recruitmentAuditInsert(db, tasks.map(task => ({ applicationId: task.applicationId, adminOpenId: ctx.user.openId, action: "status_update" as const, metadata: { event: "follow_up", taskId: task.id, status: input.status, batch: true } }))),
    ]);
    return { success: true, updated: tasks.length };
  }),
});
