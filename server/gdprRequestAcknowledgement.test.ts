import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gdprRequests, securityEvents } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import { createTestContext } from "./testSupport/trpcContext";

// RGPD-13 — le demandeur reçoit un accusé de réception (référence, délai d’un
// mois, lien qui confirme son adresse, une seule fois) ; l’email au
// propriétaire ne recopie plus la description et mène à l’administration.

type SentEmail = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo: string;
};
const state = vi.hoisted(() => ({
  db: null as unknown,
  sent: [] as SentEmail[],
  owner: [] as Array<{ title: string; content: string }>,
}));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async (payload: { title: string; content: string }) => {
    state.owner.push(payload);
    return true;
  }),
  getResendClient: () => ({
    emails: {
      send: vi.fn(async (message: SentEmail) => {
        state.sent.push(message);
        return { data: { id: `email_${state.sent.length}` }, error: null };
      }),
    },
  }),
}));
vi.mock("./candidateTurnstile", () => ({
  verifyCandidateTurnstile: vi.fn(async () => undefined),
}));
vi.mock("./adminMfa", async importOriginal => ({
  ...(await importOriginal<typeof import("./adminMfa")>()),
  isAdminMfaVerified: vi.fn(async () => true),
}));
vi.mock("./publicFormRateLimit", async importOriginal => ({
  ...(await importOriginal<typeof import("./publicFormRateLimit")>()),
  enforcePublicEmailIpRateLimit: vi.fn(async () => undefined),
  countPublicFormDailyVolume: vi.fn(async () => true),
}));

const { appRouter } = await import("./routers");
const { createGdprConfirmationToken, GDPR_REQUEST_EMAIL_CONFIRMED } =
  await import("./routers/gdpr");
const { countPublicFormDailyVolume } = await import("./publicFormRateLimit");

const dialect = new PgDialect();
let memory: MemoryPg;

/** The request is written by a raw INSERT, which the stand-in does not parse: its values are stored as the database would. */
function databaseWithRawInsert() {
  memory = createMemoryPg([gdprRequests, securityEvents]);
  return Object.assign(memory.db, {
    execute: async (query: SQL) => {
      const [trackingId, name, email, phone, requestType, description, status] =
        dialect.sqlToQuery(query).params;
      memory.seed(gdprRequests, [
        {
          tracking_id: trackingId,
          name,
          email,
          phone,
          request_type: requestType,
          description,
          status,
        },
      ]);
      return { rows: [], rowCount: 1 };
    },
  });
}

const caller = () =>
  appRouter.createCaller(
    createTestContext({
      req: { headers: { "x-forwarded-for": "198.51.100.90" } },
    })
  );
const request = (overrides: Record<string, unknown> = {}) => ({
  name: "Jeanne Martin",
  email: "jeanne.martin@test.local",
  requestType: "deletion" as const,
  description:
    "Suite à ma hernie discale, je souhaite l’effacement de mon dossier.",
  turnstileToken: "turnstile-token-accepted-by-the-mock",
  ...overrides,
});
/** The confirmation link of the email, as the person clicks it. */
const linkOf = (email: SentEmail) =>
  new URL(/href="([^"]+)"/.exec(email.html)![1]!.replaceAll("&amp;", "&"));

beforeEach(() => {
  state.db = databaseWithRawInsert();
  state.sent = [];
  state.owner = [];
});

describe("accusé de réception d’une demande RGPD (RGPD-13)", () => {
  it("envoie au demandeur la référence, le délai d’un mois et un lien de confirmation, sans recopier la description", async () => {
    const { trackingId } = await caller().gdpr.submit(request());

    expect(state.sent).toHaveLength(1);
    const [acknowledgement] = state.sent;
    expect(acknowledgement!.to).toEqual(["jeanne.martin@test.local"]);
    expect(acknowledgement!.subject).toBe(
      `Votre demande RGPD a bien été reçue — ${trackingId}`
    );
    expect(acknowledgement!.text).toContain(`Référence : ${trackingId}`);
    expect(acknowledgement!.text).toContain(
      "Nous vous répondrons dans un délai d’un mois après sa réception."
    );
    for (const body of [acknowledgement!.text, acknowledgement!.html]) {
      expect(body).not.toContain("hernie");
      expect(body).not.toContain("Jeanne");
    }
    const link = linkOf(acknowledgement!);
    expect(`${link.origin}${link.pathname}`).toBe(
      "https://drahmedbenlallahom.com/gdpr"
    );
    expect(link.searchParams.get("lang")).toBeNull();
    expect(acknowledgement!.text).toContain(link.toString());
  });

  it("écrit en anglais à un demandeur venu d’une page anglaise, et le lien rouvre la page en anglais", async () => {
    const { trackingId } = await caller().gdpr.submit(
      request({ language: "en", requestType: "restriction" })
    );
    expect(state.sent[0]!.subject).toBe(
      `Your GDPR request has been received — ${trackingId}`
    );
    expect(state.sent[0]!.text).toContain(
      "We will answer within one month of its receipt."
    );
    expect(linkOf(state.sent[0]!).searchParams.get("lang")).toBe("en");
    expect(memory.rows(gdprRequests)[0]).toMatchObject({
      tracking_id: trackingId,
      request_type: "restriction",
    });
  });

  it("accepte la limitation et le retrait du consentement, et refuse un type inconnu", async () => {
    await expect(
      caller().gdpr.submit(request({ requestType: "consent_withdrawal" }))
    ).resolves.toMatchObject({ success: true });
    await expect(
      caller().gdpr.submit(request({ requestType: "unsubscribe" as never }))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(memory.rows(gdprRequests).map(row => row.request_type)).toEqual([
      "consent_withdrawal",
    ]);
  });

  it("n’écrit plus la description au propriétaire et le mène à la demande dans l’administration", async () => {
    const { trackingId } = await caller().gdpr.submit(request());
    const [notification] = state.owner;
    expect(notification!.content).not.toContain("hernie");
    expect(notification!.content).toContain(
      "**Description:** à lire dans l’administration"
    );
    expect(notification!.content).toContain(
      `https://drahmedbenlallahom.com/admin?tab=gdpr&ref=${trackingId}`
    );
    expect(notification!.content).toContain("**Accusé de réception:** envoyé");
    expect(memory.rows(gdprRequests)[0]!.description).toContain("hernie");
  });

  it("au-delà du volume du jour, garde la demande sans accusé ni email au propriétaire (ABUS-01)", async () => {
    vi.mocked(countPublicFormDailyVolume).mockResolvedValueOnce(false);
    await caller().gdpr.submit(request());
    expect(memory.rows(gdprRequests)).toHaveLength(1);
    expect(state.sent).toHaveLength(0);
    expect(state.owner).toHaveLength(0);
  });
});

describe("lien de confirmation de l’adresse (RGPD-13)", () => {
  it("confirme l’adresse une seule fois, et l’administration le voit", async () => {
    const { trackingId } = await caller().gdpr.submit(request());
    const token = linkOf(state.sent[0]!).searchParams.get("confirm")!;

    await expect(caller().gdpr.confirmEmail({ token })).resolves.toEqual({
      success: true,
      reference: trackingId,
    });
    expect(memory.rows(securityEvents)).toEqual([
      expect.objectContaining({
        category: GDPR_REQUEST_EMAIL_CONFIRMED,
        actor_reference: trackingId,
        security_event_actor_kind: "anonymous",
      }),
    ]);
    // A second click, or someone given the email later: refused.
    await expect(caller().gdpr.confirmEmail({ token })).rejects.toMatchObject({
      code: "CONFLICT",
      cause: expect.objectContaining({ reason: "gdpr_confirmation_used" }),
    });
    expect(memory.rows(securityEvents)).toHaveLength(1);

    const admin = appRouter.createCaller(
      createTestContext({
        user: { openId: "user_owner", role: "admin" } as never,
        mfaVerified: true,
      })
    );
    const { items } = await admin.admin.gdprRequests.list({});
    expect(items).toEqual([
      expect.objectContaining({
        trackingId,
        emailConfirmedAt: expect.any(Date),
      }),
    ]);
  });

  it("refuse un lien falsifié, expiré ou d’une demande inconnue", async () => {
    const { trackingId } = await caller().gdpr.submit(request());
    const valid = createGdprConfirmationToken(trackingId);
    const [payload, signature] = valid.split(".");
    const otherPayload = Buffer.from(
      JSON.stringify({
        reference: "GAUTREDEMANDE",
        expiresAt: Date.now() + 60_000,
      })
    ).toString("base64url");
    const longAgo = new Date();
    longAgo.setMonth(longAgo.getMonth() - 1);
    longAgo.setMinutes(longAgo.getMinutes() - 1);
    for (const token of [
      `${otherPayload}.${signature}`,
      `${payload}.${"A".repeat(signature!.length)}`,
      createGdprConfirmationToken(trackingId, longAgo),
      createGdprConfirmationToken("GINCONNUE0000"),
    ]) {
      await expect(caller().gdpr.confirmEmail({ token })).rejects.toMatchObject(
        {
          code: "BAD_REQUEST",
          cause: expect.objectContaining({
            reason: "gdpr_confirmation_invalid",
          }),
        }
      );
    }
    expect(memory.rows(securityEvents)).toHaveLength(0);
  });
});
