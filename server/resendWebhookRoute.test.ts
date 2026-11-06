import { Webhook } from "svix";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications, recruitmentAuditLogs, recruitmentCampaignRecipients, recruitmentCampaigns, recruitmentEmailEvents, recruitmentFollowUpTasks } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import { listen } from "./testSupport/candidateUploadApp";
import type { TrpcContext } from "./_core/context";

// A Svix signing secret: "whsec_" followed by base64.
const WEBHOOK_SECRET = `whsec_${Buffer.from("resend-webhook-route-test-secret").toString("base64")}`;

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { memory: null as null | { db: unknown }, sentTo: [] as string[] };
});
// Read by the route on each request.
process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendRecruitmentCampaignEmail: vi.fn(async (input: { candidateEmail: string }) => {
    state.sentTo.push(input.candidateEmail);
    return { id: `email-${state.sentTo.length}` };
  }),
}));

const { createApp } = await import("./_core/index");
const { appRouter } = await import("./routers");

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
  memory = createMemoryPg([cvApplications, recruitmentAuditLogs, recruitmentCampaigns, recruitmentCampaignRecipients, recruitmentEmailEvents, recruitmentFollowUpTasks]);
  state.memory = memory;
  state.sentTo = [];
  vi.restoreAllMocks();
});

function admin() {
  const ctx: TrpcContext = {
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

function seedCandidate(email: string, extra: Record<string, unknown> = {}) {
  return memory.seed(cvApplications, [{
    tracking_id: `CV${email.slice(0, 4).toUpperCase()}WEBHOOK01`, first_name: "Prénom", last_name: "Nom", email, specialty: "Anesthésie", target_countries: "[]",
    cv_file_key: "recruitment/cv/k.pdf", cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, marketing_consent: 1, ...extra,
  }])[0]!;
}

const campaign = { title: "Opportunite Montreal", subject: "Offre Montréal", body: "Une mission à Montréal, répondez par email.", language: "fr" as const, mode: "all_eligible" as const, confirmed: true as const };

/** A signed delivery of Resend's webhook, as Svix sends it (and sends again after an error). */
async function deliver(id: string, event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const sentAt = new Date();
  const response = await fetch(`${baseUrl}/api/webhooks/resend`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(sentAt.getTime() / 1000)),
      "svix-signature": new Webhook(WEBHOOK_SECRET).sign(id, sentAt, payload),
    },
    body: payload,
  });
  const text = await response.text();
  return { status: response.status, body: response.headers.get("content-type")?.includes("json") ? JSON.parse(text) as unknown : text };
}

describe("POST /api/webhooks/resend — effets et enregistrement de l’évènement ensemble (DATA-04)", () => {
  it("une plainte dont la désinscription échoue n’est pas enregistrée : sa nouvelle livraison désinscrit, et la campagne suivante ne part plus à cette adresse", async () => {
    seedCandidate("race@test.local");
    await admin().admin.recruitment.campaigns.send(campaign);
    expect(state.sentTo).toEqual(["race@test.local"]);
    const complaint = { type: "email.complained", created_at: "2026-10-24T10:00:00.000Z", data: { email_id: "email-1", to: ["race@test.local"] } };

    // The withdrawal of the marketing consent is refused, as by a trigger.
    memory.failNext(/^update "cv_applications" set "marketing_consent"/);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await deliver("msg_integ_complaint_1", complaint)).toEqual({ status: 400, body: "Invalid Resend webhook" });
    // Nothing is left half done: no event recorded, the recipient as it was.
    expect(memory.rows(recruitmentEmailEvents)).toEqual([]);
    expect(memory.rows(recruitmentCampaignRecipients)[0]).toMatchObject({ delivery_status: "sent", last_event_at: expect.any(String) });
    expect(memory.rows(cvApplications)[0]).toMatchObject({ marketing_consent: 1, marketing_suppressed_at: null });

    // Resend delivers the same message again after the error.
    expect(await deliver("msg_integ_complaint_1", complaint)).toEqual({ status: 200, body: { received: true } });
    expect(memory.rows(recruitmentCampaignRecipients)[0]).toMatchObject({ delivery_status: "complained", last_event_at: "2026-10-24 10:00:00.000" });
    expect(memory.rows(cvApplications)[0]).toMatchObject({ marketing_consent: 0, marketing_suppressed_at: "2026-10-24 10:00:00.000" });
    expect(memory.rows(recruitmentEmailEvents)).toMatchObject([{ provider_event_id: "msg_integ_complaint_1", event_type: "email.complained", application_id: memory.rows(cvApplications)[0]!.id }]);
    expect(await deliver("msg_integ_complaint_1", complaint)).toEqual({ status: 200, body: { received: true, duplicate: true } });

    seedCandidate("autre@test.local");
    await admin().admin.recruitment.campaigns.send({ ...campaign, title: "Opportunite Québec" });
    expect(state.sentTo).toEqual(["race@test.local", "autre@test.local"]);
  });

  it("un rebond enregistré avant ses effets (version précédente) désinscrit à sa nouvelle livraison au lieu d’être un doublon", async () => {
    const candidate = seedCandidate("rebond@test.local");
    const [recipient] = memory.seed(recruitmentCampaignRecipients, [{ campaign_id: 1, application_id: candidate.id, recipient_email: "rebond@test.local", delivery_status: "sent", provider_email_id: "email-legacy", last_event_at: "2026-10-23 08:00:00.000" }]);
    memory.seed(recruitmentEmailEvents, [{ provider_event_id: "msg_legacy_bounce", provider_email_id: "email-legacy", campaign_recipient_id: recipient!.id, application_id: candidate.id, event_type: "email.bounced", occurred_at: "2026-10-23 09:00:00.000" }]);
    const bounce = { type: "email.bounced", created_at: "2026-10-23T09:00:00.000Z", data: { email_id: "email-legacy", to: ["rebond@test.local"], bounce: { message: "Mailbox does not exist" } } };

    expect(await deliver("msg_legacy_bounce", bounce)).toEqual({ status: 200, body: { received: true } });
    expect(memory.rows(cvApplications)[0]).toMatchObject({ marketing_consent: 0, marketing_suppressed_at: "2026-10-23 09:00:00.000" });
    expect(recipient).toMatchObject({ delivery_status: "bounced", error: "Mailbox does not exist", last_event_at: "2026-10-23 09:00:00.000" });
    expect(memory.rows(recruitmentEmailEvents)).toHaveLength(1);
    // Applied once: the next delivery is a duplicate.
    expect(await deliver("msg_legacy_bounce", bounce)).toEqual({ status: 200, body: { received: true, duplicate: true } });

    // A recorded delivery report stays a duplicate, and never overwrites a later status.
    memory.seed(recruitmentEmailEvents, [{ provider_event_id: "msg_legacy_delivered", provider_email_id: "email-legacy", campaign_recipient_id: recipient!.id, application_id: candidate.id, event_type: "email.delivered", occurred_at: "2026-10-23 08:30:00.000" }]);
    expect(await deliver("msg_legacy_delivered", { type: "email.delivered", created_at: "2026-10-23T08:30:00.000Z", data: { email_id: "email-legacy", to: ["rebond@test.local"] } }))
      .toEqual({ status: 200, body: { received: true, duplicate: true } });
    expect(recipient).toMatchObject({ delivery_status: "bounced" });
  });

  it("rattache à la candidature l’évènement d’une confirmation étiquetée, si le destinataire est bien le candidat, puis son rebond désinscrit", async () => {
    const candidate = seedCandidate("etiquette@test.local", { tracking_id: "CVTAGGED00000001" });
    const tags = { email_kind: "application_confirmation", application_ref: "CVTAGGED00000001" };
    expect(await deliver("msg_other_recipient", { type: "email.delivered", created_at: "2026-10-24T08:00:00.000Z", data: { email_id: "email-confirmation-2", to: ["quelquun@test.local"], tags } }))
      .toEqual({ status: 200, body: { received: true } });
    expect(await deliver("msg_tagged_delivered", { type: "email.delivered", created_at: "2026-10-24T08:00:00.000Z", data: { email_id: "email-confirmation", to: ["Etiquette@test.local"], tags } }))
      .toEqual({ status: 200, body: { received: true } });
    expect(memory.rows(recruitmentEmailEvents).map(row => [row.provider_event_id, row.application_id])).toEqual([["msg_other_recipient", null], ["msg_tagged_delivered", candidate.id]]);

    // The bounce of the same email carries no tag: the recorded event links it.
    expect(await deliver("msg_tagged_bounce", { type: "email.bounced", created_at: "2026-10-24T08:05:00.000Z", data: { email_id: "email-confirmation", to: ["etiquette@test.local"] } }))
      .toEqual({ status: 200, body: { received: true } });
    expect(memory.rows(cvApplications)[0]).toMatchObject({ marketing_consent: 0, marketing_suppressed_at: "2026-10-24 08:05:00.000" });
  });
});
