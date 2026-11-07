import { createHmac, randomBytes, scryptSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccounts } from "../drizzle/schema";
import type { InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { CandidateClient, TEST_PEPPER, accountByEmail, freshCandidateDb } from "./testSupport/candidatePortal";

// INTL-12 — le mot de passe d’un candidat est haché sous sa forme NFKC : le
// même mot de passe saisi sur un autre clavier ou collé depuis une autre
// application (accent composé ou non, lettres pleine chasse) ouvre le même
// espace. Un hachage enregistré avant, sur la forme saisie, reste accepté et
// la connexion l’enregistre de nouveau sous la forme NFKC.

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const state = vi.hoisted(() => ({ db: null as unknown, breached: new Set<string>(), breachListDown: false }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined), candidateRequestIp: () => "203.0.113.1" }));
// The breach list is answered locally: the passwords of state.breached, or no answer at all.
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  isCompromisedPassword: vi.fn(async (password: string) => {
    if (state.breachListDown) throw new Error("candidate_password_breach_check_unavailable");
    return state.breached.has(password);
  }),
}));

const { hashCandidatePassword, matchCandidatePassword, verifyCandidatePassword } = await import("./candidateAuth");
const { candidatePortalRouter } = await import("./candidatePortalRouter");
type Api = ReturnType<typeof candidatePortalRouter.createCaller>;
const client = () => new CandidateClient<Api>(ctx => candidatePortalRouter.createCaller(ctx as Parameters<typeof candidatePortalRouter.createCaller>[0]), "203.0.113.40");

/** « é » written as « e » + a combining accent, as some keyboards and PDF copies give it. */
const decomposed = "Phrase de passe résistante 2026";
const composed = "Phrase de passe résistante 2026";
const fullWidth = "Ｐｈｒａｓｅ de passe résistante 2026";

/** A hash as stored before INTL-12: of the password as typed (fast scrypt parameters, which the record carries). */
function hashAsTyped(password: string) {
  const salt = randomBytes(16);
  const material = createHmac("sha256", process.env.CANDIDATE_AUTH_PEPPER!).update(password, "utf8").digest();
  const N = 1 << 10;
  const hash = scryptSync(material, salt, 64, { N, r: 8, p: 1 });
  return ["scrypt", N, 8, 1, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

// Up to six scrypt derivations with the production parameters per test: 30 s, as
// in candidateLoginThrottling.test.ts, so that a loaded machine does not time out.
describe("INTL-12 — mot de passe candidat normalisé en NFKC", () => {
  it("vérifie un mot de passe quelle que soit la forme Unicode de sa saisie", async () => {
    const stored = await hashCandidatePassword(decomposed);
    for (const typed of [decomposed, composed, fullWidth]) await expect(matchCandidatePassword(typed, stored), typed).resolves.toBe("normalized");
    await expect(verifyCandidatePassword("Phrase de passe resistante 2026", stored)).resolves.toBe(false);
  }, 30_000);

  it("accepte encore un hachage de la forme saisie, enregistré avant la normalisation, et seulement sous cette forme", async () => {
    const stored = hashAsTyped(decomposed);
    await expect(matchCandidatePassword(decomposed, stored)).resolves.toBe("as_typed");
    await expect(matchCandidatePassword(composed, stored)).resolves.toBe(false);
    await expect(matchCandidatePassword("Un tout autre mot de passe 2026", stored)).resolves.toBe(false);
  }, 30_000);

  describe("connexion", () => {
    const email = "nadia.nfkc@example.test";
    const db = () => state.db as InMemoryDrizzle;
    const seed = (passwordHash: string) => db().seed(candidateAccounts, { email, firstName: "Nadia", lastName: "Portal", passwordHash, emailVerifiedAt: new Date(), termsAcceptedAt: new Date(), documentConsentAt: new Date() });

    beforeEach(() => {
      state.db = freshCandidateDb();
      state.breached.clear();
      state.breachListDown = false;
    });

    it("enregistre de nouveau sous sa forme NFKC un mot de passe haché tel que saisi, qui ouvre ensuite l’espace sous toutes ses formes", async () => {
      const legacy = hashAsTyped(decomposed);
      seed(legacy);

      await expect(client().api.login({ email, password: decomposed })).resolves.toEqual({ success: true });
      const rehashed = accountByEmail(db(), email)!.passwordHash;
      expect(rehashed).not.toBe(legacy);
      await expect(matchCandidatePassword(composed, rehashed)).resolves.toBe("normalized");
      await expect(client().api.login({ email, password: composed })).resolves.toEqual({ success: true });
      await expect(client().api.login({ email, password: fullWidth })).resolves.toEqual({ success: true });
    }, 30_000);

    it("garde le hachage tel que saisi d’une copie en pleine chasse d’un mot de passe compromis, que sa forme ASCII n’ouvre donc jamais", async () => {
      const breached = "password1234567890";
      const fullWidthBreached = [...breached].map(character => String.fromCodePoint(character.codePointAt(0)! + 0xfee0)).join("");
      expect(fullWidthBreached.normalize("NFKC")).toBe(breached);
      state.breached.add(breached);
      const legacy = hashAsTyped(fullWidthBreached);
      seed(legacy);

      await expect(client().api.login({ email, password: breached })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(client().api.login({ email, password: fullWidthBreached })).resolves.toEqual({ success: true });
      expect(accountByEmail(db(), email)!.passwordHash).toBe(legacy);
      await expect(client().api.login({ email, password: breached })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }, 30_000);

    it("garde le hachage tel que saisi tant que la liste des mots de passe compromis ne répond pas, et le remplace ensuite", async () => {
      const legacy = hashAsTyped(decomposed);
      seed(legacy);

      state.breachListDown = true;
      await expect(client().api.login({ email, password: decomposed })).resolves.toEqual({ success: true });
      expect(accountByEmail(db(), email)!.passwordHash).toBe(legacy);
      state.breachListDown = false;
      await expect(client().api.login({ email, password: decomposed })).resolves.toEqual({ success: true });
      await expect(matchCandidatePassword(composed, accountByEmail(db(), email)!.passwordHash)).resolves.toBe("normalized");
    }, 30_000);

    it("garde le hachage d’un mot de passe déjà normalisé, et refuse un mauvais mot de passe sans y toucher", async () => {
      const stored = await hashCandidatePassword(composed);
      seed(stored);

      await expect(client().api.login({ email, password: decomposed })).resolves.toEqual({ success: true });
      expect(accountByEmail(db(), email)!.passwordHash).toBe(stored);
      await expect(client().api.login({ email, password: "Un tout autre mot de passe 2026" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      expect(accountByEmail(db(), email)!.passwordHash).toBe(stored);
    }, 30_000);
  });
});
