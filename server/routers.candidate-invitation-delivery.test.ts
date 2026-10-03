import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  sendCandidatePortalAccessEmail: vi.fn(),
  logRecruitmentAction: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendCandidatePortalAccessEmail: mocks.sendCandidatePortalAccessEmail,
}));
vi.mock("./recruitmentAudit", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentAudit")>(),
  logRecruitmentAction: mocks.logRecruitmentAction,
}));
vi.mock("./candidateAuth", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateAuth")>(),
  createCandidateInvitationToken: () => "synthetic-invitation-token",
}));
vi.mock("./adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("./adminMfa")>(),
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

function fakeDb(invitationEvents: Array<{ eventType: string; providerEmailId: string | null; payload: string; occurredAt: Date }>) {
  const selectResults = [
    [{ id: 7, firstName: "Test", email: "applicant@example.com", trackingId: "CV-TEST-7" }],
    [],
    invitationEvents,
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
    insert: vi.fn(() => ({ values: async (event: Record<string, unknown>) => { insertedEvents.push(event); } })),
  };
}

describe("invitation administrateur et livraison incertaine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logRecruitmentAction.mockResolvedValue(undefined);
  });

  it("trace une exception de livraison comme inconnue et n’annonce pas un refus du fournisseur", async () => {
    const db = fakeDb([]);
    mocks.getDb.mockResolvedValue(db);
    // A message prefix is not proof of a provider rejection.
    mocks.sendCandidatePortalAccessEmail.mockRejectedValue(new Error("Resend candidate access email failed: transport timeout"));

    await expect(appRouter.createCaller(adminContext()).admin.recruitment.candidate.sendPortalInvitation({ id: 7 }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: expect.stringContaining("incertaine") });

    expect(db.insertedEvents).toHaveLength(1);
    expect(db.insertedEvents[0]).toMatchObject({ eventType: "email.delivery_unknown" });
    expect(JSON.parse(String(db.insertedEvents[0].payload))).toMatchObject({ outcome: "unknown", failureCode: "delivery_exception" });
    expect(mocks.logRecruitmentAction).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ outcome: "unknown" }),
    }));
  });

  it("bloque un nouvel envoi tant que la livraison précédente reste inconnue", async () => {
    const db = fakeDb([{
      eventType: "email.delivery_unknown",
      providerEmailId: null,
      payload: JSON.stringify({ kind: "candidate_portal_invitation", outcome: "unknown", failureCode: "delivery_exception", attempt: 1 }),
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    }]);
    mocks.getDb.mockResolvedValue(db);

    await expect(appRouter.createCaller(adminContext()).admin.recruitment.candidate.sendPortalInvitation({ id: 7 }))
      .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("éviter un doublon") });

    expect(mocks.sendCandidatePortalAccessEmail).not.toHaveBeenCalled();
    expect(db.insertedEvents).toHaveLength(0);
  });
});
