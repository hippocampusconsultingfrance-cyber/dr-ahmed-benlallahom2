import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("candidature VVIP — erreurs publiques", () => {
  it("maps safe server errors to an actionable localized message", async () => {
    const { vvipOffshoreCopy, vvipSubmissionErrorMessage } = await import("./VvipOffshorePage");
    const cvRefused = { error: "Le contenu du CV ne correspond pas à un document PDF ou DOCX valide.", code: "cv_validation_signature_invalid" };
    expect(vvipSubmissionErrorMessage(cvRefused, "fr")).toBe(cvRefused.error);
    expect(vvipSubmissionErrorMessage(cvRefused, "en")).toBe(vvipOffshoreCopy.en.fileError);
    expect(vvipSubmissionErrorMessage({ error: "Échec base de données: relation cv_applications" }, "de")).toBe(vvipOffshoreCopy.de.genericError);
    expect(vvipSubmissionErrorMessage({}, "fr")).toBe(vvipOffshoreCopy.fr.genericError);

    const source = await readFile(new URL("./VvipOffshorePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("resolveCountryForSubmission(form.diplomaCountry");
    expect(source).toContain('typeof payload.trackingId !== "string"');
    expect(source).not.toContain('payload.trackingId || "VVIP-OK"');
  });

  it("accepts valid mobile CV filenames even with a generic MIME type", async () => {
    const { isAcceptedVvipCvFile } = await import("./VvipOffshorePage");
    expect(isAcceptedVvipCvFile({ name: "cv-vvip.docx", size: 400_000, type: "application/octet-stream" })).toBe(true);
    expect(isAcceptedVvipCvFile({ name: "archive.zip", size: 400_000, type: "" })).toBe(false);
  });

  it("uses checkbox environments and sends every selected environment", async () => {
    const source = await readFile(new URL("./VvipOffshorePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("environments: string[]");
    expect(source).toContain("toggleEnvironment");
    expect(source).toContain("type=\"checkbox\"");

    const { VVIP_ENVIRONMENTS, buildVvipApplicationFormData, createInitialForm } = await import("./VvipOffshorePage");
    const environments = VVIP_ENVIRONMENTS.map(environment => environment.value);
    const body = buildVvipApplicationFormData({
      form: { ...createInitialForm("fr"), environments },
      cv: new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" }),
      specialty: "Médecin urgentiste (ATLS / ACLS)",
      diplomaCountry: "Maroc",
      turnstileToken: "turnstile-token",
    });
    expect(JSON.parse(String(body.get("targetCountries")))).toEqual(environments);
    expect(body.get("diplomaCountry")).toBe("Maroc");
  });

  it("rend le sélecteur de CV utilisable au clavier et correctement décrit", async () => {
    const source = await readFile(new URL("./VvipOffshorePage.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="vvip-cv"');
    expect(source).toContain('htmlFor="vvip-cv"');
    expect(source).toContain('className="peer sr-only"');
    expect(source).toContain('aria-describedby="vvip-cv-hint"');
    expect(source).toContain('peer-focus-visible:ring-2');
    expect(source).toContain('autoComplete="given-name"');
    expect(source).toContain('autoComplete="family-name"');
  });
});
