import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("candidature VVIP — erreurs publiques", () => {
  it("maps safe server errors to an actionable localized message", async () => {
    const source = await readFile(new URL("./VvipOffshorePage.tsx", import.meta.url), "utf8");

    expect(source).toContain("serverMessage.includes(\"CV\") ? t.fileError");
    expect(source).toContain("serverMessage.includes(\"informations\") ? t.required");
    expect(source).toContain("body.append(\"diplomaCountry\", submittedDiplomaCountry);");
    expect(source).toContain("resolveCountryForSubmission(form.diplomaCountry");
  });

  it("accepts valid mobile CV filenames even with a generic MIME type", async () => {
    const { isAcceptedVvipCvFile } = await import("./VvipOffshorePage");
    expect(isAcceptedVvipCvFile({ name: "cv-vvip.docx", size: 400_000, type: "application/octet-stream" })).toBe(true);
    expect(isAcceptedVvipCvFile({ name: "archive.zip", size: 400_000, type: "" })).toBe(false);
  });
});
