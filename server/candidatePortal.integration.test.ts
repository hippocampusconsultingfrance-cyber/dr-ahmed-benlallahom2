import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./_core/notifications", () => ({
  sendCandidatePortalAccessEmail: vi.fn().mockResolvedValue(undefined),
}));

import { appRouter } from "./routers";
import { getDb } from "./db";
import { candidateAccounts, candidateDocumentAuditLogs, candidateDocuments, candidateDocumentProcessingJobs, candidateSessions } from "../drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import { hashCandidateToken } from "./candidateAuth";

const email = `candidate-e2e-${Date.now()}@example.invalid`;
const password = "Espace candidat sécurisé 2026 !";
const verificationToken = "verify-candidate-e2e-token-1234567890";
let candidateId = 0;

function caller(cookie = "") {
  const cookies: Array<{ name: string; value: string }> = [];
  const instance = appRouter.createCaller({
    req: { headers: { host: "drahmedbenlallahom.com", cookie }, protocol: "https" } as any,
    res: { cookie: (name: string, value: string) => cookies.push({ name, value }) } as any,
    user: null,
  } as any);
  return { instance, cookies };
}

describe("parcours d’intégration espace candidat", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    await db.delete(candidateAccounts).where(eq(candidateAccounts.email, email));
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db || !candidateId) return;
    const documents = await db.select({ id: candidateDocuments.id }).from(candidateDocuments).where(eq(candidateDocuments.candidateId, candidateId));
    const documentIds = documents.map(document => document.id);
    if (documentIds.length) await db.delete(candidateDocumentProcessingJobs).where(inArray(candidateDocumentProcessingJobs.documentId, documentIds));
    await db.delete(candidateDocumentAuditLogs).where(eq(candidateDocumentAuditLogs.candidateId, candidateId));
    await db.delete(candidateDocuments).where(eq(candidateDocuments.candidateId, candidateId));
    await db.delete(candidateSessions).where(eq(candidateSessions.candidateId, candidateId));
    await db.delete(candidateAccounts).where(and(eq(candidateAccounts.id, candidateId), eq(candidateAccounts.email, email)));
  });

  it("crée, vérifie, ouvre et protège une session candidate", async () => {
    const registration = caller();
    await registration.instance.candidatePortal.register({
      email,
      password,
      firstName: "Test",
      lastName: "Candidat",
      termsAccepted: true,
      documentConsent: true,
      website: "",
      submittedAt: Date.now() - 2_000,
    });

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const account = (await db.select().from(candidateAccounts).where(eq(candidateAccounts.email, email)).limit(1))[0];
    expect(account).toBeTruthy();
    candidateId = account.id;
    expect(account.emailVerifiedAt).toBeNull();
    expect(account.documentConsentAt).toBeTruthy();
    await expect(registration.instance.candidatePortal.login({ email, password })).rejects.toThrow("Email ou mot de passe incorrect");

    await db.update(candidateAccounts).set({
      verificationTokenHash: hashCandidateToken(verificationToken, "verification"),
      verificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    }).where(eq(candidateAccounts.id, candidateId));

    const verification = caller();
    await expect(verification.instance.candidatePortal.verifyEmail({ email, token: verificationToken })).resolves.toEqual({ success: true });
    const sessionCookie = verification.cookies.find(cookie => cookie.name === "candidate_portal_session");
    expect(sessionCookie?.value).toBeTruthy();

    const authenticated = caller(`candidate_portal_session=${sessionCookie?.value}`);
    await expect(authenticated.instance.candidatePortal.me()).resolves.toMatchObject({ email, firstName: "Test", documentConsentAt: expect.any(Date) });
    await expect(authenticated.instance.candidatePortal.documents()).resolves.toEqual([]);

    const incorrect = caller();
    await expect(incorrect.instance.candidatePortal.login({ email, password: "mot de passe incorrect" })).rejects.toThrow("Email ou mot de passe incorrect");
  });

  it("ignore une inscription automatisée qui remplit le champ leurre", async () => {
    const botEmail = `candidate-bot-${Date.now()}@example.invalid`;
    const automated = caller();
    await expect(automated.instance.candidatePortal.register({
      email: botEmail,
      password,
      firstName: "Bot",
      lastName: "Test",
      termsAccepted: true,
      documentConsent: true,
      website: "https://spam.example",
      submittedAt: Date.now(),
    })).resolves.toEqual({ message: "Si vos informations sont valides, vous recevrez les instructions nécessaires." });
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    await expect(db.select().from(candidateAccounts).where(eq(candidateAccounts.email, botEmail)).limit(1)).resolves.toEqual([]);
  });
});
