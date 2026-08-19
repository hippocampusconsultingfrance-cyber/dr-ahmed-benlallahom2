import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/components/CandidateDocumentsAdminTab.tsx"), "utf8");

describe("actions mobiles de la revue documentaire", () => {
  it("préserve des actions tactiles et des métadonnées sans débordement", () => {
    expect(source).toContain("CardDescription className=\"mt-1 break-words\"");
    expect(source).toContain("flex w-full flex-wrap gap-2 sm:w-auto");
    expect(source).toContain("min-h-10 flex-1 sm:flex-none");
  });
});
