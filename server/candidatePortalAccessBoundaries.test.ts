import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(resolve(process.cwd(), "server/candidatePortalRouter.ts"), "utf8");
const serverSource = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");

describe("limites d’accès du portail candidat", () => {
  it("borne les sessions affichées et révoquées à l’identité candidate de la session", () => {
    expect(routerSource).toContain("eq(candidateSessions.candidateId, candidate.id)");
    expect(routerSource).toContain("eq(candidateSessions.id, input.id), eq(candidateSessions.candidateId, candidate.id)");
  });

  it("borne la liste et le téléchargement de documents à l’identité candidate de la session", () => {
    expect(routerSource).toContain("where(eq(candidateDocuments.candidateId, candidate.id))");
    // The only candidate download is the decrypting route (CAND-17: the tRPC signed-URL download was removed).
    expect(routerSource).not.toContain("documentDownload");
    expect(serverSource).toContain("${candidateDocuments.id} = ${documentId} AND ${candidateDocuments.candidateId} = ${candidate.id}");
  });
});
