import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const serverSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");

describe("fiabilité du dépôt de candidature", () => {
  it("retourne une erreur de vérification exploitable même si le journal de sécurité échoue", () => {
    expect(serverSource).toContain('catch (protectionError)');
    expect(serverSource).toContain('.catch(securityLogError => console.error("Recruitment protection log error:", safeErrorName(securityLogError)))');
    expect(serverSource).toContain('res.status(400).json({ error: "La vérification de sécurité doit être renouvelée avant l’envoi." })');
  });

  it("ne transforme pas une candidature déjà enregistrée en erreur si une file différée échoue", () => {
    expect(serverSource).toContain("const queueResults = await Promise.allSettled([");
    expect(serverSource).toContain('console.error("Recruitment follow-up queue error:", safeErrorName(queueResult.reason))');
    expect(serverSource).toContain("res.status(201).json({ success: true, trackingId })");
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
