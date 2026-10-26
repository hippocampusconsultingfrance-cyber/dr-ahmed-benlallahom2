import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contactMessages, cvApplications, cvProcessingJobs, medicalQuestionAuditLogs, medicalQuestions, securityEvents } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER, seedApplication } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

type SentEmail = { to: string[]; subject: string };
const state = vi.hoisted(() => ({ db: null as unknown, sent: [] as SentEmail[], stored: [] as string[] }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async (_payload: { title: string; content: string }) => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined) }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(async (payload: SentEmail) => { state.sent.push(payload); return { data: { id: `email_${state.sent.length}` }, error: null }; }) };
  },
}));

const { appRouter } = await import("./routers");
const { notifyOwner } = await import("./_core/notification");
const { PUBLIC_EMAIL_IP_RATE_LIMITS, PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS } = await import("./publicFormRateLimit");
const { runSecurityPostureReview } = await import("./scheduledJobs");
const { backfillLegacyCvAnalysisJobs, CV_ANALYSIS_DEFERRED_DAILY_VOLUME, deferCvAnalysisForDailyVolume, enqueueCvAnalysis } = await import("./recruitmentProcessing");

const dialect = new PgDialect();
const TURNSTILE_TOKEN = "turnstile-token-accepted-by-the-mock";

function db() { return state.db as InMemoryDrizzle & { execute: ReturnType<typeof vi.fn> }; }

/** Contact and GDPR rows are written with a raw INSERT, which the in-memory stand-in does not parse: record the table. */
function inMemoryDbWithRawInserts() {
  return Object.assign(createInMemoryDrizzle(), {
    execute: vi.fn(async (query: SQL) => {
      state.stored.push(/INSERT INTO (\w+)/.exec(dialect.sqlToQuery(query).sql)?.[1] ?? "unknown");
      return { rows: [], rowCount: 1 };
    }),
  });
}

function caller(ip: string | null) {
  const headers: Record<string, string> = ip ? { "x-forwarded-for": ip } : {};
  return appRouter.createCaller({ user: null, mfaVerified: false, req: { protocol: "https", headers }, res: { clearCookie: vi.fn() } } as never);
}

const contactMessage = (email: string) => ({ name: "Jeanne Martin", email, message: "Bonjour, je souhaite une information sur la consultation.", gdprConsent: 1, turnstileToken: TURNSTILE_TOKEN });
const gdprRequest = (email: string) => ({ name: "Jeanne Martin", email, requestType: "access" as const, description: "Je souhaite accéder à mes données.", turnstileToken: TURNSTILE_TOKEN });
const medicalQuestion = (email: string) => ({
  firstName: "Jeanne",
  lastName: "Martin",
  email,
  phone: "+33 6 12 34 56 78",
  question: "Puis-je garder mes lunettes jusqu’au bloc opératoire avant une anesthésie générale ?",
  language: "fr" as const,
  privacyConsent: true as const,
  urgencyAcknowledged: true as const,
  turnstileToken: TURNSTILE_TOKEN,
});

const ownerTitles = () => vi.mocked(notifyOwner).mock.calls.map(([payload]) => payload.title);

beforeEach(() => {
  state.db = inMemoryDbWithRawInserts();
  state.sent.length = 0;
  state.stored.length = 0;
  vi.mocked(notifyOwner).mockClear();
  vi.stubEnv("RESEND_API_KEY", "re_test_public_form_volume");
});
afterEach(() => vi.unstubAllEnvs());

describe("contact et RGPD — limite par IP seule (ABUS-01)", () => {
  it("borne les messages de contact d’une même IP, même en changeant d’adresse, sans gêner une autre IP", async () => {
    const { maxAttempts } = PUBLIC_EMAIL_IP_RATE_LIMITS.contact;
    for (let index = 1; index <= maxAttempts; index += 1) {
      await expect(caller("198.51.100.71").contact.submit(contactMessage(`visiteur${index}@test.local`))).resolves.toMatchObject({ success: true });
    }
    await expect(caller("198.51.100.71").contact.submit(contactMessage("encore@test.local"))).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(state.stored).toHaveLength(maxAttempts);
    expect(db().rows(securityEvents).map(event => [event.category, event.outcome])).toContainEqual(["public_contact_submit_ip_rate_limit", "blocked"]);

    await expect(caller("203.0.113.72").contact.submit(contactMessage("encore@test.local"))).resolves.toMatchObject({ success: true });
  });

  it("borne les demandes RGPD d’une même IP sur la journée", async () => {
    const { maxAttempts } = PUBLIC_EMAIL_IP_RATE_LIMITS.gdpr;
    for (let index = 1; index <= maxAttempts; index += 1) {
      await expect(caller("198.51.100.73").gdpr.submit(gdprRequest(`personne${index}@test.local`))).resolves.toMatchObject({ success: true });
    }
    await expect(caller("198.51.100.73").gdpr.submit(gdprRequest("autre@test.local"))).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(state.stored).toEqual(Array(maxAttempts).fill("gdpr_requests"));
  });

  it("rend l’essai d’un message qui n’a pas pu être enregistré", async () => {
    db().execute.mockRejectedValueOnce(new Error("database down"));
    await expect(caller("198.51.100.74").contact.submit(contactMessage("panne@test.local"))).rejects.toThrow();
    const { maxAttempts } = PUBLIC_EMAIL_IP_RATE_LIMITS.contact;
    for (let index = 1; index <= maxAttempts; index += 1) {
      await expect(caller("198.51.100.74").contact.submit(contactMessage(`visiteur${index}@test.local`))).resolves.toMatchObject({ success: true });
    }
    await expect(caller("198.51.100.74").contact.submit(contactMessage("encore@test.local"))).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("ne regroupe pas les visiteurs sans IP identifiable dans un compteur commun", async () => {
    for (let index = 1; index <= PUBLIC_EMAIL_IP_RATE_LIMITS.contact.maxAttempts + 2; index += 1) {
      await expect(caller(null).contact.submit(contactMessage(`visiteur${index}@test.local`))).resolves.toMatchObject({ success: true });
    }
  });
});

describe("seuil quotidien global : demandes gardées, effets coûteux coupés (ABUS-01)", () => {
  it("garde les messages de contact au-delà du seuil, sans email pour chacun, avec une seule alerte groupée", async () => {
    const threshold = PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS.contact;
    for (let index = 1; index <= threshold; index += 1) await caller(null).contact.submit(contactMessage(`visiteur${index}@test.local`));
    expect(ownerTitles().filter(title => title.startsWith("Nouveau message de contact"))).toHaveLength(threshold);
    vi.mocked(notifyOwner).mockClear();

    await expect(caller(null).contact.submit(contactMessage("au-dela1@test.local"))).resolves.toMatchObject({ success: true });
    await expect(caller(null).contact.submit(contactMessage("au-dela2@test.local"))).resolves.toMatchObject({ success: true });

    expect(state.stored).toHaveLength(threshold + 2);
    expect(ownerTitles()).toEqual([`Volume inhabituel : plus de ${threshold} messages de contact en 24 heures`]);
    const [[alert]] = vi.mocked(notifyOwner).mock.calls;
    expect(alert.content).toContain("Le formulaire reste ouvert");
    expect(alert.content).toContain("Attack Challenge Mode");
  });

  it("compte les demandes RGPD à part des messages de contact", async () => {
    const threshold = PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS.gdpr;
    for (let index = 1; index <= threshold; index += 1) await caller(null).gdpr.submit(gdprRequest(`personne${index}@test.local`));
    vi.mocked(notifyOwner).mockClear();

    await caller(null).gdpr.submit(gdprRequest("au-dela@test.local"));
    await caller(null).contact.submit(contactMessage("contact@test.local"));

    expect(ownerTitles()).toEqual([
      `Volume inhabituel : plus de ${threshold} demandes RGPD en 24 heures`,
      expect.stringMatching(/^Nouveau message de contact/),
    ]);
  });

  it("garde une question santé au-delà du seuil sans accusé à l’adresse saisie ni email au propriétaire", async () => {
    const threshold = PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS.medicalQuestion;
    for (let index = 1; index <= threshold; index += 1) await caller(null).medicalQuestions.submit(medicalQuestion(`patient${index}@test.local`));
    expect(state.sent).toHaveLength(threshold);
    vi.mocked(notifyOwner).mockClear();

    const result = await caller(null).medicalQuestions.submit(medicalQuestion("cible@test.local"));

    expect(result.acknowledgementSent).toBe(false);
    expect(state.sent.some(email => email.to.includes("cible@test.local"))).toBe(false);
    expect(db().rows(medicalQuestions).map(row => row.email)).toContain("cible@test.local");
    expect(ownerTitles()).toEqual([`Volume inhabituel : plus de ${threshold} questions santé en 24 heures`]);
    const lastQuestion = db().rows(medicalQuestions).find(row => row.email === "cible@test.local");
    expect(db().rows(medicalQuestionAuditLogs).filter(log => log.medicalQuestionId === lastQuestion?.id).map(log => log.action))
      .toEqual(["submitted", "acknowledgement_skipped_daily_volume"]);
  });
});

describe("analyse IA d’une candidature reçue au-delà du seuil (ABUS-01)", () => {
  it("n’est pas remise en file par le rattrapage automatique, mais reste relançable par l’administration", async () => {
    const deferred = seedApplication(db(), { email: "au-dela@test.local" });
    const ordinary = seedApplication(db(), { email: "ordinaire@test.local" });
    await deferCvAnalysisForDailyVolume(Number(deferred.id));

    await backfillLegacyCvAnalysisJobs();

    expect(db().rows(cvProcessingJobs).map(job => job.applicationId)).toEqual([ordinary.id]);
    expect(db().rows(cvApplications).find(row => row.id === deferred.id)).toMatchObject({ analysisStatus: "needs_review", analysisLastError: CV_ANALYSIS_DEFERRED_DAILY_VOLUME });

    await enqueueCvAnalysis(Number(deferred.id));
    expect(db().rows(cvProcessingJobs).map(job => job.applicationId)).toEqual([ordinary.id, deferred.id]);
    expect(db().rows(cvApplications).find(row => row.id === deferred.id)).toMatchObject({ analysisStatus: "queued", analysisLastError: null });
  });
});

describe("bilan quotidien de sécurité — volume de demandes acceptées (ABUS-01)", () => {
  function seedContactMessages(count: number, createdAt: Date) {
    for (let index = 0; index < count; index += 1) {
      db().seed(contactMessages, { trackingId: `C${createdAt.getTime()}${index}`.slice(0, 20), name: "Visiteur", email: `v${index}@test.local`, message: "Bonjour", gdprConsent: 1, createdAt });
    }
  }

  it("alerte le propriétaire quand les messages des dernières 24 heures dépassent le seuil", async () => {
    const now = new Date();
    seedContactMessages(PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS.contact + 1, new Date(now.getTime() - 60 * 60 * 1000));

    const review = await runSecurityPostureReview(now);

    expect(review).toMatchObject({ available: true, highSeverityEvents24h: 0, busyPublicForms: ["contact"] });
    expect(vi.mocked(notifyOwner)).toHaveBeenCalledTimes(1);
    const [[report]] = vi.mocked(notifyOwner).mock.calls;
    expect(report.title).toBe("Bilan quotidien de sécurité");
    expect(report.content).toContain(`Seuil quotidien dépassé pour les messages de contact : plus de ${PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS.contact}`);
  });

  it("ne compte ni les messages plus anciens ni un volume ordinaire", async () => {
    const now = new Date();
    seedContactMessages(PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS.contact, new Date(now.getTime() - 60 * 60 * 1000));
    seedContactMessages(10, new Date(now.getTime() - 30 * 60 * 60 * 1000));

    await expect(runSecurityPostureReview(now)).resolves.toMatchObject({ busyPublicForms: [] });
    expect(vi.mocked(notifyOwner)).not.toHaveBeenCalled();
  });
});
