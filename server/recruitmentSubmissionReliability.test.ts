import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const serverSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const securitySource = readFileSync(new URL("./candidateSecurity.ts", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const traceSource = readFileSync(new URL("./recruitmentEmailTrace.ts", import.meta.url), "utf8");

describe("fiabilité du dépôt de candidature", () => {
  it("retourne une erreur de vérification exploitable même si le journal de sécurité échoue", () => {
    expect(serverSource).toContain('catch (protectionError)');
    expect(serverSource).toContain('.catch(securityLogError => console.error("Recruitment protection log error:", safeErrorName(securityLogError)))');
    expect(serverSource).toContain('protectionError.message === "candidate_security_rate_limited"');
    expect(serverSource).toContain('"La vérification de sécurité doit être renouvelée avant l’envoi."');
    expect(serverSource).toContain('"Trop de tentatives ont été effectuées. Patientez une heure avant de réessayer."');
  });

  it("valide Turnstile avant de compter la tentative et récupère après un seuil assoupli", () => {
    const turnstilePosition = serverSource.indexOf("await verifyCandidateTurnstile");
    const rateLimitPosition = serverSource.indexOf('await enforcePersistentRateLimit({ action: "public_recruitment_apply"');
    expect(turnstilePosition).toBeGreaterThan(-1);
    expect(rateLimitPosition).toBeGreaterThan(turnstilePosition);
    expect(serverSource).toContain("maxAttempts: 10");
    expect(serverSource).toContain("blockMs: 60 * 60 * 1000");
    // Relaxed-threshold recovery is covered behaviourally in candidateLoginThrottling.test.ts.
    expect(securitySource).toContain("gt(table.attemptCount, input.maxAttempts)");
  });

  it("ne transforme pas une candidature déjà enregistrée en erreur si une file différée échoue", () => {
    expect(serverSource).toContain("const queueResults = await Promise.allSettled([");
    expect(serverSource).toContain('console.error("Recruitment follow-up queue error:", safeErrorName(queueResult.reason))');
    expect(serverSource).toContain("res.status(201).json({ success: true, trackingId })");
  });

  it("conserve une preuve rattachée à la candidature pour l'email de confirmation", () => {
    expect(serverSource).toContain("sendTrackedCvApplicationConfirmationEmail");
    expect(traceSource).toContain("application_confirmation");
    expect(traceSource).toContain("applicationId: input.applicationId");
  });

  it("journalise l’étape technique sans inclure le message potentiellement sensible", () => {
    expect(serverSource).toContain('recruitmentStage = "storage-upload"');
    expect(serverSource).toContain('recruitmentStage = "application-insert"');
    expect(serverSource).toContain("...safeErrorMetadata(error)");
    expect(serverSource).not.toContain("message: safeText(candidate.message)");
  });

  it("laisse Vercel charger le client Blob depuis ses dépendances serveur", () => {
    const buildScript = JSON.parse(packageSource).scripts.build as string;
    expect(buildScript).toMatch(/server\/vercelEntry\.ts --platform=node --packages=external --bundle/);
  });
});
