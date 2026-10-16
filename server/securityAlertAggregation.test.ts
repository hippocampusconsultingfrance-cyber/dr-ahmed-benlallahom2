import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateSecurityRateLimits, securityEvents } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const state = vi.hoisted(() => ({ db: null as unknown, notifyOwner: vi.fn(async (_payload: { title: string; content: string }) => true) }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: state.notifyOwner }));

const { logSecurityEvent, SECURITY_ALERT_EMAIL_WINDOW_MS } = await import("./candidateSecurity");

function db() { return state.db as InMemoryDrizzle; }
const failure = (category = "candidate_login") => logSecurityEvent({ actorKind: "candidate", actorReference: "42", category, outcome: "failed", severity: "high", ipHash: "a".repeat(64) });

beforeEach(() => {
  state.db = createInMemoryDrizzle();
  state.notifyOwner.mockClear();
});

describe("CAND-15 — agrégation des alertes de sécurité envoyées au propriétaire", () => {
  it("n’envoie qu’un email pour une salve de 30 échecs d’une même catégorie, avec le compte concerné", async () => {
    await Promise.all(Array.from({ length: 30 }, () => failure()));
    expect(db().rows(securityEvents)).toHaveLength(30);
    expect(state.notifyOwner).toHaveBeenCalledTimes(1);
    const { title, content } = state.notifyOwner.mock.calls[0][0];
    expect(title).toContain("candidate_login");
    expect(content).toMatch(/Événements de ce type sur la dernière heure : \d+\./);
    expect(content).toContain("compte candidat n° 42");
    expect(content).toContain(`au moins ${SECURITY_ALERT_EMAIL_WINDOW_MS / 60_000} minutes`);
    expect(content).not.toContain("a".repeat(64));
  });

  it("alerte séparément chaque catégorie et ignore les événements non critiques ou autorisés", async () => {
    await failure("candidate_login");
    await failure("admin_mfa_verify");
    await logSecurityEvent({ actorKind: "anonymous", category: "candidate_register_turnstile", outcome: "blocked", severity: "warning" });
    await logSecurityEvent({ actorKind: "candidate", category: "candidate_login", outcome: "allowed", severity: "high" });
    expect(state.notifyOwner.mock.calls.map(call => call[0].title)).toEqual([
      expect.stringContaining("candidate_login"),
      expect.stringContaining("admin_mfa_verify"),
    ]);
  });

  it("envoie un nouvel email récapitulatif une fois la fenêtre écoulée", async () => {
    for (let index = 0; index < 5; index += 1) await failure();
    expect(state.notifyOwner).toHaveBeenCalledTimes(1);
    // Age the aggregation slot as if the window had passed.
    for (const row of db().rows(candidateSecurityRateLimits)) {
      row.windowStartedAt = new Date(Date.now() - SECURITY_ALERT_EMAIL_WINDOW_MS - 1000);
      row.blockedUntil = new Date(Date.now() - 1000);
    }
    await failure();
    expect(state.notifyOwner).toHaveBeenCalledTimes(2);
    expect(state.notifyOwner.mock.calls[1][0].content).toContain("Événements de ce type sur la dernière heure : 6.");
  });

  it("n’empêche jamais l’enregistrement de l’événement si l’envoi échoue", async () => {
    state.notifyOwner.mockRejectedValueOnce(new Error("resend down"));
    await expect(failure()).resolves.toBeUndefined();
    expect(db().rows(securityEvents)).toHaveLength(1);
  });
});
