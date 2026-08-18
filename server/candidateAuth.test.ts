import { describe, expect, it } from "vitest";
import {
  createCandidateToken,
  hashCandidatePassword,
  hashCandidateToken,
  normalizeCandidateEmail,
  validateCandidatePassword,
  verifyCandidatePassword,
} from "./candidateAuth";

describe("primitives de sécurité des comptes candidats", () => {
  it("normalise les emails et refuse les mots de passe insuffisants", () => {
    expect(normalizeCandidateEmail("  Candidate@Example.COM ")).toBe("candidate@example.com");
    expect(validateCandidatePassword("trop-court")).toBe("candidate_password_too_short");
  });

  it("stocke un mot de passe sous une dérivation lente et vérifiable", async () => {
    const stored = await hashCandidatePassword("Une phrase de passe suffisamment longue 2026");
    expect(stored).toMatch(/^scrypt\$/);
    await expect(verifyCandidatePassword("Une phrase de passe suffisamment longue 2026", stored)).resolves.toBe(true);
    await expect(verifyCandidatePassword("Mot de passe incorrect et suffisamment long", stored)).resolves.toBe(false);
  });

  it("ne conserve que des empreintes de jetons de session et de vérification", () => {
    const token = createCandidateToken();
    expect(token).toHaveLength(43);
    expect(hashCandidateToken(token, "session")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCandidateToken(token, "verification")).not.toBe(hashCandidateToken(token, "session"));
  });
});
