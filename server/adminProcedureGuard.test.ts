import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { createInMemoryDrizzle } from "./testSupport/inMemoryDrizzle";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const state = vi.hoisted(() => ({ db: null as unknown, sentCodes: [] as string[] }));

// The real adminMfa module checks the MFA cookie against the in-memory database.
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendAdminMfaCodeEmail: vi.fn(async (_email: string, code: string) => { state.sentCodes.push(code); }),
}));

const { appRouter } = await import("./routers");
const { ADMIN_MFA_COOKIE, issueAdminMfaChallenge, verifyAdminMfaChallenge } = await import("./adminMfa");

/**
 * Procedures open to visitors (public site, booking, candidate portal with its
 * own session) or to any signed-in account (the MFA flow itself, which checks
 * the role in its handler). Every other procedure of the router is treated as
 * administrative: a new procedure is refused to everyone but a verified
 * administrator, or listed here on purpose.
 */
const NON_ADMIN_PROCEDURES = new Set([
  "system.health",
  "auth.me",
  "auth.logout",
  "adminSecurity.status",
  "adminSecurity.begin",
  "adminSecurity.verify",
  "contact.submit",
  "gdpr.submit",
  "testimonials.list",
  "blog.list",
  "blog.getBySlug",
  "appointments.calculatePrice",
  "appointments.create",
  "appointments.createCheckoutSession",
  "appointments.publicStatus",
  "appointments.cancelPending",
  "availability.getSlots",
  "availability.getBlockedDates",
  "availability.getBookedSlots",
  "recruitmentPreferences.unsubscribe",
  "medicalQuestions.submit",
  "medicalQuestions.published",
  "candidatePortal.register",
  "candidatePortal.resendVerification",
  "candidatePortal.resolveInvitation",
  "candidatePortal.activationDetails",
  "candidatePortal.verifyEmail",
  "candidatePortal.login",
  "candidatePortal.logout",
  "candidatePortal.requestPasswordReset",
  "candidatePortal.resetPassword",
  "candidatePortal.me",
  "candidatePortal.sessions",
  "candidatePortal.revokeSession",
  "candidatePortal.revokeAllSessions",
  "candidatePortal.documents",
]);

const procedurePaths = Object.keys(appRouter._def.procedures);
const adminPaths = procedurePaths.filter(path => !NON_ADMIN_PROCEDURES.has(path));

const OWNER_OPEN_ID = "user_owner_admin_guard";
const MEMBER_OPEN_ID = "user_member_admin_guard";
const IP = "198.51.100.30";

function account(openId: string, role: "admin" | "user"): NonNullable<TrpcContext["user"]> {
  const now = new Date();
  return { id: role === "admin" ? 1 : 2, openId, name: "Compte de test", email: `${openId}@example.test`, loginMethod: "clerk", role, createdAt: now, updatedAt: now, lastSignedIn: now };
}

function context(user: TrpcContext["user"], cookie?: string, onCookie?: (name: string, value: string) => void): TrpcContext {
  const headers: Record<string, string> = { "x-forwarded-for": IP, "user-agent": "vitest" };
  if (cookie) headers.cookie = cookie;
  return {
    user,
    mfaVerified: false,
    req: { protocol: "https", ip: IP, headers } as unknown as TrpcContext["req"],
    res: { cookie: onCookie ?? vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

/** Calls a procedure by its path with an empty input: access control runs before input validation. */
async function callWithoutInput(ctx: TrpcContext, path: string) {
  const procedure = path.split(".").reduce<any>((node, key) => node[key], appRouter.createCaller(ctx));
  try {
    await procedure(undefined);
    return "accepted";
  } catch (error) {
    if (error instanceof TRPCError && (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")) return "refused";
    return error instanceof TRPCError ? error.code : error instanceof Error ? error.name : "UnknownError";
  }
}

let ownerMfaCookie = "";
let memberMfaCookie = "";

beforeAll(async () => {
  state.db = createInMemoryDrizzle();
  // No outside service is reached from this file, even if a guard were missing.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in the admin guard test"); }));

  // The administrator obtains the MFA cookie through the real flow of the admin page.
  let ownerToken = "";
  const owner = account(OWNER_OPEN_ID, "admin");
  await appRouter.createCaller(context(owner)).adminSecurity.begin();
  await appRouter.createCaller(context(owner, undefined, (name, value) => { if (name === ADMIN_MFA_COOKIE) ownerToken = value; })).adminSecurity.verify({ code: state.sentCodes.at(-1)! });
  ownerMfaCookie = `${ADMIN_MFA_COOKIE}=${ownerToken}`;

  // A valid MFA session left from a time this account was the configured administrator.
  const req = { protocol: "https", headers: { "x-forwarded-for": IP } };
  let memberToken = "";
  await issueAdminMfaChallenge({ openId: MEMBER_OPEN_ID, email: `${MEMBER_OPEN_ID}@example.test`, req });
  await verifyAdminMfaChallenge({ openId: MEMBER_OPEN_ID, code: state.sentCodes.at(-1)!, req, res: { cookie: (_name: string, value: string) => { memberToken = value; } } });
  memberMfaCookie = `${ADMIN_MFA_COOKIE}=${memberToken}`;
});
afterAll(() => { vi.unstubAllGlobals(); });

describe("procédures d’administration tRPC : réservées à l’administrateur doublement authentifié", () => {
  it("parcourt toutes les procédures du routeur, la liste des procédures publiques ne nommant que des procédures existantes", () => {
    expect([...NON_ADMIN_PROCEDURES].filter(path => !procedurePaths.includes(path))).toEqual([]);
    expect(adminPaths).toEqual(expect.arrayContaining([
      "system.notifyOwner",
      "testimonials.create",
      "medicalQuestions.admin.sendValidatedResponse",
      "adminSecurity.events",
      "admin.appointments.refund",
      "admin.recruitment.erase",
      "admin.candidateDocuments.download",
    ]));
  });

  it.each([
    ["un visiteur", () => context(null)],
    ["un compte connecté non administrateur, même avec une session de double authentification encore valide", () => context(account(MEMBER_OPEN_ID, "user"), memberMfaCookie)],
    ["l’administrateur sans double authentification", () => context(account(OWNER_OPEN_ID, "admin"))],
  ])("refuse %s sur chaque procédure d’administration", async (_who, makeContext) => {
    const notRefused: string[] = [];
    for (const path of adminPaths) {
      const outcome = await callWithoutInput(makeContext(), path);
      if (outcome !== "refused") notRefused.push(`${path} → ${outcome}`);
    }
    expect(notRefused).toEqual([]);
  });

  it("laisse passer l’administrateur qui a validé la double authentification (témoin du parcours)", async () => {
    const verifiedOwner = () => context(account(OWNER_OPEN_ID, "admin"), ownerMfaCookie);
    await expect(appRouter.createCaller(verifiedOwner()).system.configurationStatus()).resolves.toMatchObject({ ok: expect.any(Boolean) });
    // Past the guard, an empty input is refused by validation, not by access control.
    expect(await callWithoutInput(verifiedOwner(), "admin.appointments.refund")).toBe("BAD_REQUEST");
  });
});
