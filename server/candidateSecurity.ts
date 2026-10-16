import { createHash } from "node:crypto";
import { and, eq, gt, isNotNull, lte, sql } from "drizzle-orm";
import { candidateSecurityRateLimits, securityEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";

const HIBP_CACHE_TTL_MS = 10 * 60 * 1000;
const pwnedSuffixCache = new Map<string, { expiresAt: number; suffixes: Set<string> }>();

function securityPepper() {
  return process.env.CANDIDATE_AUTH_PEPPER || process.env.JWT_SECRET || "security-pepper-unavailable";
}

export function hashSecurityValue(value: string): string {
  return createHash("sha256").update(`${securityPepper()}:${value.trim().toLowerCase()}`).digest("hex");
}

export function requestIpHash(headers: Record<string, unknown>): string | null {
  const forwarded = headers["x-forwarded-for"];
  const ip = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : typeof headers["x-real-ip"] === "string" ? headers["x-real-ip"] : null;
  return ip ? hashSecurityValue(ip) : null;
}

export async function logSecurityEvent(input: {
  actorKind: "candidate" | "admin" | "anonymous" | "system";
  actorReference?: string | null;
  category: string;
  outcome: "allowed" | "blocked" | "failed" | "alert";
  severity?: "info" | "warning" | "high" | "critical";
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(securityEvents).values({
    actorKind: input.actorKind,
    actorReference: input.actorReference ?? null,
    category: input.category.slice(0, 100),
    outcome: input.outcome,
    severity: input.severity ?? "info",
    ipHash: input.ipHash ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
  if ((input.severity === "high" || input.severity === "critical") && input.outcome !== "allowed") {
    void notifyOwner({ title: "Alerte sécurité — Hippocampus Consulting", content: `${input.category} · ${input.outcome}. Une vérification administrative est recommandée.` }).catch(() => undefined);
  }
}

export type PersistentRateLimitPolicy = {
  action: string;
  subject: string;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
};

/** newlyBlocked is true only for the attempt that created the current block. */
export type PersistentRateLimitState = { attemptCount: number; blockedUntil: Date | null; blocked: boolean; newlyBlocked: boolean };

function asDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function timestampValue(value: Date) {
  // Same wall-clock encoding as drizzle's own timestamp columns (ISO string, UTC).
  return sql`${value.toISOString()}::timestamp`;
}

/**
 * Counts one attempt atomically and reports whether the subject is blocked.
 * A single UPDATE ... RETURNING computes the new counter from the stored row,
 * so concurrent requests can no longer lose increments (CAND-01). Semantics:
 * - while blocked (blocked_until in the future and the count above the current
 *   threshold) nothing changes and the subject stays blocked;
 * - a block that has expired resets the counter (CAND-12);
 * - a window older than windowMs restarts at 1;
 * - going above maxAttempts blocks for blockMs.
 * A block created under an older, lower threshold is not kept once the policy
 * is relaxed (attemptCount > maxAttempts is re-checked with the new value).
 */
export async function recordPersistentRateLimitAttempt(input: PersistentRateLimitPolicy): Promise<PersistentRateLimitState> {
  const db = await getDb();
  if (!db) throw new Error("candidate_security_database_unavailable");
  const table = candidateSecurityRateLimits;
  const subjectHash = hashSecurityValue(input.subject);
  const now = new Date();
  const blockedNow = and(isNotNull(table.blockedUntil), gt(table.blockedUntil, now), gt(table.attemptCount, input.maxAttempts));
  const expiredBlock = and(isNotNull(table.blockedUntil), lte(table.blockedUntil, now));
  const sameWindow = gt(table.windowStartedAt, new Date(now.getTime() - input.windowMs));
  const nextCount = sql`CASE WHEN ${expiredBlock} THEN 1 WHEN ${sameWindow} THEN ${table.attemptCount} + 1 ELSE 1 END`;
  const subjectRow = and(eq(table.action, input.action), eq(table.subjectHash, subjectHash));
  const returning = { attemptCount: table.attemptCount, blockedUntil: table.blockedUntil };
  const increment = () => db.update(table).set({
    attemptCount: sql`CASE WHEN ${blockedNow} THEN ${table.attemptCount} ELSE ${nextCount} END`,
    windowStartedAt: sql`CASE WHEN ${blockedNow} THEN ${table.windowStartedAt} WHEN ${expiredBlock} THEN ${timestampValue(now)} WHEN ${sameWindow} THEN ${table.windowStartedAt} ELSE ${timestampValue(now)} END`,
    blockedUntil: sql`CASE WHEN ${blockedNow} THEN ${table.blockedUntil} WHEN (${nextCount}) > ${input.maxAttempts} THEN ${timestampValue(new Date(now.getTime() + input.blockMs))} ELSE NULL END`,
    lastAttemptAt: now,
  }).where(subjectRow).returning(returning);

  let rows = await increment();
  if (rows.length === 0) {
    const firstBlock = 1 > input.maxAttempts ? new Date(now.getTime() + input.blockMs) : null;
    rows = await db.insert(table)
      .values({ action: input.action, subjectHash, windowStartedAt: now, attemptCount: 1, blockedUntil: firstBlock, lastAttemptAt: now })
      .onConflictDoNothing()
      .returning(returning);
    // Lost the race for the first row: count on the row the other request created.
    if (rows.length === 0) rows = await increment();
  }
  // Several rows can only exist if the unique index is missing; the strictest one wins.
  const row = rows.reduce((strictest, candidate) => Number(candidate.attemptCount) > Number(strictest.attemptCount) ? candidate : strictest, rows[0]);
  const attemptCount = Number(row?.attemptCount ?? 1);
  const blockedUntil = asDate(row?.blockedUntil);
  const blocked = Boolean(blockedUntil && blockedUntil > now && attemptCount > input.maxAttempts);
  // A block set by this very statement ends exactly blockMs after this request's clock.
  const newlyBlocked = blocked && blockedUntil!.getTime() === now.getTime() + input.blockMs;
  return { attemptCount, blockedUntil, blocked, newlyBlocked };
}

export async function enforcePersistentRateLimit(input: PersistentRateLimitPolicy): Promise<void> {
  const state = await recordPersistentRateLimitAttempt(input);
  if (state.blocked) throw new Error("candidate_security_rate_limited");
}

/** Forgets the counter of a subject (e.g. after a successful sign-in). */
export async function clearPersistentRateLimit(input: { action: string; subject: string }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(candidateSecurityRateLimits).where(and(
    eq(candidateSecurityRateLimits.action, input.action),
    eq(candidateSecurityRateLimits.subjectHash, hashSecurityValue(input.subject)),
  ));
}

export async function isCompromisedPassword(password: string): Promise<boolean> {
  if (process.env.NODE_ENV === "test") return false;
  const digest = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  const cached = pwnedSuffixCache.get(prefix);
  if (cached && cached.expiresAt > Date.now()) return cached.suffixes.has(suffix);
  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true", "User-Agent": "HippocampusConsulting-CandidateSecurity" },
  });
  if (!response.ok) throw new Error("candidate_password_breach_check_unavailable");
  const suffixes = new Set((await response.text()).split("\n").map(line => line.split(":")[0]?.trim()).filter((value): value is string => Boolean(value)));
  pwnedSuffixCache.set(prefix, { expiresAt: Date.now() + HIBP_CACHE_TTL_MS, suffixes });
  return suffixes.has(suffix);
}
