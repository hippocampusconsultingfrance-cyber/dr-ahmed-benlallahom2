import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(resolve(process.cwd(), "server/candidatePortalRouter.ts"), "utf8");

describe("limites d’accès du portail candidat", () => {
  it("borne les sessions affichées et révoquées à l’identité candidate de la session", () => {
    expect(routerSource).toContain("eq(candidateSessions.candidateId, candidate.id)");
    expect(routerSource).toContain("eq(candidateSessions.id, input.id), eq(candidateSessions.candidateId, candidate.id)");
  });

  it("borne la liste et le téléchargement de documents à l’identité candidate de la session", () => {
    expect(routerSource).toContain("where(eq(candidateDocuments.candidateId, candidate.id))");
    expect(routerSource).toContain("eq(candidateDocuments.id, input.id), eq(candidateDocuments.candidateId, candidate.id)");
  });
});
