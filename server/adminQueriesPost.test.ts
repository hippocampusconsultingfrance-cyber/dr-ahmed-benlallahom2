import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTRPCClient } from "@trpc/client";
import superjson from "superjson";
import { contactMessages } from "../drizzle/schema";
import { createTrpcLinks } from "@/lib/trpcLinks";
import { listen } from "./testSupport/candidateUploadApp";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { AppRouter } from "./routers";

// ADM-02 — the administration's queries reach the real Express application as
// POST (their input in the body, out of the URLs Vercel records), with the
// same protections as before: administrator, double authentication, JSON body.

const OWNER_OPEN_ID = "user_owner_queries_post";
const MEMBER_OPEN_ID = "user_member_queries_post";
const MFA_COOKIE = "admin_mfa_session=valid-test-session";

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { memory: null as null | { db: unknown } };
});

vi.mock("./db", () => ({
  getDb: async () => state.memory?.db ?? null,
  upsertUser: vi.fn(async () => undefined),
  getUserByOpenId: async (openId: string) => {
    const now = new Date();
    return { id: openId === OWNER_OPEN_ID ? 1 : 2, openId, name: "Compte de test", email: `${openId}@example.test`, loginMethod: "clerk", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now };
  },
}));
// Who is signed in comes from a test header; the double authentication from a test cookie.
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, unknown> }) => {
    const userId = typeof req.headers["x-test-clerk-user-id"] === "string" ? req.headers["x-test-clerk-user-id"] : null;
    return { isAuthenticated: Boolean(userId), userId };
  },
  clerkClient: { users: { getUser: vi.fn(async (userId: string) => ({ firstName: "Compte", lastName: "Test", primaryEmailAddressId: "email", emailAddresses: [{ id: "email", emailAddress: `${userId}@example.test`, verification: { status: "verified" } }] })) } },
}));
vi.mock("./adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("./adminMfa")>(),
  isAdminMfaVerified: vi.fn(async (req: { headers: Record<string, unknown> }) => String(req.headers.cookie ?? "").includes(MFA_COOKIE)),
}));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));

const { createApp } = await import("./_core/index");

let memory: MemoryPg;
let baseUrl = "";
let close: () => Promise<void> = async () => undefined;
const realFetch = globalThis.fetch;

const OWNER = { "x-test-clerk-user-id": OWNER_OPEN_ID, cookie: MFA_COOKIE };
const listInput = { search: "François Côté" };
const batchBody = JSON.stringify({ 0: superjson.serialize(listInput) });
const getUrl = `/api/trpc/admin.contacts.list?batch=1&input=${encodeURIComponent(batchBody)}`;

async function call(path: string, init: { method?: string; headers?: Record<string, string>; body?: string | FormData } = {}) {
  const response = await realFetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  return { status: response.status, headers: response.headers, text };
}

const names = (text: string) => (JSON.parse(text) as Array<{ result?: { data: { json: { items: Array<{ name: string }> } } } }>)[0]?.result?.data.json.items.map(item => item.name);

beforeAll(async () => {
  vi.stubEnv("CLERK_OWNER_USER_ID", OWNER_OPEN_ID);
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
beforeEach(() => {
  memory = createMemoryPg([contactMessages]);
  state.memory = memory;
  memory.seed(contactMessages, [
    { tracking_id: "CPOST000001", name: "François Côté", email: "fcote@test.local", message: "Bonjour", read: 0, createdAt: new Date(Date.UTC(2026, 6, 1, 9, 0)) },
    { tracking_id: "CPOST000002", name: "Marie Curie", email: "marie@test.local", message: "Bonjour", read: 0, createdAt: new Date(Date.UTC(2026, 6, 1, 9, 1)) },
  ]);
});
afterAll(async () => {
  await close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ADM-02 — requêtes de l’administration en POST", () => {
  it("répond à la recherche envoyée par le client du site, en POST, sans le terme dans l’URL", async () => {
    const sent: Array<{ url: string; method: string }> = [];
    // The browser would send the Clerk and double authentication cookies: here, the test identity.
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input), method: init?.method ?? "GET" });
      const headers = new Headers(init?.headers);
      for (const [name, value] of Object.entries(OWNER)) headers.set(name, value);
      return realFetch(input, { ...init, headers });
    });
    const client = createTRPCClient<AppRouter>({ links: createTrpcLinks(`${baseUrl}/api/trpc`) });

    const result = await client.admin.contacts.list.query(listInput);

    expect(result.items.map(item => item.name)).toEqual(["François Côté"]);
    expect(result.total).toBe(1);
    expect(sent).toEqual([{ url: `${baseUrl}/api/trpc/admin.contacts.list?batch=1`, method: "POST" }]);
    vi.unstubAllGlobals();
  });

  it("garde les en-têtes de sécurité et refuse un corps qui n’est pas du JSON (formulaire d’un autre site)", async () => {
    const post = await call("/api/trpc/admin.contacts.list?batch=1", { method: "POST", headers: { ...OWNER, "content-type": "application/json" }, body: batchBody });
    expect(post.status).toBe(200);
    expect(names(post.text)).toEqual(["François Côté"]);
    expect(post.headers.get("x-content-type-options")).toBe("nosniff");
    expect(post.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");

    // What a cross-site <form> can send without a CORS preflight: refused before the procedure runs.
    // tRPC alone would run a query sent as multipart/form-data (its type set by fetch, with the boundary).
    const form = () => { const body = new FormData(); body.set("search", "François"); body.set("0", batchBody); return body; };
    const forgeries = [
      { headers: { "content-type": "text/plain" }, body: batchBody },
      { headers: { "content-type": "application/x-www-form-urlencoded" }, body: batchBody },
      { headers: {}, body: form() },
    ];
    for (const { headers, body } of forgeries) {
      const forged = await call("/api/trpc/admin.contacts.list", { method: "POST", headers: { ...OWNER, ...headers }, body });
      expect(forged.status).toBe(415);
      expect(forged.text).not.toContain("François");
      const batched = await call("/api/trpc/admin.contacts.list?batch=1", { method: "POST", headers: { ...OWNER, ...headers }, body: body instanceof FormData ? form() : body });
      expect(batched.status).toBe(415);
      expect(batched.text).not.toContain("François");
    }

    // A mutation sent as multipart/form-data is refused the same way, and changes nothing.
    const markRead = new FormData();
    markRead.set("id", "1");
    const forgedMutation = await call("/api/trpc/admin.contacts.markRead", { method: "POST", headers: OWNER, body: markRead });
    expect(forgedMutation.status).toBe(415);
    expect(memory.rows(contactMessages).every(row => row.read === 0)).toBe(true);
  });

  it("refuse la même requête POST sans administrateur ou sans double authentification", async () => {
    const asVisitor = await call("/api/trpc/admin.contacts.list?batch=1", { method: "POST", headers: { "content-type": "application/json" }, body: batchBody });
    const asMember = await call("/api/trpc/admin.contacts.list?batch=1", { method: "POST", headers: { "x-test-clerk-user-id": MEMBER_OPEN_ID, cookie: MFA_COOKIE, "content-type": "application/json" }, body: batchBody });
    const withoutMfa = await call("/api/trpc/admin.contacts.list?batch=1", { method: "POST", headers: { "x-test-clerk-user-id": OWNER_OPEN_ID, "content-type": "application/json" }, body: batchBody });
    for (const refused of [asVisitor, asMember, withoutMfa]) {
      expect(refused.status).toBe(403);
      expect(refused.text).not.toContain("François");
    }
    expect(withoutMfa.text).toContain("Validation de sécurité administrateur requise");
  });

  it("répond encore à une requête GET (onglet ouvert avant un déploiement), et une mutation reste refusée en GET", async () => {
    const get = await call(getUrl, { headers: OWNER });
    expect(get.status).toBe(200);
    expect(names(get.text)).toEqual(["François Côté"]);

    const mutationAsGet = await call(`/api/trpc/admin.contacts.markRead?input=${encodeURIComponent(JSON.stringify(superjson.serialize({ id: 1 })))}`, { headers: OWNER });
    expect(mutationAsGet.status).toBe(405);
    expect(memory.rows(contactMessages).every(row => row.read === 0)).toBe(true);
  });
});
