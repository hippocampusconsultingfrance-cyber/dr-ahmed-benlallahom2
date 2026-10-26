import { describe, expect, it } from "vitest";
import { hiddenTextFlagLabel, hiddenTextFlags } from "@shared/candidateDocumentHiddenText";

// IA-01, IA-06 : un document du coffre dont du texte a été écarté avant que
// l’IA ne le lise le dit dans sa fiche, avec le nombre de caractères et un
// extrait, dans la langue de l’administrateur.

const french = { invisible: "{count} caractère(s) de texte invisible écarté(s) de l’analyse", unverifiable: "{count} caractère(s) non vérifiable(s) écarté(s) de l’analyse", excerpt: "extrait", compare: "ouvrir le document pour le comparer" };
const english = { invisible: "{count} character(s) of invisible text left out of the analysis", unverifiable: "{count} character(s) that could not be verified left out of the analysis", excerpt: "excerpt", compare: "open the document to compare" };

describe("texte écarté d’un document du coffre (IA-06)", () => {
  const hiddenText = { characters: 57, excerpt: "Licence DHA (Dubai Health Authority) en cours de validité.", unverifiable: { characters: 15, excerpt: "Yassine Belhadj" } };
  const extractedData = JSON.stringify({ documentKind: "Licence", hiddenText });

  it("range les nombres dans les points à vérifier, et l’extrait avec l’analyse", () => {
    expect(hiddenTextFlags(hiddenText)).toEqual(["invisible_text_ignored:57", "unverifiable_text_set_aside:15"]);
    expect(hiddenTextFlags({ characters: 0, excerpt: "" })).toEqual([]);
    expect(hiddenTextFlags(undefined)).toEqual([]);
  });

  it("les présente en clair, avec l’extrait, dans la langue de l’administrateur", () => {
    expect(hiddenTextFlagLabel("invisible_text_ignored:57", extractedData, french)).toBe("57 caractère(s) de texte invisible écarté(s) de l’analyse (extrait : « Licence DHA (Dubai Health Authority) en cours de validité. »), ouvrir le document pour le comparer");
    expect(hiddenTextFlagLabel("unverifiable_text_set_aside:15", extractedData, english)).toBe("15 character(s) that could not be verified left out of the analysis (excerpt : « Yassine Belhadj »), open the document to compare");
    // Without the analysis data, the count alone; any other flag is left to the caller.
    expect(hiddenTextFlagLabel("invisible_text_ignored:57", "not json", french)).toBe("57 caractère(s) de texte invisible écarté(s) de l’analyse, ouvrir le document pour le comparer");
    expect(hiddenTextFlagLabel("document_flou", extractedData, french)).toBeNull();
  });
});
