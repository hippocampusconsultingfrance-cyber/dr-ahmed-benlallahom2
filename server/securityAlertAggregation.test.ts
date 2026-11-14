import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateSecurityRateLimits, securityEvents } from "../drizzle/schema";
import {
  createInMemoryDrizzle,
  type InMemoryDrizzle,
} from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const state = vi.hoisted(() => ({
  db: null as unknown,
  notifyOwner: vi.fn(
    async (_payload: { title: string; content: string }) => true
  ),
}));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: state.notifyOwner }));

const { logSecurityEvent, SECURITY_ALERT_EMAIL_WINDOW_MS } = await import(
  "./candidateSecurity"
);

function db() {
  return state.db as InMemoryDrizzle;
}
const failure = (category = "candidate_login") =>
  logSecurityEvent({
    actorKind: "candidate",
    actorReference: "42",
    category,
    outcome: "failed",
    severity: "high",
    ipHash: "a".repeat(64),
  });

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
    expect(title).toBe(
      "Alerte sécurité — Connexion candidat refusée : email ou mot de passe erroné — Hippocampus Consulting"
    );
    expect(content).toMatch(
      /^\d+ évènements? « Connexion candidat refusée : email ou mot de passe erroné » sur la dernière heure, le dernier le /
    );
    // The account the passwords were tried on, not the one that tried them.
    expect(content).toContain("sur le compte candidat n° 42.");
    expect(content).not.toContain("par le compte candidat");
    expect(content).toContain(
      `au moins ${SECURITY_ALERT_EMAIL_WINDOW_MS / 60_000} minutes`
    );
    expect(content).not.toContain("a".repeat(64));
  });

  it("dit en phrases ce qui se passe, l’heure de Paris, quoi faire et où regarder, les codes à la fin (MAIL-04)", async () => {
    vi.useFakeTimers({
      now: new Date("2026-11-12T14:05:00Z"),
      toFake: ["Date"],
    });
    try {
      for (let index = 0; index < 3; index += 1) {
        await logSecurityEvent({
          actorKind: "admin",
          actorReference: "user_2abcHarnessOwner",
          category: "admin_mfa_verify",
          outcome: "failed",
          severity: "high",
          ipHash: "b".repeat(64),
        });
      }
    } finally {
      vi.useRealTimers();
    }
    expect(state.notifyOwner).toHaveBeenCalledTimes(1);
    const { title, content } = state.notifyOwner.mock.calls[0][0];
    expect(title).toBe(
      "Alerte sécurité — Code de sécurité admin erroné ou expiré — Hippocampus Consulting"
    );
    const lines = content.split("\n");
    // The first of the burst is the one that sends the email: it counts itself.
    expect(lines[0]).toBe(
      "1 évènement « Code de sécurité admin erroné ou expiré » sur la dernière heure, le dernier le 12 novembre 2026 à 15:05 (heure de Paris), par votre compte administrateur."
    );
    expect(lines[1]).toContain(
      "Changez-le dans Clerk, puis, dans l’onglet « Sécurité », cliquez sur « Révoquer toutes les autres sessions »."
    );
    expect(lines[2]).toBe(
      "Journal de sécurité : https://drahmedbenlallahom.com/admin?tab=security"
    );
    expect(lines.at(-1)).toBe(
      `Pour le journal : code admin_mfa_verify · réseau ${"b".repeat(12)}….`
    );
    // The administrator's Clerk identifier is not written.
    expect(content).not.toContain("user_2abcHarnessOwner");
  });

  it("compte les échecs de connexion consécutifs d’un compte candidat, dont seul le dixième est élevé (MAIL-04)", async () => {
    vi.useFakeTimers({
      now: new Date("2026-11-12T14:05:00Z"),
      toFake: ["Date"],
    });
    try {
      // As the sign-in route logs them: warnings, every tenth failure high.
      for (
        let failedLoginCount = 1;
        failedLoginCount <= 10;
        failedLoginCount += 1
      ) {
        await logSecurityEvent({
          actorKind: "candidate",
          actorReference: "42",
          category: "candidate_login",
          outcome: "failed",
          severity: failedLoginCount % 10 === 0 ? "high" : "warning",
          ipHash: "d".repeat(64),
          metadata: { failedLoginCount },
        });
      }
    } finally {
      vi.useRealTimers();
    }
    expect(state.notifyOwner).toHaveBeenCalledTimes(1);
    const lines = state.notifyOwner.mock.calls[0][0].content.split("\n");
    expect(lines[0]).toBe(
      "10 échecs de connexion consécutifs sur le compte candidat n° 42 (« Connexion candidat refusée : email ou mot de passe erroné »), le dernier le 12 novembre 2026 à 15:05 (heure de Paris)."
    );
    expect(lines[1]).toContain(
      "Quelqu’un essaie des mots de passe sur ce compte candidat"
    );
  });

  it("dit d’un visiteur qu’il n’est pas connecté, son empreinte seulement avec les codes", async () => {
    await logSecurityEvent({
      actorKind: "anonymous",
      actorReference: "c".repeat(64),
      category: "candidate_login_challenge_enabled",
      outcome: "alert",
      severity: "high",
    });
    const { content } = state.notifyOwner.mock.calls[0][0];
    expect(content).toContain(
      "« Nombreux essais sur un compte candidat : vérification anti-robot désormais demandée »"
    );
    expect(content).toContain("par un visiteur non connecté.");
    expect(content.split("\n").at(-1)).toBe(
      `Pour le journal : code candidate_login_challenge_enabled · empreinte ${"c".repeat(12)}….`
    );
  });

  it("alerte séparément chaque catégorie et ignore les événements non critiques ou autorisés", async () => {
    await failure("candidate_login");
    await failure("admin_mfa_verify");
    await logSecurityEvent({
      actorKind: "anonymous",
      category: "candidate_register_turnstile",
      outcome: "blocked",
      severity: "warning",
    });
    await logSecurityEvent({
      actorKind: "candidate",
      category: "candidate_login",
      outcome: "allowed",
      severity: "high",
    });
    expect(state.notifyOwner.mock.calls.map(call => call[0].title)).toEqual([
      expect.stringContaining("Connexion candidat refusée"),
      expect.stringContaining("Code de sécurité admin erroné"),
    ]);
  });

  it("envoie un nouvel email récapitulatif une fois la fenêtre écoulée", async () => {
    for (let index = 0; index < 5; index += 1) await failure();
    expect(state.notifyOwner).toHaveBeenCalledTimes(1);
    // Age the aggregation slot as if the window had passed.
    for (const row of db().rows(candidateSecurityRateLimits)) {
      row.windowStartedAt = new Date(
        Date.now() - SECURITY_ALERT_EMAIL_WINDOW_MS - 1000
      );
      row.blockedUntil = new Date(Date.now() - 1000);
    }
    await failure();
    expect(state.notifyOwner).toHaveBeenCalledTimes(2);
    expect(state.notifyOwner.mock.calls[1][0].content).toMatch(
      /^6 évènements « Connexion candidat refusée : email ou mot de passe erroné » sur la dernière heure, /
    );
  });

  it("n’empêche jamais l’enregistrement de l’événement si l’envoi échoue", async () => {
    state.notifyOwner.mockRejectedValueOnce(new Error("resend down"));
    await expect(failure()).resolves.toBeUndefined();
    expect(db().rows(securityEvents)).toHaveLength(1);
  });
});
