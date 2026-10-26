import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { listen } from "./testSupport/candidateUploadApp";
import { createInMemoryDrizzle } from "./testSupport/inMemoryDrizzle";

const OWNER_OPEN_ID = "user_owner_route_guard";
const MEMBER_OPEN_ID = "user_member_route_guard";
const IP = "198.51.100.31";

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  // Read once by server/_core/env.ts: the Drive connection can start in the witness case.
  process.env.GOOGLE_DRIVE_CLIENT_ID ||= "drive-client-id-for-route-guard-tests";
  process.env.GOOGLE_DRIVE_CLIENT_SECRET ||= "drive-client-secret-for-route-guard-tests";
  process.env.GOOGLE_DRIVE_CV_FOLDER_ID ||= "drive-folder-for-route-guard-tests";
  process.env.JWT_SECRET ||= "jwt-secret-for-route-guard-tests-0123456789";
  return { db: null as unknown, sentCodes: [] as string[] };
});
process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// The real request context: Clerk says who is signed in (test header), the
// role comes from CLERK_OWNER_USER_ID and the MFA cookie is checked by the real
// adminMfa module against the in-memory database.
vi.mock("./db", () => ({
  getDb: async () => state.db,
  upsertUser: vi.fn(async () => undefined),
  getUserByOpenId: async (openId: string) => {
    const now = new Date();
    return { id: openId === OWNER_OPEN_ID ? 1 : 2, openId, name: "Compte de test", email: `${openId}@example.test`, loginMethod: "clerk", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now };
  },
}));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, unknown> }) => {
    const userId = typeof req.headers["x-test-clerk-user-id"] === "string" ? req.headers["x-test-clerk-user-id"] : null;
    return { isAuthenticated: Boolean(userId), userId };
  },
  clerkClient: {
    users: {
      getUser: vi.fn(async (userId: string) => ({
        firstName: "Compte",
        lastName: "Test",
        primaryEmailAddressId: "email_primary",
        emailAddresses: [{ id: "email_primary", emailAddress: `${userId}@example.test`, verification: { status: "verified" } }],
      })),
    },
  },
}));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendAdminMfaCodeEmail: vi.fn(async (_email: string, code: string) => { state.sentCodes.push(code); }),
}));

const { createApp } = await import("./_core/index");
const { ADMIN_MFA_COOKIE, issueAdminMfaChallenge, verifyAdminMfaChallenge } = await import("./adminMfa");

/** Express routes outside tRPC that act as the administrator. */
const ADMIN_ROUTES = [
  "/api/admin/candidate-documents/1/download",
  "/api/google-drive/oauth/connect",
  "/api/google-drive/oauth/callback?code=google-code&state=google-state",
];

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;
const mfaCookies = new Map<string, string>();

async function completeMfa(openId: string) {
  const req = { protocol: "https", headers: { "x-forwarded-for": IP } };
  let token = "";
  await issueAdminMfaChallenge({ openId, email: `${openId}@example.test`, req });
  await verifyAdminMfaChallenge({ openId, code: state.sentCodes.at(-1)!, req, res: { cookie: (_name: string, value: string) => { token = value; } } });
  return `${ADMIN_MFA_COOKIE}=${token}`;
}

async function get(path: string, as: { userId?: string; cookie?: string }) {
  const headers: Record<string, string> = { "x-forwarded-for": IP };
  if (as.userId) headers["x-test-clerk-user-id"] = as.userId;
  if (as.cookie) headers.cookie = as.cookie;
  const response = await fetch(`${baseUrl}${path}`, { headers, redirect: "manual" });
  return { status: response.status, location: response.headers.get("location"), text: await response.text() };
}

beforeAll(async () => {
  vi.stubEnv("CLERK_OWNER_USER_ID", OWNER_OPEN_ID);
  state.db = createInMemoryDrizzle();
  mfaCookies.set(OWNER_OPEN_ID, await completeMfa(OWNER_OPEN_ID));
  // A valid MFA session left from a time this account was the configured administrator.
  mfaCookies.set(MEMBER_OPEN_ID, await completeMfa(MEMBER_OPEN_ID));
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => {
  await close();
  vi.unstubAllEnvs();
});

describe("routes Express d’administration : réservées à l’administrateur doublement authentifié", () => {
  it.each([
    ["un visiteur", () => ({})],
    ["un compte connecté non administrateur, même avec une session de double authentification encore valide", () => ({ userId: MEMBER_OPEN_ID, cookie: mfaCookies.get(MEMBER_OPEN_ID) })],
    ["l’administrateur sans double authentification", () => ({ userId: OWNER_OPEN_ID })],
  ])("refuse %s sur chaque route d’administration", async (_who, identity) => {
    const notRefused: string[] = [];
    for (const path of ADMIN_ROUTES) {
      const result = await get(path, identity());
      if (result.status !== 403) notRefused.push(`${path} → ${result.status}`);
    }
    expect(notRefused).toEqual([]);
  });

  it("laisse passer l’administrateur qui a validé la double authentification (témoin du parcours)", async () => {
    const verifiedOwner = { userId: OWNER_OPEN_ID, cookie: mfaCookies.get(OWNER_OPEN_ID) };
    expect(await get("/api/admin/candidate-documents/1/download", verifiedOwner)).toMatchObject({ status: 404, text: JSON.stringify({ error: "Document introuvable." }) });
    const connect = await get("/api/google-drive/oauth/connect", verifiedOwner);
    expect(connect.status).toBe(302);
    expect(connect.location).toMatch(/^https:\/\/accounts\.google\.com\//);
  });
});
