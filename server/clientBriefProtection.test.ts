import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { securityEvents } from "../drizzle/schema";
import { secureReference } from "./_core/secureReference";
import { serveStatic } from "./_core/static";
import { renderSitemapXml } from "./routeSeo";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { listen } from "./testSupport/candidateUploadApp";

// Formulaire employeur /api/client-briefs par la vraie route Express : limites
// persistantes par connexion et par email avant tout enregistrement, pot de
// miel, références imprévisibles ; et un seul sitemap, celui du build.

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { db: null as unknown, inserted: [] as unknown[][], notifications: 0 };
});

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => { state.notifications += 1; return true; }) }));
// The form has no anti-bot widget: a token check would refuse every brief.
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => { throw new Error("candidate_turnstile_invalid"); }) }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));

const { createApp } = await import("./_core/index");
const { verifyCandidateTurnstile } = await import("./candidateTurnstile");

const dialect = new PgDialect();
const HOUR_MS = 60 * 60 * 1000;
const RATE_LIMITED = { error: "Trop de demandes ont été envoyées. Veuillez patienter avant de soumettre un nouveau brief." };

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => {
  state.inserted = [];
  state.notifications = 0;
  // The brief itself is written with a raw INSERT: keep its bound values, the rate limits use the in-memory tables.
  state.db = Object.assign(createInMemoryDrizzle(), {
    execute: async (query: SQL) => {
      state.inserted.push(dialect.sqlToQuery(query).params);
      return { rows: [] };
    },
  });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const brief = (email: string) => ({
  organizationName: "Clinique Saint-Étienne",
  contactName: "Zoé Müller",
  email,
  targetEnvironment: "Bloc opératoire",
  specialtyNeeded: "Anesthésie-réanimation",
  country: "France",
});

async function postBrief(body: Record<string, string>, ip: string) {
  const response = await fetch(`${baseUrl}/api/client-briefs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("formulaire employeur /api/client-briefs", () => {
  it("limite à 5 briefs par heure et par connexion, avec une réponse 429 en français, avant tout enregistrement", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T08:00:00.000Z"));
    for (let index = 1; index <= 5; index += 1) {
      expect((await postBrief(brief(`rh${index}@clinique.test`), "198.51.100.81")).status, `brief ${index}`).toBe(200);
    }

    expect(await postBrief(brief("rh6@clinique.test"), "198.51.100.81")).toEqual({ status: 429, body: RATE_LIMITED });
    expect(state.inserted).toHaveLength(5);
    expect(state.notifications).toBe(5);
    expect(db().rows(securityEvents).map(event => event.category)).toEqual(["public_client_brief_rate_limited"]);
    // Another connection is not concerned; the blocked one waits an hour.
    expect((await postBrief(brief("rh7@clinique.test"), "198.51.100.82")).status).toBe(200);
    vi.setSystemTime(Date.now() + HOUR_MS - 1000);
    expect((await postBrief(brief("rh8@clinique.test"), "198.51.100.81")).status).toBe(429);
    vi.setSystemTime(Date.now() + 1000);
    expect((await postBrief(brief("rh9@clinique.test"), "198.51.100.81")).status).toBe(200);
  });

  it("limite à 10 briefs par jour pour une même adresse, d’où qu’ils viennent, pendant 24 h", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T08:00:00.000Z"));
    for (let index = 1; index <= 10; index += 1) {
      // Spread over the day and over many connections: only the address is counted.
      if (index === 6) vi.setSystemTime(Date.now() + 23 * HOUR_MS);
      expect((await postBrief(brief("rh@clinique.test"), `198.51.100.${100 + index}`)).status, `brief ${index}`).toBe(200);
    }

    expect(await postBrief(brief("rh@clinique.test"), "198.51.100.120")).toEqual({ status: 429, body: RATE_LIMITED });
    expect(state.inserted).toHaveLength(10);
    vi.setSystemTime(Date.now() + 24 * HOUR_MS - 1000);
    expect((await postBrief(brief("rh@clinique.test"), "198.51.100.121")).status).toBe(429);
    vi.setSystemTime(Date.now() + 1000);
    expect((await postBrief(brief("rh@clinique.test"), "198.51.100.122")).status).toBe(200);
  });

  it("garde le pot de miel et n’impose pas Turnstile au formulaire", async () => {
    expect(await postBrief({ ...brief("robot@spam.test"), website: "https://spam.test" }, "198.51.100.83")).toEqual({ status: 400, body: { error: "Requête non autorisée." } });
    expect(state.inserted).toEqual([]);
    expect(state.notifications).toBe(0);

    expect((await postBrief(brief("rh@clinique.test"), "198.51.100.84")).status).toBe(200);
    expect(verifyCandidateTurnstile).not.toHaveBeenCalled();
  });

  it("génère des références imprévisibles au lieu de Math.random()", async () => {
    const random = vi.spyOn(Math, "random");
    const response = await postBrief(brief("rh@clinique.test"), "198.51.100.85");

    expect(response.body).toEqual({ success: true, briefId: expect.stringMatching(/^BRIEF[A-HJ-NP-Z2-9]{12}$/) });
    expect(state.inserted[0]?.[0]).toBe(response.body.briefId);
    expect(random).not.toHaveBeenCalled();
  });
});

function db() { return state.db as InMemoryDrizzle; }

describe("références publiques aléatoires", () => {
  it("respecte le préfixe, la longueur des colonnes (20) et le format accepté par Resend", () => {
    const briefReference = secureReference("BRIEF", 12);
    const cv = secureReference("CV", 16);
    expect(briefReference).toMatch(/^BRIEF[A-HJ-NP-Z2-9]{12}$/);
    expect(cv).toMatch(/^CV[A-HJ-NP-Z2-9]{16}$/);
    expect(briefReference.length).toBeLessThanOrEqual(20);
    expect(cv.length).toBeLessThanOrEqual(20);
    expect(cv).toMatch(/^[A-Za-z0-9_-]{3,64}$/);
  });

  it("ne produit pas de collision sur un large échantillon", () => {
    const references = new Set(Array.from({ length: 5_000 }, () => secureReference("CV", 16)));
    expect(references.size).toBe(5_000);
  });
});

describe("sitemap unique", () => {
  it("ne génère plus de sitemap divergent côté Express", async () => {
    const response = await fetch(`${baseUrl}/sitemap.xml`);
    expect(response.status).toBe(404);
    expect(renderSitemapXml("2026-10-16")).toContain("<urlset");
    expect(renderSitemapXml("2026-10-16")).not.toContain("/venture/novarena");
  });

  it("sert tel quel le sitemap.xml généré au build dans dist/public", async () => {
    const distPath = await mkdtemp(path.join(os.tmpdir(), "sitemap-dist-"));
    const generated = renderSitemapXml("2026-10-16");
    await writeFile(path.join(distPath, "sitemap.xml"), generated, "utf8");
    const app = express();
    serveStatic(app, distPath);
    const served = await listen(app as never);
    try {
      const response = await fetch(`${served.baseUrl}/sitemap.xml`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(generated);
    } finally {
      await new Promise(resolve => served.server.close(resolve));
      await rm(distPath, { recursive: true, force: true });
    }
  });
});
