import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (...parts: string[]) => path.join(process.cwd(), ...parts);

describe("correctifs P0/P1 de réservation et candidature", () => {
  it("ne confirme pas un créneau avant le paiement et fixe l’expiration Checkout", async () => {
    const router = await readFile(projectFile("server", "routers.ts"), "utf8");
    expect(router).toContain("appointment_status, hold_expires_at");
    expect(router).toContain("'pending'}, ${'held'}");
    // L’expiration Checkout reste celle du maintien (arrondie à la seconde inférieure).
    expect(router).toContain("expires_at: stripeExpiresAt(holdExpiresAt)");
    const holds = await readFile(projectFile("server", "appointmentHolds.ts"), "utf8");
    expect(holds).toContain("return Math.floor(holdExpiresAt.getTime() / 1000);");
    expect(router).not.toContain("allow_promotion_codes: true");
  });

  it("applique les protections anti-bot avant le stockage d’une candidature", async () => {
    const server = await readFile(projectFile("server", "_core", "index.ts"), "utf8");
    expect(server).toContain("verifyCandidateTurnstile");
    expect(server).toContain("public_recruitment_apply");
    expect(server).toContain("public_recruitment_apply_duplicate_file");
    expect(server).toContain("express.json({ limit: \"1mb\" })");
    expect(server).toContain("express.urlencoded({ limit: \"1mb\", extended: true })");
  });

  it("utilise uniquement une origine publique définie côté serveur pour les liens sensibles", async () => {
    const [router, portal] = await Promise.all([
      readFile(projectFile("server", "routers.ts"), "utf8"),
      readFile(projectFile("server", "candidatePortalRouter.ts"), "utf8"),
    ]);
    expect(router).toContain("process.env.PUBLIC_APP_ORIGIN || \"https://drahmedbenlallahom.com\"");
    expect(portal).toContain("function portalOrigin(): string");
    expect(portal).not.toContain("portalOrigin(ctx.req)");
  });
});
