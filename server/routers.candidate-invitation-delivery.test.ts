import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  sendCandidatePortalAccessEmail: vi.fn(),
  realSendCandidatePortalAccessEmail: null as
    | null
    | ((input: never) => Promise<{ id: string }>),
  traceRecruitmentActionDone: vi.fn(),
  resendSend: vi.fn(),
}));

// The Resend client, for the tests that send through the real sender.
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: mocks.resendSend } })),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./_core/notifications", async importOriginal => {
  const actual = await importOriginal<typeof import("./_core/notifications")>();
  mocks.realSendCandidatePortalAccessEmail =
    actual.sendCandidatePortalAccessEmail as never;
  return {
    ...actual,
    sendCandidatePortalAccessEmail: mocks.sendCandidatePortalAccessEmail,
  };
});
vi.mock("./recruitmentAudit", async importOriginal => ({
  ...(await importOriginal<typeof import("./recruitmentAudit")>()),
  traceRecruitmentActionDone: mocks.traceRecruitmentActionDone,
}));
vi.mock("./candidateAuth", async importOriginal => ({
  ...(await importOriginal<typeof import("./candidateAuth")>()),
  createCandidateInvitationToken: () => "synthetic-invitation-token",
}));
vi.mock("./adminMfa", async importOriginal => ({
  ...(await importOriginal<typeof import("./adminMfa")>()),
  isAdminMfaVerified: vi.fn(async () => true),
}));

function adminContext(): TrpcContext {
  return {
    user: { openId: "test-admin", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function fakeDb(
  invitationEvents: Array<{
    eventType: string;
    providerEmailId: string | null;
    payload: string;
    occurredAt: Date;
  }>
) {
  const selectResults = [
    [
      {
        id: 7,
        firstName: "Test",
        email: "applicant@example.com",
        trackingId: "CV-TEST-7",
      },
    ],
    [],
    invitationEvents,
    // The sent invitation's trace, not recorded yet.
    [],
  ];
  const insertedEvents: Array<Record<string, unknown>> = [];
  return {
    insertedEvents,
    select: vi.fn(() => {
      const result = selectResults.shift();
      const query = {
        from: () => query,
        where: () => query,
        limit: async () => result,
        orderBy: async () => result,
      };
      return query;
    }),
    insert: vi.fn(() => ({
      values: async (event: Record<string, unknown>) => {
        insertedEvents.push(event);
      },
    })),
  };
}

describe("invitation administrateur et livraison incertaine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.traceRecruitmentActionDone.mockResolvedValue(undefined);
  });

  it("trace une exception de livraison comme inconnue et n’annonce pas un refus du fournisseur", async () => {
    const db = fakeDb([]);
    mocks.getDb.mockResolvedValue(db);
    // A message prefix is not proof of a provider rejection.
    mocks.sendCandidatePortalAccessEmail.mockRejectedValue(
      new Error("Resend candidate access email failed: transport timeout")
    );

    await expect(
      appRouter
        .createCaller(adminContext())
        .admin.recruitment.candidate.sendPortalInvitation({ id: 7 })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining("incertaine"),
    });

    expect(db.insertedEvents).toHaveLength(1);
    expect(db.insertedEvents[0]).toMatchObject({
      eventType: "email.delivery_unknown",
    });
    expect(JSON.parse(String(db.insertedEvents[0].payload))).toMatchObject({
      outcome: "unknown",
      failureCode: "delivery_exception",
    });
    // Traced as unknown, the admin told the delivery is uncertain even if the trace is refused (DATA-01).
    expect(mocks.traceRecruitmentActionDone).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          metadata: expect.objectContaining({ outcome: "unknown" }),
        }),
      ],
      expect.stringContaining("incertaine")
    );
  });

  it("bloque un nouvel envoi tant que la livraison précédente reste inconnue", async () => {
    const db = fakeDb([
      {
        eventType: "email.delivery_unknown",
        providerEmailId: null,
        payload: JSON.stringify({
          kind: "candidate_portal_invitation",
          outcome: "unknown",
          failureCode: "delivery_exception",
          attempt: 1,
        }),
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    mocks.getDb.mockResolvedValue(db);

    await expect(
      appRouter
        .createCaller(adminContext())
        .admin.recruitment.candidate.sendPortalInvitation({ id: 7 })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("éviter un doublon"),
    });

    expect(mocks.sendCandidatePortalAccessEmail).not.toHaveBeenCalled();
    expect(db.insertedEvents).toHaveLength(0);
  });

  describe("REC-14 — « Renvoyer quand même »", () => {
    const uncertainAttempt = (minutesAgo: number) => ({
      eventType: "email.delivery_unknown",
      providerEmailId: null,
      payload: JSON.stringify({
        kind: "candidate_portal_invitation",
        outcome: "unknown",
        failureCode: "delivery_exception",
        attempt: 1,
      }),
      occurredAt: new Date(Date.now() - minutesAgo * 60_000),
    });

    it("refuse avant 10 minutes, quand la tentative incertaine peut encore aboutir, et dit à quelle heure ce sera possible", async () => {
      const attempt = uncertainAttempt(4);
      const db = fakeDb([attempt]);
      mocks.getDb.mockResolvedValue(db);
      const at = new Date(
        attempt.occurredAt.getTime() + 10 * 60_000
      ).toLocaleTimeString("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "2-digit",
        minute: "2-digit",
      });

      await expect(
        appRouter
          .createCaller(adminContext())
          .admin.recruitment.candidate.sendPortalInvitation({
            id: 7,
            force: true,
          })
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: `La tentative d’invitation incertaine date de moins de 10 minutes : elle peut encore aboutir. « Renvoyer quand même » sera possible à ${at}.`,
      });
      expect(mocks.sendCandidatePortalAccessEmail).not.toHaveBeenCalled();
      expect(db.insertedEvents).toHaveLength(0);
    });

    it("sans demande explicite, bloque toujours, et dit que le renvoi forcé existe", async () => {
      mocks.getDb.mockResolvedValue(fakeDb([uncertainAttempt(60)]));
      await expect(
        appRouter
          .createCaller(adminContext())
          .admin.recruitment.candidate.sendPortalInvitation({ id: 7 })
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining(
          "« Renvoyer quand même » est proposé 10 minutes après cette tentative"
        ),
      });
      expect(mocks.sendCandidatePortalAccessEmail).not.toHaveBeenCalled();
    });

    it("après 10 minutes, envoie la tentative suivante sous sa propre clé d’idempotence, tracée et journalisée comme forcée", async () => {
      const db = fakeDb([uncertainAttempt(11)]);
      mocks.getDb.mockResolvedValue(db);
      mocks.sendCandidatePortalAccessEmail.mockResolvedValue({
        id: "email_forced",
      });

      await expect(
        appRouter
          .createCaller(adminContext())
          .admin.recruitment.candidate.sendPortalInvitation({
            id: 7,
            force: true,
          })
      ).resolves.toEqual({ success: true });

      expect(mocks.sendCandidatePortalAccessEmail).toHaveBeenCalledTimes(1);
      // Attempt 2: a second click sends under the same key, which Resend sends only once.
      expect(
        mocks.sendCandidatePortalAccessEmail.mock.calls[0]![0]
      ).toMatchObject({
        kind: "invite",
        idempotencyKey: "candidate-portal-invitation-CV-TEST-7-attempt-2",
      });
      expect(db.insertedEvents).toHaveLength(1);
      expect(db.insertedEvents[0]).toMatchObject({
        eventType: "email.sent",
        providerEmailId: "email_forced",
      });
      expect(JSON.parse(String(db.insertedEvents[0]!.payload))).toMatchObject({
        kind: "candidate_portal_invitation",
        outcome: "sent",
        attempt: 2,
      });
      expect(mocks.traceRecruitmentActionDone).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            metadata: expect.objectContaining({
              attempt: 2,
              forced: true,
              resendId: "email_forced",
            }),
          }),
        ],
        "L’invitation est envoyée."
      );
    });

    it("forcé dans deux onglets à la fois : le second dit qu’un envoi est en cours, sans tentative incertaine ni ligne d’audit (409 de Resend)", async () => {
      process.env.RESEND_API_KEY ||= "re_test_dummy_key_12345678";
      const db = fakeDb([uncertainAttempt(11)]);
      mocks.getDb.mockResolvedValue(db);
      // Through the real sender: Resend still sending this attempt for the other tab, under the same key.
      mocks.sendCandidatePortalAccessEmail.mockImplementation(input =>
        mocks.realSendCandidatePortalAccessEmail!(input as never)
      );
      mocks.resendSend.mockResolvedValue({
        data: null,
        error: {
          name: "concurrent_idempotent_requests",
          statusCode: 409,
          message:
            "Same idempotency key used while original request is still in progress.",
        },
        headers: null,
      });

      await expect(
        appRouter
          .createCaller(adminContext())
          .admin.recruitment.candidate.sendPortalInvitation({
            id: 7,
            force: true,
          })
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining(
          "Une autre demande d’envoi de cette invitation est en cours"
        ),
      });
      expect(
        mocks.resendSend.mock.calls.map(([, options]) => options)
      ).toContainEqual({
        idempotencyKey: "candidate-portal-invitation-CV-TEST-7-attempt-2",
      });
      expect(db.insertedEvents).toEqual([]);
      expect(mocks.traceRecruitmentActionDone).not.toHaveBeenCalled();

      // Any other uncertain answer of Resend is still recorded as such.
      mocks.resendSend.mockResolvedValue({
        data: null,
        error: {
          name: "application_error",
          statusCode: 503,
          message: "Unavailable",
        },
        headers: null,
      });
      const after = fakeDb([uncertainAttempt(11)]);
      mocks.getDb.mockResolvedValue(after);
      await expect(
        appRouter
          .createCaller(adminContext())
          .admin.recruitment.candidate.sendPortalInvitation({
            id: 7,
            force: true,
          })
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: expect.stringContaining("incertaine"),
      });
      expect(after.insertedEvents).toEqual([
        expect.objectContaining({ eventType: "email.delivery_unknown" }),
      ]);
    });
  });
});
