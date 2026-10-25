import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { candidateDocumentValidationMessage, safeCandidateDocumentName, validateCandidateDocument } from "./candidateDocumentValidation";
import { DOCUMENT_DECOMPRESSION_LIMITS } from "./documentDecompressionLimits";
import { classicPdf, libreOfficeChineseCvPdf, libreOfficeCvPdf, packPdfIntoObjectStream, pathologicalPdfs, pngPredict, saveIncrementally, withObjectInStreamData } from "./testing/pdfFixture";

describe("validation des documents candidats", () => {
  it("nettoie les noms de fichiers et rejette les chemins", () => {
    expect(safeCandidateDocumentName("../../passeport client.pdf")).not.toContain("/");
    expect(safeCandidateDocumentName("../../passeport client.pdf")).not.toContain("\\");
  });

  it("accepte une image PNG de signature valide", () => {
    const buffer = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 1)]);
    const result = validateCandidateDocument({ buffer, mimeType: "image/png", originalName: "diplome.png", size: buffer.length });
    expect(result.checksum).toHaveLength(64);
    expect(result.mimeType).toBe("image/png");
  });

  it("rejette un type déclaré dont la signature ne correspond pas", () => {
    const buffer = Buffer.concat([Buffer.from("%PDF-1.7\n/Type /Page\n"), Buffer.alloc(300, 1)]);
    expect(() => validateCandidateDocument({ buffer, mimeType: "image/png", originalName: "document.png", size: buffer.length })).toThrow("candidate_document_signature_invalid");
  });
});

describe("REC-02 — PDF du coffre : mêmes lectures que pour les CV", () => {
  const validate = (buffer: Buffer) => validateCandidateDocument({ buffer, mimeType: "application/pdf", originalName: "diplome.pdf", size: buffer.length });
  const javaScriptOpening = (source: string) => source.replace("/OpenAction[1 0 R /XYZ null null 0]", "/OpenAction <</S/JavaScript/JS(app.alert\\(1\\))>>");

  it("accepte un PDF LibreOffice (avec son /OpenAction) et un PDF à flux d’objets", () => {
    expect(validate(libreOfficeCvPdf()).securityScanVersion).toBe("candidate-document-safety-v2");
    expect(validate(packPdfIntoObjectStream(libreOfficeCvPdf())).mimeType).toBe("application/pdf");
  });

  it("refuse le JavaScript caché dans un flux d’objets ou derrière des noms échappés #XX", () => {
    expect(() => validate(packPdfIntoObjectStream(libreOfficeCvPdf(), { edit: javaScriptOpening }))).toThrow("candidate_document_pdf_active_content");
    const escaped = Buffer.from(libreOfficeCvPdf().toString("latin1").replace("/OpenAction[1 0 R /XYZ null null 0]", "/OpenAction <</S/#4C#61unch/F(cmd.exe)>>"), "latin1");
    expect(() => validate(escaped)).toThrow("candidate_document_pdf_active_content");
    const hex = packPdfIntoObjectStream(libreOfficeCvPdf(), {
      edit: javaScriptOpening,
      objectStream: { dictionary: "/Type/ObjStm/Filter/ASCIIHexDecode", encode: content => Buffer.from(`${content.toString("hex")}>`, "latin1") },
    });
    expect(() => validate(hex)).toThrow("candidate_document_pdf_object_stream_unreadable");
  });

  it("lit le dictionnaire du flux d’objets comme pdf.js : ni un faux « obj », ni une longue chaîne, ni /F ne le cachent", () => {
    // A page written in clear in the dictionary, so that the page count alone cannot refuse the file.
    const hidden = (dictionary: string, encode?: (content: Buffer) => Buffer) => packPdfIntoObjectStream(libreOfficeCvPdf(), { edit: javaScriptOpening, objectStream: { dictionary: `${dictionary}/Y(/Type /Page)`, encode } });
    for (const dictionary of ["/Type/ObjStm/Filter/FlateDecode/X( obj)", `/Type/ObjStm/Filter/FlateDecode/X(${"x".repeat(5_000)})`, "/Type/ObjStm/F/FlateDecode", "/Type/ObjStm/Filter/FlateDecode 9 0 obj <<"]) {
      expect(() => validate(hidden(dictionary)), dictionary.slice(0, 40)).toThrow("candidate_document_pdf_active_content");
    }
    const hexAlias = hidden("/Type/ObjStm/F/AHx", content => Buffer.from(`${content.toString("hex")}>`, "latin1"));
    expect(() => validate(hexAlias)).toThrow("candidate_document_pdf_object_stream_unreadable");
  });

  it("accepte un flux d’objets sans filtre ou à prédicteur PNG, et y trouve le JavaScript", () => {
    const plain = (edit?: (source: string) => string) => packPdfIntoObjectStream(libreOfficeCvPdf(), { edit, objectStream: { dictionary: "/Type/ObjStm", encode: content => content } });
    const predicted = (edit?: (source: string) => string) => packPdfIntoObjectStream(libreOfficeCvPdf(), {
      edit,
      objectStream: { dictionary: "/Type/ObjStm/Filter/FlateDecode/DecodeParms<</Predictor 12/Columns 5>>", encode: content => deflateSync(pngPredict(content, 5, [0, 1, 2, 3, 4])) },
    });
    for (const pdf of [plain, predicted]) {
      expect(validate(pdf()).mimeType).toBe("application/pdf");
      expect(() => validate(pdf(javaScriptOpening))).toThrow("candidate_document_pdf_active_content");
    }
    const tiff = packPdfIntoObjectStream(libreOfficeCvPdf(), { objectStream: { dictionary: "/Type/ObjStm/Filter/FlateDecode/DecodeParms<</Predictor 2/Columns 5>>" } });
    expect(() => validate(tiff)).toThrow("candidate_document_pdf_object_stream_unreadable");
  });

  it("ne lit pas les données binaires des flux, compte une page réenregistrée une fois et refuse un formulaire XFA", () => {
    // The compressed Chinese font of this LibreOffice PDF holds the bytes "/JS".
    expect(validate(libreOfficeChineseCvPdf()).mimeType).toBe("application/pdf");
    // An action the xref places inside the data of a stream is still found.
    const hidden = (header?: string) => withObjectInStreamData(libreOfficeCvPdf(), { number: 99, header, body: "<</S/JavaScript/JS(app.alert\\(1\\))>>" }, [{ number: 20, body: "<</Type/Catalog/Pages 10 0 R/OpenAction 99 0 R>>" }]);
    expect(() => validate(hidden())).toThrow("candidate_document_pdf_active_content");
    // pdf.js reads "0." as the generation number 0, then the "obj" keyword.
    expect(() => validate(hidden("99 0.obj"))).toThrow("candidate_document_pdf_active_content");
    const commented = saveIncrementally(libreOfficeCvPdf(), [{ number: 20, header: "20 0.obj", body: "<</Type/Catalog/Pages 10 0 R\n% 98 0 obj <<>> stream\n/OpenAction<</S/JavaScript/JS(app.alert\\(1\\))>>/Lang(upstream)\n>>" }]);
    expect(() => validate(commented)).toThrow("candidate_document_pdf_active_content");
    // A document of 25 pages, every page rotated afterwards: still 25 pages, not 50.
    const page = (rotate: number) => `<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Rotate ${rotate}>>`;
    const kids = (count: number) => `<</Type/Pages/Count ${count}/Kids[${Array.from({ length: count }, (_, index) => `${index + 3} 0 R`).join(" ")}]>>`;
    const scanned = classicPdf(["<</Type/Catalog/Pages 2 0 R>>", kids(25), ...Array.from({ length: 25 }, () => page(0))]);
    const rotated = saveIncrementally(scanned, Array.from({ length: 25 }, (_, index) => ({ number: index + 3, body: page(90) })));
    expect(validate(rotated).mimeType).toBe("application/pdf");
    expect(() => validate(saveIncrementally(rotated, [{ number: 2, body: kids(26) }, { number: 28, body: page(0) }]))).toThrow("candidate_document_pdf_page_limit");
    const xfa = packPdfIntoObjectStream(libreOfficeCvPdf(), { edit: source => source.replace("/PageMode/UseOutlines", "/AcroForm<</Fields[]/XFA 99 0 R>>") });
    expect(() => validate(xfa)).toThrow("candidate_document_pdf_active_content");
  });

  it("distingue un PDF sans page d’un PDF trop long, et borne la décompression", () => {
    const pdf = (body: string) => Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`.padEnd(2048, " "), "latin1");
    expect(() => validate(pdf("1 0 obj << /Type /Catalog >> endobj"))).toThrow("candidate_document_pdf_page_structure_invalid");
    expect(() => validate(pdf("<< /Type /Page >>\n".repeat(26)))).toThrow("candidate_document_pdf_page_limit");
    const bomb = Buffer.concat([
      Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Filter /FlateDecode >>\nstream\n", "latin1"),
      deflateSync(Buffer.alloc(DOCUMENT_DECOMPRESSION_LIMITS.pdfMaxInflatedBytes + 1024, 32)),
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]);
    expect(() => validate(bomb)).toThrow("cv_validation_pdf_decompressed_size_exceeded");
  });

  it.each(pathologicalPdfs())("juge en moins de deux secondes un PDF de 4 Mo fait pour bloquer le serveur : $label", ({ pdf, outcome }) => {
    // The vault reads the same structure as the CV check: 1 MB of "stream stream…" without an end of line blocked it for 86 s.
    const code = {
      object_stream_unreadable: "candidate_document_pdf_object_stream_unreadable",
      stream_count_exceeded: "cv_validation_pdf_stream_count_exceeded",
      decompressed_size_exceeded: "cv_validation_pdf_decompressed_size_exceeded",
    };
    const started = performance.now();
    if (outcome === "accepted") expect(validate(pdf).mimeType).toBe("application/pdf");
    else expect(() => validate(pdf)).toThrow(code[outcome]);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("explique au candidat le motif du refus et quoi faire", () => {
    const resave = "imprimez-le en PDF depuis votre navigateur";
    expect(candidateDocumentValidationMessage("candidate_document_pdf_active_content")).toContain("JavaScript");
    expect(candidateDocumentValidationMessage("candidate_document_pdf_active_content")).toContain(resave);
    expect(candidateDocumentValidationMessage("candidate_document_pdf_object_stream_unreadable")).toContain(resave);
    expect(candidateDocumentValidationMessage("cv_validation_pdf_decompressed_size_exceeded")).toContain("trop volumineux");
    expect(candidateDocumentValidationMessage("candidate_document_pdf_page_limit")).toContain("25 pages");
    expect(candidateDocumentValidationMessage("candidate_document_pdf_encrypted")).toContain("mot de passe");
    expect(candidateDocumentValidationMessage("candidate_document_signature_invalid")).toContain(resave);
  });
});
