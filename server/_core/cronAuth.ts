import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET
 * environment variable is set on the project. The comparison is constant-time
 * (both sides are hashed to a fixed length first) and fails closed when the
 * secret is missing, so an unconfigured deployment never exposes the jobs.
 */
export function isAuthorizedVercelCronRequest(
  authorization: string | string[] | undefined,
  cronSecret: string | undefined = process.env.CRON_SECRET,
): boolean {
  const secret = cronSecret?.trim();
  if (!secret) return false;
  if (typeof authorization !== "string" || authorization.length === 0) return false;
  return timingSafeEqual(sha256(authorization), sha256(`Bearer ${secret}`));
}

export function requireVercelCron(req: Request, res: Response, next: NextFunction) {
  if (!isAuthorizedVercelCronRequest(req.headers.authorization)) {
    if (!process.env.CRON_SECRET?.trim()) {
      console.error("[Cron] CRON_SECRET is not configured; scheduled job refused");
    }
    res.status(403).json({ error: "cron-only" });
    return;
  }
  next();
}
