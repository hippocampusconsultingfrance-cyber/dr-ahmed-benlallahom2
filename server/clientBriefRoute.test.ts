import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "./testSupport/candidateUploadApp";

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { insertedParams: [] as unknown[][], notifications: [] as Array<{ title: string; content: string }> };
});

// The route inserts with db.execute(sql`...`): keep the bound values to check what would be stored.
vi.mock("./db", async () => {
  const { PgDialect: Dialect } = await import("drizzle-orm/pg-core");
  const dialect = new Dialect();
  return {
    getDb: async () => ({
      execute: async (query: SQL) => {
        state.insertedParams.push(dialect.sqlToQuery(query).params);
        return { rows: [] };
      },
    }),
  };
});
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  enforcePersistentRateLimit: vi.fn(async () => undefined),
}));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async (notification: { title: string; content: string }) => {
    state.notifications.push(notification);
    return true;
  }),
}));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));

const { createApp } = await import("./_core/index");

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const app = await createApp();
  const listening = await listen(app as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => {
  state.insertedParams.length = 0;
  state.notifications.length = 0;
});

const brief = {
  organizationName: "Clinique Saint-Étienne",
  contactName: "Zoé Müller",
  email: "zoe.muller@example.test",
  targetEnvironment: "Bloc opératoire",
  specialtyNeeded: "Anesthésie-réanimation",
  country: "Côte d’Ivoire",
  notes: "Prise de poste « dès que possible » — 日本語 inclus.",
};

async function postBrief(body: string, contentType: string) {
  const response = await fetch(`${baseUrl}/api/client-briefs`, { method: "POST", headers: { "content-type": contentType }, body });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { json = { raw: text }; }
  return { status: response.status, body: json };
}

describe("POST /api/client-briefs — lecture des corps JSON et formulaire (body-parser, qs)", () => {
  it("enregistre un brief envoyé en JSON sans altérer les caractères accentués", async () => {
    const result = await postBrief(JSON.stringify(brief), "application/json; charset=utf-8");
    expect(result).toEqual({ status: 200, body: { success: true, briefId: expect.stringMatching(/^BRIEF/) } });
    expect(state.insertedParams).toHaveLength(1);
    expect(state.insertedParams[0]).toEqual(expect.arrayContaining(Object.values(brief)));
    expect(state.notifications).toEqual([expect.objectContaining({ title: expect.stringContaining("Clinique Saint-Étienne") })]);
    expect(state.notifications[0].content).toContain("Contact : Zoé Müller");
  });

  it("accepte le même brief envoyé en formulaire urlencoded", async () => {
    const result = await postBrief(new URLSearchParams(brief).toString(), "application/x-www-form-urlencoded");
    expect(result).toEqual({ status: 200, body: { success: true, briefId: expect.stringMatching(/^BRIEF/) } });
    expect(state.insertedParams[0]).toEqual(expect.arrayContaining(Object.values(brief)));
  });

  it("refuse un JSON mal formé et un corps de plus de 1 Mo sans rien enregistrer", async () => {
    expect((await postBrief("{\"organizationName\": ", "application/json")).status).toBe(400);
    const oversized = JSON.stringify({ ...brief, notes: "é".repeat(600 * 1024) });
    expect(Buffer.byteLength(oversized)).toBeGreaterThan(1024 * 1024);
    expect((await postBrief(oversized, "application/json")).status).toBe(413);
    const oversizedForm = new URLSearchParams({ ...brief, notes: "é".repeat(600 * 1024) }).toString();
    expect(Buffer.byteLength(oversizedForm)).toBeGreaterThan(1024 * 1024);
    expect((await postBrief(oversizedForm, "application/x-www-form-urlencoded")).status).toBe(413);
    expect(state.insertedParams).toEqual([]);
    expect(state.notifications).toEqual([]);
  });
});
