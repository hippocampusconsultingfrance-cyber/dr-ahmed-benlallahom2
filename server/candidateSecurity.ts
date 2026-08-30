import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
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

export async function enforcePersistentRateLimit(input: {
  action: string;
  subject: string;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("candidate_security_database_unavailable");
  const subjectHash = hashSecurityValue(input.subject);
  const now = new Date();
  const existing = (await db.select().from(candidateSecurityRateLimits).where(and(eq(candidateSecurityRateLimits.action, input.action), eq(candidateSecurityRateLimits.subjectHash, subjectHash))).limit(1))[0];
  if (!existing) {
    await db.insert(candidateSecurityRateLimits).values({ action: input.action, subjectHash, windowStartedAt: now, attemptCount: 1, lastAttemptAt: now });
    return;
  }
  // A policy can be relaxed after a false positive or an infrastructure incident.
  // In that case, do not preserve a block created under the older, lower threshold.
  if (existing.blockedUntil && existing.blockedUntil > now && existing.attemptCount > input.maxAttempts) {
    throw new Error("candidate_security_rate_limited");
  }
  const sameWindow = now.getTime() - existing.windowStartedAt.getTime() < input.windowMs;
  const attempts = sameWindow ? existing.attemptCount + 1 : 1;
  const blockedUntil = attempts > input.maxAttempts ? new Date(now.getTime() + input.blockMs) : null;
  await db.update(candidateSecurityRateLimits).set({
    windowStartedAt: sameWindow ? existing.windowStartedAt : now,
    attemptCount: attempts,
    blockedUntil,
    lastAttemptAt: now,
  }).where(eq(candidateSecurityRateLimits.id, existing.id));
  if (blockedUntil) throw new Error("candidate_security_rate_limited");
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
