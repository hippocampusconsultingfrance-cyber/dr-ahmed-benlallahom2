import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateDocuments, candidateSessions } from "../drizzle/schema";
import { hashCandidateToken } from "./candidateAuth";
import type { InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER, freshCandidateDb } from "./testSupport/candidatePortal";
import { seedVerifiedCandidate } from "./testSupport/candidateUploadApp";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// Deux candidats vérifiés, chacun avec ses sessions et ses documents : la liste
// et la révocation des sessions, comme la liste des documents, ne portent que
// sur le candidat de la session. Le téléchargement est vérifié par la route
// Express dans candidateDocumentVault.test.ts (un autre candidat reçoit 404).

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));

const { candidatePortalRouter } = await import("./candidatePortalRouter");

const VERA_SESSION = "vera-session-token-for-access-boundaries";
const OMAR_SESSION = "omar-session-token-for-access-boundaries";

function db() { return state.db as InMemoryDrizzle; }

function caller(sessionToken: string) {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  const api = candidatePortalRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: { cookie: `candidate_portal_session=${sessionToken}`, "x-forwarded-for": "203.0.113.50" } },
    res,
  } as never);
  return { api, res };
}

function seedSession(candidateId: number, token: string) {
  return db().seed(candidateSessions, { candidateId, tokenHash: hashCandidateToken(token, "session"), deviceLabel: `device ${token}`, expiresAt: new Date(Date.now() + 3_600_000) });
}

function seedDocument(candidateId: number, originalName: string) {
  return db().seed(candidateDocuments, {
    candidateId, category: "diploma", originalName, storageKey: `candidate-documents/${candidateId}/${originalName}`,
    mimeType: "application/pdf", sizeBytes: 2048, checksum: "0".repeat(64),
  });
}

const sessionOf = (id: number) => db().rows(candidateSessions).find(row => row.id === id)!;

let vera: { id: number };
let omar: { id: number };

beforeEach(() => {
  state.db = freshCandidateDb();
  vera = seedVerifiedCandidate(db(), { email: "vera@example.test", sessionToken: VERA_SESSION }) as { id: number };
  omar = seedVerifiedCandidate(db(), { email: "omar@example.test", sessionToken: OMAR_SESSION }) as { id: number };
});

describe("limites d’accès du portail candidat", () => {
  it("borne les sessions affichées et révoquées à l’identité candidate de la session", async () => {
    const veraLaptop = seedSession(vera.id, "vera-second-device-token") as { id: number };
    const omarLaptop = seedSession(omar.id, "omar-second-device-token") as { id: number };
    const { api } = caller(VERA_SESSION);

    const sessions = await api.sessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.every(session => db().rows(candidateSessions).find(row => row.id === session.id)?.candidateId === vera.id)).toBe(true);
    expect(sessions.filter(session => session.current)).toHaveLength(1);

    // Another candidate's session id is unknown to this candidate.
    await expect(api.revokeSession({ id: omarLaptop.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(sessionOf(omarLaptop.id).revokedAt ?? null).toBeNull();

    await expect(api.revokeSession({ id: veraLaptop.id })).resolves.toEqual({ success: true });
    expect(sessionOf(veraLaptop.id).revokedAt).toBeInstanceOf(Date);
  });

  it("ne révoque, d’un coup, que les sessions du candidat connecté", async () => {
    const omarLaptop = seedSession(omar.id, "omar-second-device-token") as { id: number };
    const { api, res } = caller(VERA_SESSION);

    await expect(api.revokeAllSessions()).resolves.toEqual({ success: true });

    expect(res.clearCookie).toHaveBeenCalled();
    const rows = db().rows(candidateSessions);
    expect(rows.filter(row => row.candidateId === vera.id).every(row => row.revokedAt instanceof Date)).toBe(true);
    expect(rows.filter(row => row.candidateId === omar.id).map(row => row.revokedAt ?? null)).toEqual([null, null]);
    expect(sessionOf(omarLaptop.id).revokedAt ?? null).toBeNull();
    await expect(caller(OMAR_SESSION).api.sessions()).resolves.toHaveLength(2);
  });

  it("borne la liste de documents à l’identité candidate de la session", async () => {
    seedDocument(vera.id, "diplome-vera.pdf");
    seedDocument(omar.id, "diplome-omar.pdf");
    seedDocument(omar.id, "licence-omar.pdf");

    await expect(caller(VERA_SESSION).api.documents()).resolves.toEqual([expect.objectContaining({ originalName: "diplome-vera.pdf" })]);
    expect((await caller(OMAR_SESSION).api.documents()).map(document => document.originalName).sort()).toEqual(["diplome-omar.pdf", "licence-omar.pdf"]);
  });
});
