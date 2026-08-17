import { and, eq, isNull, lt } from "drizzle-orm";
import { cvApplications } from "../drizzle/schema";
import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import { logRecruitmentAction } from "./recruitmentAudit";

export function buildRetentionReviewReminder(input: { previousNotes: string | null; at: Date }) {
  return {
    fileValidationNotes: `${input.previousNotes || ""}; retention_review_notified_at=${input.at.toISOString()}`.slice(0, 4000),
    retentionReviewNotifiedAt: input.at,
  };
}

export async function runRecruitmentRetentionCleanup(actorOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = new Date();
  const expired = await db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId, fileValidationNotes: cvApplications.fileValidationNotes })
    .from(cvApplications)
    .where(and(lt(cvApplications.retentionUntil, now), isNull(cvApplications.retentionReviewNotifiedAt)));

  for (const application of expired) {
    await db.update(cvApplications)
      .set({
        ...buildRetentionReviewReminder({ previousNotes: application.fileValidationNotes, at: now }),
        updatedAt: now,
      })
      .where(eq(cvApplications.id, application.id));
    await logRecruitmentAction({
      applicationId: application.id,
      adminOpenId: actorOpenId,
      action: "retention_cleanup",
      metadata: { trackingId: application.trackingId, reviewNotifiedAt: now.toISOString(), storageReferenceAccessible: true, action: "non_destructive_retention_review" },
    });
  }

  if (expired.length > 0) {
    await notifyOwner({
      title: `Rétention recrutement : ${expired.length} dossier(s) à examiner`,
      content: `Les candidatures suivantes ont dépassé leur durée de conservation : ${expired.map(item => item.trackingId).join(", ")}. Les CV et leurs références de stockage ont été conservés ; examinez-les dans le dashboard et ne lancez une suppression qu’en cas de demande RGPD explicite.`,
    });
  }
  return { notified: expired.length, trackingIds: expired.map(item => item.trackingId) };
}
