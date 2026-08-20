import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("recrutement mobilité — autre pays ciblé", () => {
  it("demande une précision pour l’option de mobilité mondiale et la transmet", async () => {
    const source = await readFile(new URL("./RecruitmentPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("otherTargetCountry: string");
    expect(source).toContain("recruitment-other-target-country");
    expect(source).toContain("targetCountries.includes(OTHER_TARGET_COUNTRY) && !form.otherTargetCountry.trim()");
    expect(source).toContain("Autre pays : ${form.otherTargetCountry.trim()}");
  });
});
