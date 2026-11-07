import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccounts, candidateDocuments, cvApplications } from "../../../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "../../testSupport/inMemoryDrizzle";
import type { TrpcContext } from "../../_core/context";

// ADM-19 — Documents candidats : chaque document dit la candidature à laquelle
// il se rattache (sa référence CV…, pour « Voir la candidature »), celle de
// son envoi, sinon celle à laquelle son compte a été lié depuis ; aucune pour
// un compte sans candidature ou une candidature effacée.

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../db", () => ({ getDb: async () => state.db }));
vi.mock("../../adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("../../adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));

const { adminCandidateDocumentsRouter } = await import("./candidateDocuments");

const db = () => state.db as InMemoryDrizzle;

function admin() {
  return adminCandidateDocumentsRouter.createCaller({
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  });
}

function application(trackingId: string) {
  return db().seed(cvApplications, {
    trackingId, firstName: "Amina", lastName: "Haddad", email: `${trackingId.toLowerCase()}@test.local`, specialty: "Anesthésie", targetCountries: "[]",
    cvFileKey: `recruitment/cv/${trackingId}.pdf`, cvOriginalName: "cv.pdf", cvMimeType: "application/pdf", cvSizeBytes: 1000,
  });
}

function document(candidateId: number, originalName: string, extra: Record<string, unknown> = {}) {
  return db().seed(candidateDocuments, {
    candidateId, category: "diploma", originalName, storageKey: `candidate-documents/${originalName}`, mimeType: "application/pdf", sizeBytes: 2048, checksum: "0".repeat(64),
    status: "needs_review", analysisStatus: "needs_review", ...extra,
  });
}

beforeEach(() => {
  state.db = createInMemoryDrizzle();
});

describe("ADM-19 — candidature d’un document du coffre", () => {
  it("donne la référence de la candidature du document, sinon celle du compte, et aucune sans candidature", async () => {
    const sent = application("CVSENT000001");
    const linked = application("CVLINK000002");
    const amina = db().seed(candidateAccounts, { email: "amina@test.local", firstName: "Amina", lastName: "Haddad", passwordHash: "scrypt$unused", linkedApplicationId: linked.id });
    const omar = db().seed(candidateAccounts, { email: "omar@test.local", firstName: "Omar", lastName: "Said", passwordHash: "scrypt$unused" });
    document(amina.id as number, "diplome.pdf", { applicationId: sent.id, createdAt: new Date("2026-10-01T08:00:00Z") });
    document(amina.id as number, "licence.pdf", { applicationId: null, createdAt: new Date("2026-10-02T08:00:00Z") });
    document(omar.id as number, "identite.pdf", { applicationId: null, createdAt: new Date("2026-10-03T08:00:00Z") });
    // An application erased since: its document is still listed, without a link.
    document(omar.id as number, "attestation.pdf", { applicationId: 999, createdAt: new Date("2026-10-04T08:00:00Z") });

    const listed = await admin().list({});
    expect(listed.map(row => [row.originalName, row.applicationTrackingId])).toEqual([
      ["attestation.pdf", null],
      ["identite.pdf", null],
      ["licence.pdf", "CVLINK000002"],
      ["diplome.pdf", "CVSENT000001"],
    ]);
  });
});
