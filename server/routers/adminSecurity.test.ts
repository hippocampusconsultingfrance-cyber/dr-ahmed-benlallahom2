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
  /** The order in which the security codes and Clerk were reached. */
  calls: [] as string[],
}));

vi.mock("../db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("../_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ sessionId: state.currentSessionId }),
  clerkClient: {
    sessions: {
      getSessionList: vi.fn(async (params: unknown) => {
        state.listed.push(params);
        state.calls.push("clerk.getSessionList");
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
  revokeOtherAdminMfaSessions: vi.fn(async (input: unknown) => { state.otherMfaRevoked.push(input); state.calls.push("revokeOtherAdminMfaSessions"); return 2; }),
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
  state.calls = [];
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
    await expect(caller({ mfaVerified: false }).recentHighEvents()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("compte les événements élevés ou critiques des dernières 24 heures sur tout le journal", async () => {
    memory.seed(securityEvents, [
      { security_event_actor_kind: "candidate", category: "candidate_login", security_event_outcome: "failed", security_event_severity: "critical" },
      // Older than a day: no longer counted.
      { security_event_actor_kind: "admin", category: "admin_mfa_verify", security_event_outcome: "failed", security_event_severity: "high", created_at: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    ]);
    // The high admin event seeded above, the critical candidate one; not the warnings.
    await expect(caller().recentHighEvents()).resolves.toEqual({ count: 2 });
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
    await expect(caller().revokeOtherSessions()).resolves.toEqual({ revoked: 2, notRevoked: 0, securitySessions: 2, clerkUnavailable: false });
    expect(state.revoked.sort()).toEqual(["sess_lost_phone", "sess_old_laptop"]);
    // The security codes first, whatever Clerk answers next.
    expect(state.calls).toEqual(["revokeOtherAdminMfaSessions", "clerk.getSessionList"]);
    expect(state.otherMfaRevoked).toEqual([expect.objectContaining({ openId: OWNER, req: expect.objectContaining({ headers: expect.objectContaining({ cookie: "admin_mfa_session=this-browser" }) }) })]);
    const [trace] = memory.rows(securityEvents);
    expect(trace).toMatchObject({ category: "admin_sessions_revoked_others", security_event_actor_kind: "admin", actor_reference: OWNER, security_event_outcome: "allowed", security_event_severity: "warning" });
    expect(JSON.parse(String(trace!.metadata))).toEqual({ revoked: 2, notRevoked: 0, securitySessions: 2, clerkUnavailable: false });
  });

  it("compte la session que Clerk refuse de révoquer, sans s’arrêter aux autres", async () => {
    state.revokeFails = new Set(["sess_lost_phone"]);
    await expect(caller().revokeOtherSessions()).resolves.toEqual({ revoked: 1, notRevoked: 1, securitySessions: 2, clerkUnavailable: false });
    expect(state.revoked).toEqual(["sess_old_laptop"]);
  });

  it("annule quand même les codes de sécurité des autres appareils quand Clerk ne répond pas, et le dit", async () => {
    state.listFails = true;
    await expect(caller().revokeOtherSessions()).resolves.toEqual({ revoked: 0, notRevoked: 0, securitySessions: 2, clerkUnavailable: true });
    expect(state.otherMfaRevoked).toHaveLength(1);
    expect(state.revoked).toEqual([]);
    const [trace] = memory.rows(securityEvents);
    expect(JSON.parse(String(trace!.metadata))).toEqual({ revoked: 0, notRevoked: 0, securitySessions: 2, clerkUnavailable: true });
    // The list itself sends to Clerk's dashboard.
    await expect(caller().sessions()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: expect.stringContaining("tableau de bord Clerk (Users, puis Sessions)") });
  });

  it("annule les codes de sécurité des autres appareils même quand Clerk ne liste plus que ce navigateur", async () => {
    // The lost device's Clerk session was revoked in Clerk's dashboard, or expired: its code still counts until then.
    state.sessions = [state.sessions[1]!];
    await expect(caller().revokeOtherSessions()).resolves.toEqual({ revoked: 0, notRevoked: 0, securitySessions: 2, clerkUnavailable: false });
    expect(state.otherMfaRevoked).toHaveLength(1);
  });

  it("ne révoque rien sans session Clerk identifiée pour ce navigateur, ni sans double authentification", async () => {
    state.currentSessionId = null;
    await expect(caller().revokeOtherSessions()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    state.currentSessionId = "sess_current";
    await expect(caller({ mfaVerified: false }).revokeOtherSessions()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller({ mfaVerified: false }).sessions()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.listed).toEqual([]);
    expect(state.revoked).toEqual([]);
    expect(state.otherMfaRevoked).toEqual([]);
  });
});
