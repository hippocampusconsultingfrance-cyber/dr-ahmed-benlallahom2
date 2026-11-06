import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccounts, candidateSessions } from "../drizzle/schema";
import { hashCandidatePassword, hashCandidateToken } from "./candidateAuth";
import { candidateDeviceLabel, readableCandidateDeviceLabel } from "./candidateDeviceLabel";
import type { InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER, freshCandidateDb } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// REC-18 : l’espace candidat nomme chaque appareil connecté d’après son
// User-Agent (« Chrome (Windows) ») au lieu d’afficher l’en-tête brut ; les
// sessions enregistrées avant gardent leur libellé stocké, nommé de la même
// façon quand le portail les liste.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));

const { candidatePortalRouter } = await import("./candidatePortalRouter");

const USER_AGENTS = {
  chromeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.57",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  chromeIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  safariIpad: "Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:144.0) Gecko/20100101 Firefox/144.0",
  samsungAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  operaWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  headlessLinux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
};

describe("REC-18 — nom lisible de l’appareil d’une session candidate", () => {
  it.each([
    ["chromeWindows", "Chrome (Windows)"],
    ["edgeWindows", "Edge (Windows)"],
    ["safariIphone", "Safari (iPhone)"],
    ["chromeIphone", "Chrome (iPhone)"],
    ["safariIpad", "Safari (iPad)"],
    ["safariMac", "Safari (macOS)"],
    ["firefoxLinux", "Firefox (Linux)"],
    ["firefoxMac", "Firefox (macOS)"],
    ["samsungAndroid", "Samsung Internet (Android)"],
    ["chromeAndroid", "Chrome (Android)"],
    ["operaWindows", "Opera (Windows)"],
    ["chromebook", "Chrome (ChromeOS)"],
    ["headlessLinux", "Chrome (Linux)"],
  ] as const)("nomme %s « %s »", (agent, label) => {
    expect(candidateDeviceLabel(USER_AGENTS[agent])).toBe(label);
  });

  it("garde ce qu’il reconnaît d’un en-tête partiel, et rien d’un en-tête inconnu ou absent", () => {
    expect(candidateDeviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
    expect(candidateDeviceLabel("Firefox/144.0")).toBe("Firefox");
    for (const header of ["vitest", "curl/8.10.1", "", undefined, ["Chrome/141"]]) expect(candidateDeviceLabel(header), String(header)).toBeNull();
    // Nothing of the header is copied: a forged User-Agent cannot write its own text in the portal.
    expect(candidateDeviceLabel(`<script>alert(1)</script> ${USER_AGENTS.chromeWindows}`)).toBe("Chrome (Windows)");
  });

  it("nomme une session enregistrée avant comme une nouvelle, et garde le libellé d’une nouvelle", () => {
    expect(readableCandidateDeviceLabel(USER_AGENTS.chromeWindows.slice(0, 180))).toBe("Chrome (Windows)");
    expect(readableCandidateDeviceLabel(USER_AGENTS.samsungAndroid.slice(0, 180))).toBe("Samsung Internet (Android)");
    for (const stored of ["Navigateur inconnu", "vitest", "curl/8.10.1", null]) expect(readableCandidateDeviceLabel(stored), String(stored)).toBeNull();
    for (const agent of Object.values(USER_AGENTS)) {
      const label = candidateDeviceLabel(agent);
      expect(readableCandidateDeviceLabel(label), agent).toBe(label);
    }
    for (const label of ["Firefox", "Windows", "Safari (iPad)"]) expect(readableCandidateDeviceLabel(label)).toBe(label);
  });

  it("enregistre à la connexion le nom lisible, sans réécrire les sessions plus anciennes, listées sous leur nom lisible", async () => {
    state.db = freshCandidateDb();
    const db = state.db as InMemoryDrizzle;
    const password = "Nadia-Own-Strong-Password-2026";
    const account = db.seed(candidateAccounts, { email: "nadia@example.test", firstName: "Nadia", lastName: "Portal", passwordHash: await hashCandidatePassword(password), emailVerifiedAt: new Date(), termsAcceptedAt: new Date(), documentConsentAt: new Date() }) as { id: number };
    const before = db.seed(candidateSessions, { candidateId: account.id, tokenHash: hashCandidateToken("older-session-token-of-nadia", "session"), deviceLabel: USER_AGENTS.firefoxLinux.slice(0, 180), expiresAt: new Date(Date.now() + 3_600_000), lastSeenAt: new Date(Date.now() - 60_000) }) as { id: number };
    const unknown = db.seed(candidateSessions, { candidateId: account.id, tokenHash: hashCandidateToken("unknown-session-token-of-nadia", "session"), deviceLabel: "Navigateur inconnu", expiresAt: new Date(Date.now() + 3_600_000), lastSeenAt: new Date(Date.now() - 120_000) }) as { id: number };

    let cookie = "";
    const context = (userAgent?: string) => ({
      user: null,
      req: { protocol: "https", headers: { "x-forwarded-for": "203.0.113.40", ...(userAgent ? { "user-agent": userAgent } : {}), ...(cookie ? { cookie: `candidate_portal_session=${cookie}` } : {}) } },
      res: { cookie: (_name: string, value: string) => { cookie = value; }, clearCookie: () => undefined },
    } as never);

    await candidatePortalRouter.createCaller(context(USER_AGENTS.safariIphone)).login({ email: "nadia@example.test", password });
    const sessions = await candidatePortalRouter.createCaller(context(USER_AGENTS.safariIphone)).sessions();
    expect(sessions.map(session => [session.deviceLabel, session.current])).toEqual([["Safari (iPhone)", true], ["Firefox (Linux)", false], [null, false]]);
    // What was stored before is left as it was.
    expect(db.rows(candidateSessions).find(session => session.id === before.id)?.deviceLabel).toBe(USER_AGENTS.firefoxLinux);
    expect(db.rows(candidateSessions).find(session => session.id === unknown.id)?.deviceLabel).toBe("Navigateur inconnu");

    // Without a User-Agent, no French text is stored: the portal shows its translated "Browser".
    cookie = "";
    await candidatePortalRouter.createCaller(context()).login({ email: "nadia@example.test", password });
    expect(db.rows(candidateSessions).at(-1)?.deviceLabel).toBeNull();
  });
});
