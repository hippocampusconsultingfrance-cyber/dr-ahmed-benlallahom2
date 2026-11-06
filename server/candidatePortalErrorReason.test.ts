import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { listen } from "./testSupport/candidateUploadApp";
import { formatTrpcErrorShape, PublicErrorReason } from "./_core/trpc";

// EN-06 — le motif stable d’un refus atteint le navigateur dans data.reason,
// à côté du message français inchangé.

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;
vi.mock("./db", () => ({ getDb: async () => null }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));

const { createApp } = await import("./_core/index");

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });

describe("motif stable des refus de l’espace candidat", () => {
  it("renvoie data.reason avec le code tRPC et le message français", async () => {
    const input = encodeURIComponent(JSON.stringify({ json: { token: "forged-invitation-token-0123456789" } }));
    const response = await fetch(`${baseUrl}/api/trpc/candidatePortal.resolveInvitation?input=${input}`);
    const body = await response.json() as { error: { json: { message: string; data: { code: string; reason?: string } } } };
    expect(response.status).toBe(400);
    expect(body.error.json.data).toMatchObject({ code: "BAD_REQUEST", reason: "candidate_invitation_invalid" });
    expect(body.error.json.message).toBe("Cette invitation est invalide ou expirée.");
  });

  it("garde le message d’un refus délibéré, même interne, et n’ajoute rien sans motif", () => {
    const shape = { message: "Le service candidat est temporairement indisponible.", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } };
    expect(formatTrpcErrorShape(shape, { code: "INTERNAL_SERVER_ERROR", cause: new PublicErrorReason("candidate_service_unavailable") })).toEqual({
      ...shape,
      data: { ...shape.data, reason: "candidate_service_unavailable" },
    });
    const conflict = { ...shape, data: { ...shape.data, code: "CONFLICT" } };
    expect(formatTrpcErrorShape(conflict, { code: "CONFLICT" })).toBe(conflict);
  });
});
