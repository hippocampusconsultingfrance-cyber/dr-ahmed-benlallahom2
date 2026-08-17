import { and, eq, lt, ne } from "drizzle-orm";
import { cvApplications } from "../drizzle/schema";
import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import { logRecruitmentAction } from "./recruitmentAudit";

export function buildRetentionRetirement(input: { trackingId: string; previousNotes: string | null; at: Date }) {
  return {
    cvFileKey: `retired/${input.trackingId}`,
    cvOriginalName: "document-retired",
    fileValidationStatus: "rejected" as const,
    fileValidationNotes: `${input.previousNotes || ""}; retention_reference_retired_at=${input.at.toISOString()}`.slice(0, 4000),
  };
}

export async function runRecruitmentRetentionCleanup(actorOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = new Date();
  const expired = await db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId, fileValidationNotes: cvApplications.fileValidationNotes })
    .from(cvApplications)
    .where(and(lt(cvApplications.retentionUntil, now), ne(cvApplications.status, "archived")));

  for (const application of expired) {
    await db.update(cvApplications)
      .set({
        status: "archived",
        ...buildRetentionRetirement({ trackingId: application.trackingId, previousNotes: application.fileValidationNotes, at: now }),
        updatedAt: now,
      })
      .where(and(eq(cvApplications.id, application.id), ne(cvApplications.status, "archived")));
    await logRecruitmentAction({
      applicationId: application.id,
      adminOpenId: actorOpenId,
      action: "retention_cleanup",
      metadata: { trackingId: application.trackingId, retiredAt: now.toISOString(), storageReferenceAccessible: false },
    });
    await logRecruitmentAction({
      applicationId: application.id,
      adminOpenId: actorOpenId,
      action: "retention_cleanup",
      metadata: { trackingId: application.trackingId, archivedAt: now.toISOString() },
    });
  }

  if (expired.length > 0) {
    await notifyOwner({
      title: `Rétention recrutement : ${expired.length} dossier(s) archivé(s)`,
      content: `Les candidatures suivantes ont dépassé leur durée de conservation et ont été archivées automatiquement : ${expired.map(item => item.trackingId).join(", ")}. Vérifiez les demandes de suppression définitive dans le dashboard administrateur.`,
    });
  }
  return { archived: expired.length, trackingIds: expired.map(item => item.trackingId) };
}
