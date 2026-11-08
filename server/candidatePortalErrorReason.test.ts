import { DrizzleQueryError } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { listen } from "./testSupport/candidateUploadApp";
import { formatTrpcErrorShape, PublicErrorReason } from "./_core/trpc";

// EN-06 — le motif stable d’un refus atteint le navigateur dans data.reason,
// à côté du message français inchangé.

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;
const database = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", () => ({ getDb: async () => database.db }));
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

// EXPL-11 — une requête refusée par la base est journalisée sur une ligne JSON,
// avec le x-vercel-id de la requête servie, sans ses paramètres (l’adresse cherchée).
describe("journal d’une requête refusée dans l’espace candidat", () => {
  afterEach(() => {
    database.db = null;
    vi.restoreAllMocks();
  });

  it("écrit une ligne : libellé, SQLSTATE, requête sans paramètres et x-vercel-id, et répond le motif stable", async () => {
    const lockTimeout = Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
    const refused = new DrizzleQueryError('select "id", "email" from "candidate_accounts" where "candidate_accounts"."email" = $1', ["camille.candidate@example.test"], lockTimeout);
    database.db = { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.reject(refused) }) }) }) };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const input = encodeURIComponent(JSON.stringify({ json: { email: "camille.candidate@example.test", token: "activation-token-0123456789abcdef" } }));
    const response = await fetch(`${baseUrl}/api/trpc/candidatePortal.activationDetails?input=${input}`, { headers: { "x-vercel-id": "cdg1::iad1::candidate-5" } });
    const body = await response.json() as { error: { json: { data: { code: string; reason?: string } } } };

    expect(response.status).toBe(500);
    expect(body.error.json.data).toMatchObject({ code: "INTERNAL_SERVER_ERROR", reason: "candidate_service_unavailable" });
    expect(consoleError.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([{
      label: "candidate_database_operation_failed",
      name: "Error",
      code: "55P03",
      message: 'Failed query: select "id", "email" from "candidate_accounts" where "candidate_accounts"."email" = $1',
      cause: "Error: canceling statement due to lock timeout",
      vercelId: "cdg1::iad1::candidate-5",
    }]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/camille|params:/);
  });
});
