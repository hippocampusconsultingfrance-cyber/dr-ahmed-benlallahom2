import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications, recruitmentAuditLogs, recruitmentCampaignRecipients, recruitmentCampaigns, recruitmentFollowUpTasks } from "../../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "../testing/memoryPgProxy";
import { listen } from "../testSupport/candidateUploadApp";
import type { TrpcContext } from "../_core/context";

// RGPD-19: the one-click unsubscribe of the recruitment campaigns (RFC 8058),
// posted by the mail client to the address of the List-Unsubscribe header.

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { memory: null as null | { db: unknown }, sent: [] as Array<{ to: string; headers: Record<string, string> }> };
});

vi.mock("../db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("../adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("../adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("../_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("../_core/notifications")>(),
  sendRecruitmentCampaignBatch: vi.fn(async (emails: Array<{ to: string; headers: Record<string, string> }>) => ({
    ids: emails.map(email => `email-${state.sent.push({ to: email.to, headers: email.headers })}`),
    error: null,
  })),
}));

const { createApp } = await import("../_core/index");
const { appRouter } = await import("../routers");

const TOKEN = "0123456789abcdef0123456789abcdef";
let memory: MemoryPg;
let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => {
  memory = createMemoryPg([cvApplications, recruitmentAuditLogs, recruitmentCampaigns, recruitmentCampaignRecipients, recruitmentFollowUpTasks]);
  state.memory = memory;
  state.sent = [];
});

function seedCandidate(email: string, token: string | null) {
  return memory.seed(cvApplications, [{
    tracking_id: `CV${email.slice(0, 5).toUpperCase()}UNSUB01`, first_name: "Camille", last_name: "Nom", email, specialty: "Anesthésie", target_countries: "[]",
    cv_file_key: "recruitment/cv/k.pdf", cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, marketing_consent: 1, marketing_unsubscribe_token: token,
  }])[0]!;
}

function admin() {
  const ctx: TrpcContext = {
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

/** The one-click POST of a mail client (RFC 8058), as a form or as multipart. */
function oneClick(token: string, multipart = false) {
  const body = multipart ? (() => { const form = new FormData(); form.set("List-Unsubscribe", "One-Click"); return form; })() : new URLSearchParams({ "List-Unsubscribe": "One-Click" });
  return fetch(`${baseUrl}/api/recruitment/unsubscribe?token=${token}`, { method: "POST", body, redirect: "manual" });
}

describe("désinscription en un clic des campagnes de recrutement (RGPD-19)", () => {
  it("désinscrit sans connexion le candidat du jeton, une seule fois, et le journalise à chaque fois", async () => {
    seedCandidate("camille@test.local", TOKEN);
    const response = await oneClick(TOKEN);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, alreadyUnsubscribed: false });
    const [candidate] = memory.rows(cvApplications);
    expect(candidate).toMatchObject({ marketing_consent: 0, marketing_unsubscribed_at: expect.any(String) });
    const unsubscribedAt = candidate!.marketing_unsubscribed_at;

    // The client may post again (multipart, as RFC 8058 prefers): already done, the date kept.
    const again = await oneClick(TOKEN, true);
    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toEqual({ success: true, alreadyUnsubscribed: true });
    expect(memory.rows(cvApplications)[0]!.marketing_unsubscribed_at).toBe(unsubscribedAt);
    expect(memory.rows(recruitmentAuditLogs).map(row => [row.action, row.admin_open_id, JSON.parse(String(row.metadata))])).toEqual([
      ["unsubscribe", "public:unsubscribe", { source: "list_unsubscribe_one_click", alreadyUnsubscribed: false }],
      ["unsubscribe", "public:unsubscribe", { source: "list_unsubscribe_one_click", alreadyUnsubscribed: true }],
    ]);
  });

  it("refuse un jeton inconnu ou mal formé sans rien changer", async () => {
    seedCandidate("camille@test.local", TOKEN);
    expect((await oneClick("f".repeat(32))).status).toBe(404);
    expect((await oneClick("court")).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/recruitment/unsubscribe`, { method: "POST" })).status).toBe(400);
    expect(memory.rows(cvApplications)[0]).toMatchObject({ marketing_consent: 1, marketing_unsubscribed_at: null });
    expect(memory.rows(recruitmentAuditLogs)).toEqual([]);
  });

  it("une simple visite de l’adresse (GET, analyseur de liens) ne désinscrit personne : elle mène à la page de confirmation", async () => {
    seedCandidate("camille@test.local", TOKEN);
    const response = await fetch(`${baseUrl}/api/recruitment/unsubscribe?token=${TOKEN}`, { redirect: "manual" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://drahmedbenlallahom.com/recruitment/unsubscribe?token=${TOKEN}`);
    expect(memory.rows(cvApplications)[0]).toMatchObject({ marketing_consent: 1, marketing_unsubscribed_at: null });
  });

  it("l’en-tête List-Unsubscribe d’un email de campagne désinscrit son destinataire en un clic, et la campagne suivante ne lui est pas envoyée", async () => {
    seedCandidate("camille@test.local", null);
    seedCandidate("zoe@test.local", null);
    const campaign = { title: "Mission à Genève", subject: "Offre Suisse", body: "Une mission à Genève, répondez par email.", language: "fr" as const, mode: "all_eligible" as const, confirmed: true as const };
    await admin().admin.recruitment.campaigns.send(campaign);
    const camille = state.sent.find(email => email.to === "camille@test.local")!;
    expect(camille.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const address = /^<(https:\/\/drahmedbenlallahom\.com(\/api\/recruitment\/unsubscribe\?token=[0-9a-f]{32}))>$/.exec(camille.headers["List-Unsubscribe"]!)![2]!;

    const response = await fetch(`${baseUrl}${address}`, { method: "POST", body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }) });
    expect(response.status).toBe(200);
    state.sent = [];
    await admin().admin.recruitment.campaigns.send({ ...campaign, title: "Mission à Lausanne" });
    expect(state.sent.map(email => email.to)).toEqual(["zoe@test.local"]);
  });
});
