import { describe, expect, it } from "vitest";
import { candidatePortalCopy } from "@/pages/CandidatePortalPage";
import { fileSizeLabel } from "./fileSizeLabel";

// EXPL-02 — taille d’un document du coffre du candidat, comme celle du CV du
// formulaire de candidature : Ko et Mo en français, KB et MB en anglais, en
// allemand et en chinois, avec la virgule ou le point décimal de la langue.

const inVault = (bytes: number, language: keyof typeof candidatePortalCopy) => {
  const copy = candidatePortalCopy[language];
  return fileSizeLabel(bytes, copy.locale, copy).replace(/ /g, " ");
};

describe("taille d’un document du coffre du candidat", () => {
  it("donne un petit document en Ko en français, en KB dans les autres langues", () => {
    expect(inVault(2_048, "fr")).toBe("2 Ko");
    expect(inVault(2_048, "en")).toBe("2 KB");
    expect(inVault(2_048, "de")).toBe("2 KB");
    expect(inVault(2_048, "zh")).toBe("2 KB");
    // A few bytes read as 1, not 0; an empty file as 0.
    expect(inVault(300, "fr")).toBe("1 Ko");
    expect(inVault(0, "en")).toBe("0 KB");
  });

  it("passe en Mo au-delà de 1 024 Ko, avec la virgule décimale en français et en allemand", () => {
    expect(inVault(1_572_864, "fr")).toBe("1,5 Mo");
    expect(inVault(1_572_864, "en")).toBe("1.5 MB");
    expect(inVault(1_572_864, "de")).toBe("1,5 MB");
    expect(inVault(1_572_864, "zh")).toBe("1.5 MB");
  });

  it("arrondit au-dessus de la limite donnée, et à deux décimales au plus en dessous", () => {
    const limit = 4 * 1024 * 1024;
    const units = { kilobytes: "Ko", megabytes: "Mo" };
    expect(fileSizeLabel(limit + 1, "fr-FR", units, limit).replace(/ /g, " ")).toBe("4,01 Mo");
    expect(fileSizeLabel(limit + 1, "fr-FR", units).replace(/ /g, " ")).toBe("4 Mo");
  });
});
