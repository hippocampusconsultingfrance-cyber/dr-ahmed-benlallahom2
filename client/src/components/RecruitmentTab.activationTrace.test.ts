import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./RecruitmentTab.tsx", import.meta.url), "utf8");

describe("traçabilité de l’activation candidat", () => {
  it("affiche l’état et l’échec du dernier e-mail d’activation dans la candidature", () => {
    expect(source).toContain("application.candidatePortalActivation?.eventType");
    expect(source).toContain("application.candidatePortalActivation?.attempts");
    expect(source).toContain("application.candidatePortalActivation?.failureCode");
  });
});
