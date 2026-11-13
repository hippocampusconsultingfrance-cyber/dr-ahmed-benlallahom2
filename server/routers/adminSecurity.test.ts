import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { securityEvents } from "../../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "../testing/memoryPgProxy";
import type { TrpcContext } from "../_core/context";

// ADM-15 — le journal de sécurité filtré et paginé sur la base ; ADM-14 — les
// sessions Clerk de l’administrateur, lues et révoquées par des doubles locaux
// de l’API Clerk (aucun appel réel), avec ses autres preuves de double
// authentification.

type ClerkSession = { id: string; lastActiveAt: number; latestActivity?: Record<string, unknown> };

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  currentSessionId: "sess_current" as string | null,
  sessions: [] as ClerkSession[],
  listFails: false,
  revokeFails: new Set<string>(),
  revoked: [] as string[],
  listed: [] as unknown[],
  otherMfaRevoked: [] as unknown[],
}));

vi.mock("../db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("../_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ sessionId: state.currentSessionId }),
  clerkClient: {
    sessions: {
      getSessionList: vi.fn(async (params: unknown) => {
        state.listed.push(params);
        if (state.listFails) throw new Error("clerk_unavailable");
        return { data: state.sessions, totalCount: state.sessions.length };
      }),
      revokeSession: vi.fn(async (id: string) => {
        if (state.revokeFails.has(id)) throw new Error("clerk_revoke_failed");
        state.revoked.push(id);
        return { id, status: "revoked" };
      }),
    },
  },
}));
vi.mock("../adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("../adminMfa")>(),
  revokeOtherAdminMfaSessions: vi.fn(async (input: unknown) => { state.otherMfaRevoked.push(input); return 2; }),
}));

const { adminSecurityRouter } = await import("./adminSecurity");

const OWNER = "user_owner";
let memory: MemoryPg;

function caller(options: { role?: "admin" | "user"; mfaVerified?: boolean } = {}) {
  return adminSecurityRouter.createCaller({
    user: { openId: OWNER, role: options.role ?? "admin" } as TrpcContext["user"],
    mfaVerified: options.mfaVerified ?? true,
    req: { protocol: "https", headers: { "x-forwarded-for": "198.51.100.7", cookie: "admin_mfa_session=this-browser" } } as unknown as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  });
}

function seedEvents(rows: Array<{ actor: string; category: string; outcome: string; severity?: string }>) {
  return memory.seed(securityEvents, rows.map(row => ({ security_event_actor_kind: row.actor, category: row.category, security_event_outcome: row.outcome, security_event_severity: row.severity ?? "info" })));
}

beforeEach(() => {
  memory = createMemoryPg([securityEvents]);
  state.memory = memory;
  state.currentSessionId = "sess_current";
  state.sessions = [];
  state.listFails = false;
  state.revokeFails = new Set();
  state.revoked = [];
  state.listed = [];
  state.otherMfaRevoked = [];
});

describe("ADM-15 — journal de sécurité", () => {
  beforeEach(() => {
    seedEvents([
      { actor: "candidate", category: "candidate_login", outcome: "allowed" },
      { actor: "admin", category: "admin_mfa_verify", outcome: "allowed" },
      { actor: "candidate", category: "candidate_login", outcome: "failed", severity: "warning" },
      { actor: "candidate", category: "candidate_login", outcome: "allowed" },
      { actor: "anonymous", category: "candidate_login_rate_limited", outcome: "blocked", severity: "warning" },
      { actor: "admin", category: "admin_mfa_verify", outcome: "failed", severity: "high" },
      { actor: "candidate", category: "candidate_login", outcome: "allowed" },
    ]);
  });
  const categories = (events: Array<{ category: string; outcome: string }>) => events.map(event => `${event.category}:${event.outcome}`);

  it("masque par défaut les connexions candidats réussies, garde les refusées, du plus récent au plus ancien", async () => {
    expect(categories(await caller().events())).toEqual([
      "admin_mfa_verify:failed",
      "candidate_login_rate_limited:blocked",
      "candidate_login:failed",
      "admin_mfa_verify:allowed",
    ]);
    expect(await caller().events({ includeCandidateSignIns: true })).toHaveLength(7);
  });

  it("ne garde que l’administrateur, ou que les avertissements et plus, ou les deux", async () => {
    expect(categories(await caller().events({ adminOnly: true }))).toEqual(["admin_mfa_verify:failed", "admin_mfa_verify:allowed"]);
    expect(categories(await caller().events({ warningsAndAbove: true }))).toEqual(["admin_mfa_verify:failed", "candidate_login_rate_limited:blocked", "candidate_login:failed"]);
    expect(categories(await caller().events({ adminOnly: true, warningsAndAbove: true }))).toEqual(["admin_mfa_verify:failed"]);
  });

  it("pagine par l’évènement le plus ancien de la page : ni doublon ni trou", async () => {
    const first = await caller().events({ limit: 2, includeCandidateSignIns: true });
    const second = await caller().events({ limit: 2, includeCandidateSignIns: true, beforeId: first.at(-1)!.id });
    const rest = await caller().events({ limit: 10, includeCandidateSignIns: true, beforeId: second.at(-1)!.id });
    const ids = [...first, ...second, ...rest].map(event => event.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(new Set(ids).size).toBe(7);
  });

  it("reste réservé à l’administrateur doublement authentifié", async () => {
    await expect(caller({ mfaVerified: false }).events()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller({ role: "user" }).events()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("ADM-14 — sessions administrateur", () => {
  beforeEach(() => {
    state.sessions = [
      { id: "sess_lost_phone", lastActiveAt: Date.parse("2026-11-10T18:05:00Z"), latestActivity: { browserName: "Safari", browserVersion: "19", deviceType: "iPhone", city: "Lyon", country: "FR", ipAddress: "203.0.113.9", isMobile: true } },
      { id: "sess_current", lastActiveAt: Date.parse("2026-11-12T09:30:00Z"), latestActivity: { browserName: "Firefox", browserVersion: "140", deviceType: "Macintosh", city: "Paris", country: "FR", ipAddress: "198.51.100.7", isMobile: false } },
      { id: "sess_old_laptop", lastActiveAt: Date.parse("2026-11-11T07:00:00Z") },
    ];
  });

  it("liste les sessions actives de l’administrateur chez Clerk, celle-ci d’abord, sans leur adresse IP", async () => {
    const sessions = await caller().sessions();
    expect(state.listed).toEqual([{ userId: OWNER, status: "active", limit: 100 }]);
    expect(sessions).toEqual([
      { id: "sess_current", current: true, lastActiveAt: new Date("2026-11-12T09:30:00Z"), browser: "Firefox 140", device: "Macintosh", location: "Paris, FR" },
      { id: "sess_old_laptop", current: false, lastActiveAt: new Date("2026-11-11T07:00:00Z"), browser: null, device: null, location: null },
      { id: "sess_lost_phone", current: false, lastActiveAt: new Date("2026-11-10T18:05:00Z"), browser: "Safari 19", device: "iPhone", location: "Lyon, FR" },
    ]);
    expect(JSON.stringify(sessions)).not.toContain("203.0.113.9");
  });

  it("révoque toutes les autres sessions et leurs preuves de double authentification, garde celle-ci, et le trace", async () => {
    await expect(caller().revokeOtherSessions()).resolves.toEqual({ revoked: 2, notRevoked: 0, securitySessions: 2 });
    expect(state.revoked.sort()).toEqual(["sess_lost_phone", "sess_old_laptop"]);
    expect(state.otherMfaRevoked).toEqual([expect.objectContaining({ openId: OWNER, req: expect.objectContaining({ headers: expect.objectContaining({ cookie: "admin_mfa_session=this-browser" }) }) })]);
    const [trace] = memory.rows(securityEvents);
    expect(trace).toMatchObject({ category: "admin_sessions_revoked_others", security_event_actor_kind: "admin", actor_reference: OWNER, security_event_outcome: "allowed", security_event_severity: "warning" });
    expect(JSON.parse(String(trace!.metadata))).toEqual({ revoked: 2, notRevoked: 0, securitySessions: 2 });
  });

  it("compte la session que Clerk refuse de révoquer, sans s’arrêter aux autres", async () => {
    state.revokeFails = new Set(["sess_lost_phone"]);
    await expect(caller().revokeOtherSessions()).resolves.toEqual({ revoked: 1, notRevoked: 1, securitySessions: 2 });
    expect(state.revoked).toEqual(["sess_old_laptop"]);
  });

  it("renvoie au tableau de bord Clerk quand Clerk ne répond pas, sans rien révoquer", async () => {
    state.listFails = true;
    const refusal = await caller().revokeOtherSessions().catch(error => error);
    expect(refusal).toBeInstanceOf(TRPCError);
    expect(refusal).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: expect.stringContaining("tableau de bord Clerk (Users, puis Sessions)") });
    expect(state.revoked).toEqual([]);
    expect(state.otherMfaRevoked).toEqual([]);
    await expect(caller().sessions()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("ne révoque rien sans session Clerk identifiée pour ce navigateur, ni sans double authentification", async () => {
    state.currentSessionId = null;
    await expect(caller().revokeOtherSessions()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    state.currentSessionId = "sess_current";
    await expect(caller({ mfaVerified: false }).revokeOtherSessions()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller({ mfaVerified: false }).sessions()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.listed).toEqual([]);
    expect(state.revoked).toEqual([]);
  });
});
