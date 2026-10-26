import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";

const dialect = new PgDialect();

// M1 — BOOK-FULFILL-RETRY / BOOK-OWNER-DUP : notification du propriétaire en job
// indépendant et prioritaire, essais courts avec clé d’idempotence, alerte dès
// le premier échec d’envoi au patient, plus d’email « SMS » en double.
// Les vrais gabarits et la vraie notification propriétaire sont exécutés ; seul
// le transport Resend est simulé.

const resend = vi.hoisted(() => {
  vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.test");
  return {
    calls: [] as Array<{ message: Record<string, unknown>; options?: { idempotencyKey?: string }; at: number }>,
    // Réponse par appel : "ok", "5xx", "422", "429" ou "throw" ; "ok" quand la file est vide.
    script: [] as string[],
    failFor: new Set<string>(),
    // Limite de débit persistante pour ces adresses, avec ce retry-after (secondes).
    rateLimitedFor: new Set<string>(),
    retryAfterSeconds: "1",
    // Durée simulée de chaque appel à Resend (ms) ; l’envoi est noté à sa fin.
    latencyMs: 0,
  };
});
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(async (message: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        if (resend.latencyMs > 0) await new Promise(resolve => setTimeout(resolve, resend.latencyMs));
        resend.calls.push({ message, options, at: Date.now() });
        const to = (message.to as string[])[0];
        const outcome = resend.failFor.has(to) ? "5xx" : resend.rateLimitedFor.has(to) ? "429" : resend.script.shift() ?? "ok";
        if (outcome === "throw") throw new Error("socket hang up");
        if (outcome === "5xx") return { data: null, error: { name: "internal_server_error", statusCode: 503, message: "unavailable" } };
        if (outcome === "422") return { data: null, error: { name: "validation_error", statusCode: 422, message: "invalid recipient" } };
        if (outcome === "429") return { data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" }, headers: { "retry-after": resend.retryAfterSeconds } };
        return { data: { id: `email_${resend.calls.length}` }, error: null };
      }),
    },
  })),
}));
// latencyMs : durée simulée de chaque requête en base ; hangNextClaim : le
// prochain claim ne reçoit jamais de réponse.
const database = vi.hoisted(() => ({ getDb: vi.fn(), latencyMs: 0, hangNextClaim: false }));
vi.mock("./db", () => ({ getDb: database.getDb }));
vi.mock("./storage.js", () => ({ storagePutOnce: vi.fn(async (key: string) => ({ key, url: "https://storage.test/invoice.pdf", uploaded: true })) }));
vi.mock("./invoiceNumbering", () => ({
  allocateAppointmentInvoice: vi.fn(async () => ({
    invoiceNumber: "FAC-2026-000007",
    issuedAt: new Date("2026-10-12T08:00:00Z"),
    paidAt: new Date("2026-10-12T07:59:00Z"),
  })),
}));

import { appointmentFulfillmentPacing, enqueueAppointmentFulfillment, immediateFulfillmentBudget, processDueAppointmentFulfillmentJobs } from "./appointmentFulfillment";
import { postPaymentDeliveryRetry, sendConfirmationEmail, sendOwnerNotificationEmail } from "./_core/notifications";
import * as notificationsModule from "./_core/notifications";
import { processFulfillmentBestEffort } from "./appointmentPaymentWebhook";
import { paymentStatusPageFulfillment } from "./appointmentPublicStatus";
import { drainInBatches } from "./scheduledJobs";

type Job = { id: number; appointmentId: number; jobType: string; status: string; attempts: number; maxAttempts: number; scheduledFor: Date; createdAt?: Date };

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    trackingId: "APTOWNER0001",
    customerEmail: "patient@example.test",
    customerName: "Patient Test",
    customerPhone: "+33600000000",
    appointmentDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    finalPrice: "100.00",
    basePrice: "100.00",
    requestDetails: "Demande d’avis",
    consultationType: "health_advice",
    duration: 30,
    isNightRate: 0,
    paymentStatus: "completed",
    appointmentStatus: "confirmed",
    emailSent: 0,
    ...overrides,
  };
}

/**
 * In-memory jobs table. The due-list query is the one with an ORDER BY; every
 * job UPDATE (claim or status) targets the id bound first in its WHERE clause.
 */
function memoryDatabase(initialJobs: Job[], appointment = appointmentRow()) {
  const jobs = initialJobs.map(row => ({ ...row }));
  const latency = () => new Promise(resolve => setTimeout(resolve, database.latencyMs));
  const inserts: Array<{ jobType: string; conflict: string }> = [];
  let nextId = 100;
  const db = {
    insert: vi.fn(() => ({
      values: (values: Job) => {
        const store = async (conflict: string) => {
          if (database.latencyMs > 0) await latency();
          inserts.push({ jobType: values.jobType, conflict });
          if (!jobs.some(row => row.appointmentId === values.appointmentId && row.jobType === values.jobType)) {
            jobs.push({ ...values, id: nextId++, createdAt: new Date() });
          }
          return { rowCount: 1 };
        };
        return { onConflictDoUpdate: () => store("update"), onConflictDoNothing: () => store("nothing") };
      },
    })),
    select: vi.fn(() => ({
      from: (table: unknown) => {
        let ordered = false;
        let where: SQL | undefined;
        const chain = {
          where: (clause: SQL) => { where = clause; return chain; },
          orderBy: () => { ordered = true; return chain; },
          limit: async (count: number) => {
            if (database.latencyMs > 0) await latency();
            if (table === appointments) return [appointment];
            if (ordered) {
              return jobs
                .filter(row => ["queued", "retry"].includes(row.status) && row.scheduledFor.getTime() <= Date.now() && row.attempts < row.maxAttempts)
                .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime() || a.id - b.id)
                .slice(0, count)
                .map(row => ({ ...row }));
            }
            const id = where ? dialect.sqlToQuery(where).params[0] : undefined;
            return jobs.filter(row => row.id === id).map(row => ({ ...row }));
          },
        };
        return chain;
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (clause: SQL) => {
          if (database.latencyMs > 0) await latency();
          if (table !== appointmentFulfillmentJobs) return { rowCount: 1 };
          if (database.hangNextClaim && values.status === "running") {
            database.hangNextClaim = false;
            return new Promise(() => undefined);
          }
          const id = dialect.sqlToQuery(clause).params[0];
          const target = jobs.find(row => row.id === id);
          if (!target || (values.status === "running" && !["queued", "retry"].includes(target.status))) return { rowCount: 0 };
          Object.assign(target, values);
          return { rowCount: 1 };
        },
      }),
    })),
  };
  database.getDb.mockResolvedValue(db);
  return { db, jobs, inserts };
}

function job(id: number, jobType: string, overrides: Partial<Job> = {}): Job {
  return { id, appointmentId: 42, jobType, status: "queued", attempts: 0, maxAttempts: 3, scheduledFor: new Date(Date.now() - 1000), createdAt: new Date("2026-10-12T07:59:00Z"), ...overrides };
}

const subjects = () => resend.calls.map(call => String(call.message.subject));

afterAll(() => vi.unstubAllEnvs());

// Valeurs de production, avant que les tests ne les réduisent.
const IMMEDIATE_RESERVE_PER_JOB_MS = immediateFulfillmentBudget.reservePerJobMs;
const PACING_DELAY_MS = appointmentFulfillmentPacing.delayMs;
const CLAIM_TURN_LIMIT_MS = appointmentFulfillmentPacing.claimTurnLimitMs;
const SHORT_RETRY_DELAYS_MS = [...postPaymentDeliveryRetry.delaysMs];

beforeEach(() => {
  resend.calls.length = 0;
  resend.script.length = 0;
  resend.failFor.clear();
  resend.rateLimitedFor.clear();
  resend.retryAfterSeconds = "1";
  resend.latencyMs = 0;
  database.latencyMs = 0;
  database.hangNextClaim = false;
  appointmentFulfillmentPacing.claimTurnLimitMs = CLAIM_TURN_LIMIT_MS;
  postPaymentDeliveryRetry.delaysMs = [0, 0];
  appointmentFulfillmentPacing.delayMs = 0;
  immediateFulfillmentBudget.reservePerJobMs = IMMEDIATE_RESERVE_PER_JOB_MS;
  vi.stubEnv("RESEND_API_KEY", "re_test_owner_first");
});

describe("envois après paiement — propriétaire d’abord, essais courts, alerte immédiate", () => {
  it("met en file la notification du propriétaire avant la confirmation et la facture", async () => {
    const { jobs } = memoryDatabase([]);
    await enqueueAppointmentFulfillment(42);
    expect(jobs.map(row => row.jobType)).toEqual(["owner", "confirmation", "invoice"]);
  });

  it("prévient le propriétaire (un seul email, sans doublon « SMS ») même quand l’email patient échoue, puis l’alerte dès ce premier échec", async () => {
    resend.failFor.add("patient@example.test");
    const { jobs } = memoryDatabase([job(1, "owner"), job(2, "confirmation"), job(3, "invoice")]);

    const result = await processDueAppointmentFulfillmentJobs();

    expect(result.processed).toBe(3);
    const ownerEmails = resend.calls.filter(call => (call.message.to as string[])[0] === "owner@example.test");
    expect(ownerEmails[0].message.subject).toMatch(/^Nouvelle réservation payée/);
    expect(ownerEmails.filter(call => String(call.message.subject).startsWith("Nouvelle réservation payée"))).toHaveLength(1);
    expect(subjects().some(subject => subject.includes("Réservation APT") || subject.includes("📱"))).toBe(false);
    // Email patient : 3 essais (1 + 2 essais courts) avec la même clé d’idempotence.
    const patientConfirmations = resend.calls.filter(call => String(call.message.subject).startsWith("Confirmation de réservation"));
    expect(patientConfirmations).toHaveLength(3);
    expect(new Set(patientConfirmations.map(call => call.options?.idempotencyKey))).toEqual(new Set(["appointment-confirmation-APTOWNER0001"]));
    // Alerte au propriétaire dès le premier échec, avec les coordonnées du patient.
    const alert = ownerEmails.find(call => String(call.message.subject).startsWith("Échec d’envoi après paiement"));
    expect(alert).toBeDefined();
    expect(String(alert?.message.text)).toContain("tentative 1 sur 3");
    expect(String(alert?.message.text)).toContain("Un nouvel essai automatique aura lieu");
    expect(String(alert?.message.text)).toContain("+33600000000");
    expect(jobs.find(row => row.jobType === "owner")?.status).toBe("completed");
    expect(jobs.find(row => row.jobType === "confirmation")?.status).toBe("retry");
  });

  it("réessaie brièvement une panne passagère et n’envoie qu’une fois", async () => {
    resend.script.push("5xx", "throw", "ok");
    await sendConfirmationEmail("patient@example.test", "Patient Test", "APTOWNER0001", new Date("2026-10-20T08:00:00Z"), 100, undefined, { idempotencyKey: "appointment-confirmation-APTOWNER0001" });
    expect(resend.calls).toHaveLength(3);
    expect(resend.calls.every(call => call.options?.idempotencyKey === "appointment-confirmation-APTOWNER0001")).toBe(true);
  });

  it("au premier refus définitif (adresse du patient refusée), l’alerte ne promet pas de nouvel essai automatique", async () => {
    resend.script.push("ok", "422");
    memoryDatabase([job(1, "owner"), job(2, "confirmation")]);

    await processDueAppointmentFulfillmentJobs();

    expect(subjects().filter(subject => subject.startsWith("Confirmation de réservation"))).toHaveLength(1);
    const alert = resend.calls.find(call => String(call.message.subject).startsWith("Échec d’envoi après paiement"));
    const text = String(alert?.message.text);
    expect(text).toContain("a été refusé par le service d’envoi (adresse email du patient refusée ou invalide");
    expect(text).toContain("Ce refus n’est pas passager : vérifiez l’adresse du patient et contactez-le directement.");
    expect(text).not.toContain("nouvel essai automatique");
    expect(text).toContain("+33600000000");
  });

  it("ne réessaie pas un refus définitif du fournisseur", async () => {
    resend.script.push("422");
    await expect(sendConfirmationEmail("patient@example.test", "Patient Test", "APTOWNER0001", new Date("2026-10-20T08:00:00Z"), 100))
      .rejects.toMatchObject({ message: "confirmation_email_failed", cause: expect.objectContaining({ message: expect.stringContaining("confirmation_email_rejected") }) });
    expect(resend.calls).toHaveLength(1);
  });

  it("signale l’échec de la notification propriétaire pour que son job soit réessayé", async () => {
    resend.failFor.add("owner@example.test");
    await expect(sendOwnerNotificationEmail("Patient Test", "patient@example.test", "+33600000000", "APTOWNER0001", new Date(), 100, { idempotencyKey: "appointment-owner-APTOWNER0001" }))
      .rejects.toThrow("owner_notification_failed");
    expect(resend.calls).toHaveLength(3);
    expect(resend.calls.every(call => call.options?.idempotencyKey === "appointment-owner-APTOWNER0001")).toBe(true);
    expect("sendOwnerNotificationSMS" in notificationsModule).toBe(false);
  });

  it("crée la notification propriétaire manquante d’un rendez-vous payé avant ce changement", async () => {
    const { inserts, jobs } = memoryDatabase([job(2, "confirmation")]);

    await processDueAppointmentFulfillmentJobs();

    expect(inserts).toEqual([{ jobType: "owner", conflict: "nothing" }]);
    expect(jobs.map(row => row.jobType)).toEqual(["confirmation", "owner"]);
    // Le job propriétaire créé est traité au passage suivant.
    await processDueAppointmentFulfillmentJobs();
    expect(subjects().filter(subject => subject.startsWith("Nouvelle réservation payée"))).toHaveLength(1);
  });

  it("espace les trois envois d’un même paiement pour rester sous la limite de débit de Resend (ABUS-03)", async () => {
    appointmentFulfillmentPacing.delayMs = 40;
    memoryDatabase([job(1, "owner"), job(2, "confirmation"), job(3, "invoice")]);

    await processDueAppointmentFulfillmentJobs();

    expect(subjects().map(subject => subject.split(" ")[0])).toEqual(["Nouvelle", "Confirmation", "Facture"]);
    const [owner, confirmation, invoice] = resend.calls.map(call => call.at);
    // setTimeout may fire a millisecond early on some platforms.
    expect(confirmation - owner).toBeGreaterThanOrEqual(38);
    expect(invoice - confirmation).toBeGreaterThanOrEqual(38);
  });

  it("garde cet espacement entre deux lots du passage planifié", async () => {
    appointmentFulfillmentPacing.delayMs = 40;
    memoryDatabase([job(1, "owner"), job(2, "confirmation"), job(3, "invoice")]);

    // The cron drains one job per batch here: each batch starts right after the previous one.
    const { processed } = await drainInBatches(() => processDueAppointmentFulfillmentJobs(1), { maxBatches: 5, budgetMs: 10_000 });

    expect(processed).toBe(3);
    const [owner, confirmation, invoice] = resend.calls.map(call => call.at);
    expect(confirmation - owner).toBeGreaterThanOrEqual(38);
    expect(invoice - confirmation).toBeGreaterThanOrEqual(38);
  });

  it("ne perd pas de pause quand deux traitements du même paiement se disputent ses envois (webhook et page de retour)", async () => {
    appointmentFulfillmentPacing.delayMs = 200;
    memoryDatabase([job(1, "owner"), job(2, "confirmation"), job(3, "invoice")]);

    const [first, second] = await Promise.all([processDueAppointmentFulfillmentJobs(), processDueAppointmentFulfillmentJobs()]);

    // Each job is sent once, by whichever processing claimed it first.
    expect(first.processed + second.processed).toBe(3);
    expect(subjects().map(subject => subject.split(" ")[0])).toEqual(["Nouvelle", "Confirmation", "Facture"]);
    const [owner, confirmation, invoice] = resend.calls.map(call => call.at);
    expect(confirmation - owner).toBeGreaterThanOrEqual(198);
    expect(invoice - confirmation).toBeGreaterThanOrEqual(198);
    // A turn whose job the other processing had already claimed gives its pause back.
    expect(invoice - owner).toBeLessThan(3 * 200);
  });

  it("un claim dont la requête en base ne répond pas ne bloque pas les autres traitements de l’instance", async () => {
    appointmentFulfillmentPacing.claimTurnLimitMs = 100;
    database.hangNextClaim = true;
    memoryDatabase([job(1, "owner")]);

    // Le claim du premier traitement reste sans réponse.
    void processDueAppointmentFulfillmentJobs();
    const startedAt = Date.now();
    const second = await processDueAppointmentFulfillmentJobs();

    // Le second prend son tour après la limite et envoie le job, une fois.
    expect(second.processed).toBe(1);
    expect(subjects().map(subject => subject.split(" ")[0])).toEqual(["Nouvelle"]);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(95);
  });
});

describe("envoi immédiat après paiement : la notification au médecin ne retient plus les envois au patient (ABUS-03, EXPL-01)", () => {
  // Délais réduits : retry-after de 0,3 s, essais courts à 0,1 puis 0,3 s, budget immédiat d’une seconde.
  const BUDGET_MS = 1_000;
  const ownerSends = () => resend.calls.filter(call => (call.message.to as string[])[0] === "owner@example.test");
  const sentAt = (subjectStart: string) => resend.calls.find(call => String(call.message.subject).startsWith(subjectStart))?.at;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    postPaymentDeliveryRetry.delaysMs = [100, 300];
    resend.retryAfterSeconds = "0.3";
    immediateFulfillmentBudget.reservePerJobMs = 200;
  });

  it("sous une limite de débit persistante, rend la notification à la file et envoie confirmation et facture dans le budget", async () => {
    resend.rateLimitedFor.add("owner@example.test");
    const { jobs } = memoryDatabase([job(1, "owner"), job(2, "confirmation"), job(3, "invoice")]);

    const startedAt = Date.now();
    await processDueAppointmentFulfillmentJobs(5, { deadlineAt: startedAt + BUDGET_MS });

    // La notification n’attend que jusqu’à sa part du budget, puis retourne à
    // la file telle quelle, due, sans que cet essai coupé compte.
    const owner = jobs.find(row => row.jobType === "owner")!;
    expect(owner).toMatchObject({ status: "queued", attempts: 0 });
    expect(owner.scheduledFor.getTime()).toBeLessThanOrEqual(Date.now());
    expect(ownerSends().length).toBeLessThan(6);
    expect(ownerSends().every(call => call.at - startedAt <= BUDGET_MS - 2 * 200)).toBe(true);
    // Le patient reçoit sa confirmation et sa facture avant la fin du budget immédiat.
    expect(jobs.filter(row => row.jobType !== "owner").map(row => row.status)).toEqual(["completed", "completed"]);
    expect(sentAt("Confirmation de réservation")! - startedAt).toBeLessThan(BUDGET_MS);
    expect(sentAt("Facture")! - startedAt).toBeLessThan(BUDGET_MS);
  });

  it("sous une limite persistante pour l’adresse du patient, rend confirmation et facture à la file sans alerter le médecin ; le passage suivant les envoie en comptant un seul essai", async () => {
    resend.rateLimitedFor.add("patient@example.test");
    const { jobs } = memoryDatabase([job(1, "owner"), job(2, "confirmation"), job(3, "invoice")]);

    await processDueAppointmentFulfillmentJobs(5, { deadlineAt: Date.now() + BUDGET_MS });

    expect(jobs.map(row => [row.jobType, row.status, row.attempts])).toEqual([["owner", "completed", 1], ["confirmation", "queued", 0], ["invoice", "queued", 0]]);
    expect(jobs.filter(row => row.jobType !== "owner").every(row => (row as Job & { startedAt?: Date | null }).startedAt === null)).toBe(true);
    // Le temps a manqué, l’envoi n’a pas échoué : pas d’alerte « Échec d’envoi ».
    expect(ownerSends().map(call => String(call.message.subject).split(" ")[0])).toEqual(["Nouvelle"]);

    resend.rateLimitedFor.clear();
    await processDueAppointmentFulfillmentJobs();

    expect(jobs.map(row => [row.jobType, row.status, row.attempts])).toEqual([["owner", "completed", 1], ["confirmation", "completed", 1], ["invoice", "completed", 1]]);
  });

  it("sans échéance (passage planifié, « Renvoyer »), la notification garde tous ses essais avant les envois suivants", async () => {
    resend.rateLimitedFor.add("owner@example.test");
    memoryDatabase([job(1, "owner"), job(2, "confirmation")]);

    const startedAt = Date.now();
    await processDueAppointmentFulfillmentJobs();

    expect(ownerSends()).toHaveLength(6);
    expect(sentAt("Confirmation de réservation")! - startedAt).toBeGreaterThanOrEqual(1_200);
  });

  it("quand la limite n’est que passagère, attend le retry-after et prévient toujours le médecin en premier", async () => {
    resend.script.push("429");
    const { jobs } = memoryDatabase([job(1, "owner"), job(2, "confirmation"), job(3, "invoice")]);

    await processDueAppointmentFulfillmentJobs(5, { deadlineAt: Date.now() + BUDGET_MS });

    expect(subjects().map(subject => subject.split(" ")[0])).toEqual(["Nouvelle", "Nouvelle", "Confirmation", "Facture"]);
    expect(resend.calls[1].at - resend.calls[0].at).toBeGreaterThanOrEqual(295);
    expect(jobs.map(row => row.status)).toEqual(["completed", "completed", "completed"]);
  });
});

describe("page de statut aux valeurs de production : un 429 passager garde son nouvel essai dans le budget (ABUS-03, EXPL-01)", () => {
  // Budget de 3 s de la page, pause de 600 ms, réserve de 800 ms, essais courts
  // à 0,5 puis 1,5 s, retry-after de 1 s ; 250 ms par appel à Resend et 50 ms
  // par requête en base, sur une horloge simulée.
  let simulatedClockEnd = 0;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    appointmentFulfillmentPacing.delayMs = PACING_DELAY_MS;
    postPaymentDeliveryRetry.delaysMs = [...SHORT_RETRY_DELAYS_MS];
    resend.latencyMs = 250;
    database.latencyMs = 50;
    // Instance au repos : son dernier envoi date de plus d’une pause, horloge
    // simulée d’un test précédent comprise.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: Math.max(Date.now(), simulatedClockEnd) + 10_000 });
  });

  afterEach(async () => {
    // Lets a processing a failed test left midway end before the next test.
    await vi.runAllTimersAsync();
    simulatedClockEnd = Date.now();
    vi.useRealTimers();
  });

  it.each([
    ["la notification au médecin", ["429"], "Nouvelle réservation payée"],
    ["la confirmation au patient", ["ok", "429"], "Confirmation de réservation"],
  ])("un seul 429 sur %s : nouvel essai après le retry-after, médecin et patient prévenus pendant l’attente de la page ; la facture, dont le tour vient après, reste en file sans tentative ni alerte", async (_target, script, retriedSubject) => {
    resend.script.push(...script);
    const { jobs } = memoryDatabase([job(1, "owner"), job(2, "confirmation"), job(3, "invoice")]);

    const page = processFulfillmentBestEffort(42, paymentStatusPageFulfillment.timeoutMs);
    await vi.advanceTimersByTimeAsync(paymentStatusPageFulfillment.timeoutMs);
    await page;

    // Pendant les 3 s d’attente de la page : la notification et la confirmation.
    expect(jobs.slice(0, 2).map(row => [row.jobType, row.status])).toEqual([["owner", "completed"], ["confirmation", "completed"]]);
    const retried = resend.calls.filter(call => String(call.message.subject).startsWith(retriedSubject));
    expect(retried).toHaveLength(2);
    expect(retried[1].at - retried[0].at).toBeGreaterThanOrEqual(1_000);
    // Le budget de la page écoulé, aucun envoi ne démarre plus après sa réponse :
    // la facture reste due, telle quelle, pour le traitement suivant.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(jobs.map(row => [row.jobType, row.status, row.attempts])).toEqual([["owner", "completed", 1], ["confirmation", "completed", 1], ["invoice", "queued", 0]]);
    expect(subjects().some(subject => subject.startsWith("Facture"))).toBe(false);
    expect(subjects().some(subject => subject.startsWith("Échec d’envoi"))).toBe(false);

    // Le passage suivant (webhook, tâche planifiée) l’envoie, en comptant un seul essai.
    const next = processDueAppointmentFulfillmentJobs();
    await vi.advanceTimersByTimeAsync(2_000);
    await next;
    expect(jobs.map(row => [row.jobType, row.status, row.attempts])).toEqual([["owner", "completed", 1], ["confirmation", "completed", 1], ["invoice", "completed", 1]]);
    expect(subjects().filter(subject => subject.startsWith("Facture"))).toHaveLength(1);
  });
});
