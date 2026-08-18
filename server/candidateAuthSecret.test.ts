import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("secret de sécurité des accès candidats", () => {
  it("produit une signature serveur non vide pour le contrôle de santé candidat", () => {
    const pepper = process.env.CANDIDATE_AUTH_PEPPER;
    expect(pepper).toBeTruthy();
    expect(pepper?.length).toBeGreaterThanOrEqual(32);

    const signature = createHmac("sha256", pepper as string)
      .update("candidate-auth-healthcheck")
      .digest("hex");
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });
});
