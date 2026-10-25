import { describe, expect, it } from "vitest";
import { containsStream, pdfScanWork, readPdfStreamDictionaries, streamDictionaryText, UNCLEAR_PDF_STRUCTURE } from "./pdfStreamDictionaries";
import { libreOfficeCvPdf } from "./testing/pdfFixture";

function dictionaryOf(source: string, keyword = source.lastIndexOf(">>stream") + 2) {
  return streamDictionaryText(source, [keyword], readPdfStreamDictionaries(source, pdfScanWork(source)), pdfScanWork(source));
}

describe("REC-02 — dictionnaire de chaque flux, lu comme pdf.js", () => {
  it("rattache chaque flux d’un vrai PDF à son dictionnaire complet", () => {
    const source = libreOfficeCvPdf().toString("latin1");
    const keywords = Array.from(source.matchAll(/(?<!end)stream\r?\n/g), match => match.index);
    expect(keywords.length).toBeGreaterThanOrEqual(3);
    for (const keyword of keywords) {
      const text = dictionaryOf(source, keyword);
      expect(typeof text === "string" && text.startsWith("<<") && text.endsWith(">>") && text.includes("/Length")).toBe(true);
    }
  });

  it("garde tout le dictionnaire quand un faux « obj » ou une longue chaîne y est écrit", () => {
    expect(dictionaryOf("%PDF-1.7\n5 0 obj\n<</N 1/First 4/F/AHx 9 0 obj <</Length 3>>stream\nabc\nendstream\n")).toBe("<</N 1/First 4/F/AHx 9 0 obj <</Length 3>>");
    const long = `<</N 1/X(${"y".repeat(10_000)} obj)/First 4/Length 3>>`;
    expect(dictionaryOf(`%PDF-1.7\n5 0 obj ${long}stream\nabc\nendstream\n`)).toBe(long);
  });

  it("ne voit pas de flux dans un texte, mais refuse un flux qu’aucun « obj » n’atteint ou entouré de commentaires", () => {
    const text = "%PDF-1.7\n5 0 obj <</Length 30>>stream\nBT (live stream) Tj ET\n(upstream)\nendstream\n";
    expect(dictionaryOf(text, text.indexOf("live stream") + 5)).toBeNull();
    expect(dictionaryOf(text, text.indexOf("upstream") + 2)).toBeNull();
    expect(dictionaryOf("%PDF-1.7\n<</N 1/First 4>>stream\nabc\n")).toBe(UNCLEAR_PDF_STRUCTURE);
    const commented = "%PDF-1.7\n5 0 obj <</N 1/First 4/F/AHx>> % >> \nstream\nabc\n";
    expect(dictionaryOf(commented, commented.lastIndexOf("stream"))).toBe(UNCLEAR_PDF_STRUCTURE);
  });

  it("repère un flux dans le contenu d’un flux d’objets, pas un mot « stream » dans une chaîne", () => {
    const work = () => pdfScanWork("x".repeat(1_000));
    expect(containsStream("1 0 <</Length 3>>\nstream\nabc\nendstream", work())).toBe(true);
    expect(containsStream("1 0 <</Title (Live stream) /Author (Upstream)>>", work())).toBe(false);
  });
});
