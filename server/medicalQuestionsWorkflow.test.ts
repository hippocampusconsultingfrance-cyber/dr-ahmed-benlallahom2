import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("workflow de questions-réponses médicales", () => {
  it("impose une validation humaine, MFA et consentement avant publication", async () => {
    const router = await readFile(path.join(process.cwd(), "server/medicalQuestionsRouter.ts"), "utf8");
    expect(router).toContain("await requireMfa(ctx)");
    expect(router).toContain("question.publicationConsent !== 1");
    expect(router).toContain("sendMedicalQuestionResponseEmail");
    expect(router).toContain("response_sent_and_published");
    expect(router).toContain("verifyCandidateTurnstile");
    expect(router).toContain("publicationConsent: z.literal(true)");
  });

  it("versionne un stockage privé sans coordonnées dans la requête publique", async () => {
    const schema = await readFile(path.join(process.cwd(), "drizzle/schema.ts"), "utf8");
    const router = await readFile(path.join(process.cwd(), "server/medicalQuestionsRouter.ts"), "utf8");
    expect(schema).toContain("export const medicalQuestions");
    expect(schema).toContain("publicationConsent");
    const publishedBlock = router.slice(router.indexOf("published: publicProcedure"), router.indexOf("admin: router"));
    expect(publishedBlock).toContain("publicQuestion");
    expect(publishedBlock).not.toContain("medicalQuestions.email");
    expect(publishedBlock).not.toContain("medicalQuestions.phone");
  });
});
