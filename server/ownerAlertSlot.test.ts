import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appointments, securityEvents } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// Alertes uniques au propriétaire (ABUS-01, ABUS-02, CAND-15, REC-08) : leur
// créneau n’est gardé qu’une fois l’email délivré. Vraie notification au
// propriétaire ; seul le transport Resend est simulé.
type Outcome = "ok" | "rate_limited" | "down" | "quota";
const state = vi.hoisted(() => ({
  db: null as unknown,
  resend: "ok" as "ok" | "down" | "quota",
  once: [] as string[],
  calls: [] as Array<{ subject: string; outcome: string }>,
}));
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: {
      send: vi.fn(async (message: { subject: string }) => {
        const outcome = (state.once.shift() ?? state.resend) as Outcome;
        state.calls.push({ subject: message.subject, outcome });
        if (outcome === "rate_limited") return { data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" }, headers: { "retry-after": "0" } };
        if (outcome === "down") return { data: null, error: { name: "internal_server_error", statusCode: 503, message: "unavailable" }, headers: {} };
        if (outcome === "quota") return { data: null, error: { name: "daily_quota_exceeded", statusCode: 429, message: "You have reached your daily quota" }, headers: {} };
        return { data: { id: `email_${state.calls.length}` }, error: null, headers: {} };
      }),
    },
  })),
}));
vi.mock("./db", () => ({ getDb: async () => state.db }));

const { bookingChallengeRequired } = await import("./appointmentHoldAbuse");
const { countPublicFormDailyVolume, PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS } = await import("./publicFormRateLimit");
const { logSecurityEvent, OWNER_ALERT_RETRY_AFTER_FAILURE_MS } = await import("./candidateSecurity");
const { notifyOwnerOfAiAnalysisUnavailable } = await import("./recruitmentProcessing");

const MINUTE = 60_000;
const HELD_SLOTS_TITLE = "Réservations : au moins 6 créneaux retenus sans paiement";

function db() { return state.db as InMemoryDrizzle; }
const delivered = (prefix: string) => state.calls.filter(call => call.outcome === "ok" && call.subject.startsWith(prefix)).map(call => call.subject);
const attempts = (prefix: string) => state.calls.filter(call => call.subject.startsWith(prefix)).length;
const later = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

function seedHeldSlots(count: number) {
  for (let index = 0; index < count; index += 1) {
    db().seed(appointments, {
      trackingId: `APTALERT${String(index).padStart(4, "0")}`,
      customerName: "Patient Synthétique",
      customerEmail: `patient${index}@test.local`,
      customerPhone: "+33600000000",
      requestDetails: "Demande d’avis",
      appointmentDate: new Date(Date.now() + 3 * 24 * 60 * MINUTE + index * 30 * MINUTE),
      basePrice: "100.00",
      finalPrice: "100.00",
      paymentStatus: "pending",
      appointmentStatus: "held",
      holdExpiresAt: new Date(Date.now() + 30 * MINUTE),
    });
  }
}

const bookingAboveThreshold = () => bookingChallengeRequired(db() as never, null);
const highSeverityFailure = () => logSecurityEvent({ actorKind: "candidate", actorReference: "42", category: "candidate_login", outcome: "failed", severity: "high" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  state.db = createInMemoryDrizzle();
  state.resend = "ok";
  state.once = [];
  state.calls = [];
  vi.stubEnv("RESEND_API_KEY", "re_test_owner_alert_slots");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("alertes uniques au propriétaire : le créneau n’est gardé qu’une fois l’email délivré", () => {
  it("un 429 passager de Resend : l’alerte « créneaux retenus » part au nouvel essai, et une seule fois", async () => {
    seedHeldSlots(6);
    state.once = ["rate_limited"];

    await expect(bookingAboveThreshold()).resolves.toBe(true);
    expect(state.calls.map(call => call.outcome)).toEqual(["rate_limited", "ok"]);
    expect(delivered("Réservations")).toEqual([HELD_SLOTS_TITLE]);

    await bookingAboveThreshold();
    later(OWNER_ALERT_RETRY_AFTER_FAILURE_MS + 1_000);
    await bookingAboveThreshold();
    expect(attempts("Réservations")).toBe(2);
  });

  it("Resend en panne : le créneau est rendu, et une réservation quelques minutes plus tard délivre l’alerte", async () => {
    seedHeldSlots(6);
    state.resend = "down";

    await expect(bookingAboveThreshold()).resolves.toBe(true);
    expect(attempts("Réservations")).toBe(1);
    expect(delivered("Réservations")).toEqual([]);
    // Pendant le court délai, les réservations suivantes ne relancent pas Resend.
    await bookingAboveThreshold();
    expect(attempts("Réservations")).toBe(1);

    state.resend = "ok";
    later(OWNER_ALERT_RETRY_AFTER_FAILURE_MS + 1_000);
    await bookingAboveThreshold();
    expect(delivered("Réservations")).toEqual([HELD_SLOTS_TITLE]);
    // Délivrée : plus d’autre email pour la journée.
    later(10 * MINUTE);
    await bookingAboveThreshold();
    expect(attempts("Réservations")).toBe(2);
  });

  it("des réservations simultanées pendant un envoi qui échoue ne bloquent pas l’alerte pour la journée", async () => {
    seedHeldSlots(6);
    state.resend = "down";

    await Promise.all(Array.from({ length: 5 }, () => bookingAboveThreshold()));
    expect(attempts("Réservations")).toBe(1);

    state.resend = "ok";
    later(OWNER_ALERT_RETRY_AFTER_FAILURE_MS + 1_000);
    await Promise.all(Array.from({ length: 5 }, () => bookingAboveThreshold()));
    expect(delivered("Réservations")).toEqual([HELD_SLOTS_TITLE]);
  });

  it("volume inhabituel (ABUS-01) : une panne au franchissement du seuil ne supprime pas l’alerte du jour", async () => {
    const threshold = PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS.gdpr;
    for (let index = 0; index < threshold; index += 1) await expect(countPublicFormDailyVolume("gdpr")).resolves.toBe(true);
    state.resend = "down";

    await expect(countPublicFormDailyVolume("gdpr")).resolves.toBe(false);
    expect(delivered("Volume inhabituel")).toEqual([]);

    state.resend = "ok";
    later(OWNER_ALERT_RETRY_AFTER_FAILURE_MS + 1_000);
    await expect(countPublicFormDailyVolume("gdpr")).resolves.toBe(false);
    await countPublicFormDailyVolume("gdpr");
    expect(delivered("Volume inhabituel")).toEqual([`Volume inhabituel : plus de ${threshold} demandes RGPD en 24 heures`]);
    expect(attempts("Volume inhabituel")).toBe(2);
  });

  it("alerte de sécurité (CAND-15) : non délivrée, elle part avec un événement suivant, avec le compte de toute la salve", async () => {
    state.resend = "down";
    await highSeverityFailure();
    await highSeverityFailure();
    expect(attempts("Alerte sécurité — candidate_login")).toBe(1);

    state.resend = "ok";
    later(OWNER_ALERT_RETRY_AFTER_FAILURE_MS + 1_000);
    await highSeverityFailure();
    await highSeverityFailure();
    expect(delivered("Alerte sécurité — candidate_login")).toHaveLength(1);
    expect(attempts("Alerte sécurité — candidate_login")).toBe(2);
    expect(db().rows(securityEvents)).toHaveLength(4);
  });

  it("quota Resend épuisé : une tentative toutes les quelques minutes au plus, sans boucle d’alertes", async () => {
    state.resend = "quota";
    await highSeverityFailure();
    // L’alerte refusée journalise le quota, dont l’alerte est refusée à son tour : la chaîne s’arrête là.
    expect(state.calls.map(call => call.subject)).toEqual([
      "Alerte sécurité — candidate_login — Hippocampus Consulting",
      "Alerte sécurité — resend_quota_exceeded — Hippocampus Consulting",
    ]);
    for (let index = 0; index < 5; index += 1) await highSeverityFailure();
    expect(state.calls).toHaveLength(2);
    expect(db().rows(securityEvents).filter(event => event.category === "resend_quota_exceeded")).toHaveLength(2);

    later(OWNER_ALERT_RETRY_AFTER_FAILURE_MS + 1_000);
    await highSeverityFailure();
    expect(attempts("Alerte sécurité — candidate_login")).toBe(2);
  });

  it("analyse IA indisponible (REC-08) : une alerte perdue est renvoyée au refus suivant, puis une seule fois par jour", async () => {
    state.resend = "down";
    await expect(notifyOwnerOfAiAnalysisUnavailable()).resolves.toBe(false);
    await expect(notifyOwnerOfAiAnalysisUnavailable()).resolves.toBe(false);
    expect(attempts("Recrutement : analyse IA")).toBe(1);

    state.resend = "ok";
    later(OWNER_ALERT_RETRY_AFTER_FAILURE_MS + 1_000);
    await expect(notifyOwnerOfAiAnalysisUnavailable()).resolves.toBe(true);
    later(60 * MINUTE);
    await expect(notifyOwnerOfAiAnalysisUnavailable()).resolves.toBe(false);
    expect(delivered("Recrutement : analyse IA")).toHaveLength(1);
  });
});
