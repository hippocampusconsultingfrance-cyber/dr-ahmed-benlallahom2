import { inArray } from "drizzle-orm";
import { cvApplications } from "../drizzle/schema";
import { getDb } from "./db";
import { storageDelete, storageListObjects } from "./storage";

/** Where the application form stores each CV, as `${trackingId}-${file name}`. */
export const APPLICATION_CV_PREFIX = "recruitment/quarantine/";
/** A request lasts 60 s at most: a CV stored this long ago without its application row was left behind. */
export const ORPHAN_APPLICATION_CV_AFTER_MS = 60 * 60 * 1000;
/** Bound of one daily scan (one listing call per 1,000 CVs). */
export const ORPHAN_APPLICATION_CV_SCAN_LIMIT = 20_000;

function trackingIdOf(key: string) {
  return /^recruitment\/quarantine\/(CV[A-Z0-9]{16})-/.exec(key)?.[1] ?? null;
}

/**
 * DATA-02: the application form stores the CV, then the application row. A
 * request stopped between the two (INSERT refused, function stopped) leaves a
 * CV that no dossier points to, so that no erasure, retention or export ever
 * reaches it. Run by the daily retention job: deletes the stored CVs older
 * than an hour whose reference no application row has.
 */
export async function removeOrphanApplicationCvFiles(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const objects = await storageListObjects(APPLICATION_CV_PREFIX, ORPHAN_APPLICATION_CV_SCAN_LIMIT);
  const old = objects.filter(object => object.uploadedAt.getTime() < now.getTime() - ORPHAN_APPLICATION_CV_AFTER_MS && trackingIdOf(object.key));
  const trackingIds = Array.from(new Set(old.map(object => trackingIdOf(object.key)!)));
  const known = new Set<string>();
  for (let index = 0; index < trackingIds.length; index += 500) {
    const rows = await db.select({ trackingId: cvApplications.trackingId }).from(cvApplications)
      .where(inArray(cvApplications.trackingId, trackingIds.slice(index, index + 500)));
    for (const row of rows) known.add(row.trackingId);
  }
  const orphans = old.filter(object => !known.has(trackingIdOf(object.key)!)).map(object => object.key);
  if (orphans.length) await storageDelete(orphans);
  return { scanned: objects.length, deleted: orphans.length, scanComplete: objects.length < ORPHAN_APPLICATION_CV_SCAN_LIMIT };
}
