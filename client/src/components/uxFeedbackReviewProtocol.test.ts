import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("protocole de revue UX", () => {
  it("impose consentement, minimisation, anonymisation et décisions traçables", async () => {
    const protocol = await readFile(path.resolve(process.cwd(), "UX_FEEDBACK_REVIEW_PROTOCOL.md"), "utf8");

    expect(protocol).toContain("ne pas précocher l’accord");
    expect(protocol).toContain("Anonymisation");
    expect(protocol).toContain("donnée de santé");
    expect(protocol).toContain("Cycle de revue trimestriel");
    expect(protocol).toContain("EXTERNAL_VALIDATION_REGISTER.md");
  });
});
