import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CANDIDATE_DOCUMENT_ACCEPTED_EXTENSIONS } from "../shared/candidateDocumentLimits";
import { asciiFileName, candidateDocumentMimeTypes, candidateDocumentValidationMessage, displayFileName, safeCandidateDocumentName, validateCandidateDocument } from "./candidateDocumentValidation";
import { attachmentContentDisposition } from "./routes/routeHelpers";
import { DOCUMENT_DECOMPRESSION_LIMITS } from "./documentDecompressionLimits";
import { appendWithoutXref, classicPdf, IMAGE_DATA_OBJ_KEYWORDS, libreOfficeChineseCvPdf, libreOfficeCvPdf, packPdfIntoObjectStream, pathologicalPdfs, pngPredict, saveIncrementally, scannedPdf, withObjectInStreamData } from "./testing/pdfFixture";
import { buildZip } from "./testing/zipFixture";

describe("validation des documents candidats", () => {
  it("nettoie les noms de fichiers et rejette les chemins", () => {
    expect(safeCandidateDocumentName("../../passeport client.pdf")).not.toContain("/");
    expect(safeCandidateDocumentName("../../passeport client.pdf")).not.toContain("\\");
    expect(safeCandidateDocumentName("..\\..\\passeport client.pdf")).not.toContain("\\");
  });

  it("garde le nom affiché tel qu’envoyé, lettres arabes, chinoises et accentuées comprises (INTL-07)", () => {
    for (const name of ["王小明简历.pdf", "执业证书.pdf", "سيرة ذاتية - محمد العتيبي.pdf", "CV Zoë Ørsted-Łukasz.pdf", "Céline.pdf"]) expect(displayFileName(name, "cv"), name).toBe(name);
    // Composed: a name typed on macOS (NFD) gives the same name.
    expect(displayFileName("Céline.pdf".normalize("NFD"), "cv")).toBe("Céline.pdf");
  });

  it("retire du nom affiché les contrôles et contrôles de direction, et remplace les caractères refusés par Windows", () => {
    const rlo = String.fromCharCode(0x202e);
    const controls = [0x00, 0x09, 0x1f, 0x7f, 0x85, 0x9f, 0x061c, 0x200e, 0x200f, 0x202a, 0x2066, 0x2069].map(code => String.fromCharCode(code)).join("");
    expect(displayFileName(`CV${rlo}fdp.exe${controls}.pdf`, "cv")).toBe("CVfdp.exe.pdf");
    expect(displayFileName("a<b>c:d\"e|f?g*h/i\\j.pdf", "cv")).toBe("a_b_c_d_e_f_g_h_i_j.pdf");
    expect(displayFileName(`${controls} `, "cv")).toBe("cv");
  });

  it("borne le nom affiché à 180 caractères sans couper un caractère en deux", () => {
    const name = `${"😀".repeat(100)}.pdf`;
    const shortened = displayFileName(name, "cv");
    expect(shortened.length).toBeLessThanOrEqual(180);
    expect(shortened.endsWith(".pdf")).toBe(true);
    expect(shortened.isWellFormed()).toBe(true);
    expect(displayFileName(`a${String.fromCharCode(0xd800)}b.pdf`, "cv").isWellFormed()).toBe(true);
  });

  it("donne pour les clés de stockage un nom ASCII, sans accent, ou le nom de repli quand il ne reste rien de lisible", () => {
    expect(asciiFileName("Céline.pdf", "cv")).toBe("Celine.pdf");
    expect(asciiFileName("CV Zoë Ørsted-Łukasz.pdf", "cv")).toBe("CV_Zoe_rsted-_ukasz.pdf");
    expect(asciiFileName("王小明简历.pdf", "cv")).toBe("cv.pdf");
    expect(asciiFileName("سيرة ذاتية - محمد العتيبي.pdf", "document")).toBe("document.pdf");
    expect(asciiFileName("执业证书", "document")).toBe("document");
    for (const name of ["王小明简历.pdf", "Ünïcödé ñame.docx", "../../x.pdf"]) expect(asciiFileName(name, "cv"), name).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it("annonce un téléchargement sous son nom en UTF-8, avec un nom ASCII de repli", () => {
    expect(attachmentContentDisposition("执业证书.pdf", "document")).toBe("attachment; filename=\"document.pdf\"; filename*=UTF-8''%E6%89%A7%E4%B8%9A%E8%AF%81%E4%B9%A6.pdf");
    expect(attachmentContentDisposition("Céline (2).pdf", "document")).toBe("attachment; filename=\"Celine_2_.pdf\"; filename*=UTF-8''C%C3%A9line%20%282%29.pdf");
    // A name stored before INTL-07 keeps the one it had.
    expect(attachmentContentDisposition("Dipl_me d__tat.pdf", "document")).toBe("attachment; filename=\"Dipl_me_d_tat.pdf\"; filename*=UTF-8''Dipl_me%20d__tat.pdf");
  });

  it("raccourcit un nom de plus de 180 caractères par la fin de son nom de base, extension gardée", () => {
    const buffer = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 1)]);
    for (const [name, extension] of [[`${"x".repeat(181)}.png`, ".png"], [`${"diplome ".repeat(30)}.png`, ".png"], [`${"y".repeat(200)}.jpeg`, ".jpeg"]] as const) {
      const safe = safeCandidateDocumentName(name);
      expect(safe.length, name).toBeLessThanOrEqual(180);
      expect(safe.endsWith(extension), safe).toBe(true);
      expect(safe).not.toMatch(/[. ]\.\w+$/);
    }
    expect(validateCandidateDocument({ buffer, mimeType: "image/png", originalName: `${"x".repeat(250)}.png`, size: buffer.length }).mimeType).toBe("image/png");
    // A name without an extension, or with an overlong one, is only cut.
    expect(safeCandidateDocumentName("z".repeat(300))).toBe("z".repeat(180));
    expect(safeCandidateDocumentName(`a.${"b".repeat(300)}`)).toHaveLength(180);
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

  it("refuse un document Word ancien (.doc), même sans macro, et accepte un DOCX (REC-15)", () => {
    // A well-formed OLE container: the vault no longer takes the format at all, as for CVs.
    const doc = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(2048, 0)]);
    for (const [mimeType, originalName] of [["application/msword", "diplome.doc"], ["application/msword", "diplome.DOC"], ["application/octet-stream", "diplome.doc"]]) {
      expect(() => validateCandidateDocument({ buffer: doc, mimeType, originalName, size: doc.length }), `${mimeType} ${originalName}`).toThrow("candidate_document_type_mismatch");
    }
    // Declared as a DOCX, the old container is still not one.
    expect(() => validateCandidateDocument({ buffer: doc, mimeType: DOCX, originalName: "diplome.docx", size: doc.length })).toThrow("candidate_document_signature_invalid");
    expect(candidateDocumentValidationMessage("candidate_document_type_mismatch")).toContain("Réenregistrez-le en DOCX");
    expect(candidateDocumentValidationMessage("candidate_document_type_mismatch")).not.toMatch(/\bDOC,/);

    const docx = minimalDocx();
    const accepted = validateCandidateDocument({ buffer: docx, mimeType: DOCX, originalName: "diplome.docx", size: docx.length });
    expect(accepted.mimeType).toBe(DOCX);
    expect(accepted.notes).not.toContain("legacy_doc");
  });

  it("accepte exactement les extensions que le portail laisse choisir (REC-15)", () => {
    // Past the type check, an empty file of 300 bytes is refused for its signature only.
    const passesTypeCheck = (mimeType: string, extension: string) => {
      const buffer = Buffer.alloc(300, 0);
      try {
        validateCandidateDocument({ buffer, mimeType, originalName: `diplome.${extension}`, size: buffer.length });
        return true;
      } catch (error) {
        return (error as Error).message !== "candidate_document_type_mismatch";
      }
    };
    const candidates = new Set([...CANDIDATE_DOCUMENT_ACCEPTED_EXTENSIONS, "doc", "docm", "dot", "odt", "rtf", "txt", "gif", "webp", "heic", "tif", "tiff"]);
    const serverExtensions = [...candidates].filter(extension => [...candidateDocumentMimeTypes].some(mimeType => passesTypeCheck(mimeType, extension)));
    expect(serverExtensions.sort()).toEqual([...CANDIDATE_DOCUMENT_ACCEPTED_EXTENSIONS].sort());
    // And every MIME type the upload filter lets through has an extension the portal offers.
    for (const mimeType of candidateDocumentMimeTypes) {
      expect(CANDIDATE_DOCUMENT_ACCEPTED_EXTENSIONS.some(extension => passesTypeCheck(mimeType, extension)), mimeType).toBe(true);
    }
  });
});

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function minimalDocx() {
  return buildZip([
    { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: "word/document.xml", content: '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Diplôme d’État de docteur en médecine</w:t></w:r></w:p></w:body></w:document>' },
  ]);
}

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
    // 30 pages, 6 of them written again as annotations after %%EOF without an xref, which pdf.js never reads: still 30 pages.
    const thirty = classicPdf(["<</Type/Catalog/Pages 2 0 R>>", kids(30), ...Array.from({ length: 30 }, () => page(0))]);
    expect(() => validate(appendWithoutXref(thirty, Array.from({ length: 6 }, (_, index) => ({ number: index + 3, body: "<</Type/Annot/Subtype/Text/Rect[0 0 10 10]>>" }))))).toThrow("candidate_document_pdf_page_limit");
    const xfa = packPdfIntoObjectStream(libreOfficeCvPdf(), { edit: source => source.replace("/PageMode/UseOutlines", "/AcroForm<</Fields[]/XFA 99 0 R>>") });
    expect(() => validate(xfa)).toThrow("candidate_document_pdf_active_content");
  });

  it("accepte un document scanné de 12, 24 ou 25 pages quels que soient les octets de ses images, refuse 26 pages", () => {
    // Each image ends with bytes that the check took for an object: the vault refused such scans like the CV forms.
    for (const keyword of IMAGE_DATA_OBJ_KEYWORDS) {
      for (const ascii85 of [true, false]) expect(validate(scannedPdf(12, { ascii85, keywords: [keyword] })).mimeType, `${keyword} ${ascii85}`).toBe("application/pdf");
    }
    const full = scannedPdf(24, { pageBytes: 110_000 });
    expect(full.length).toBeGreaterThan(3_000_000);
    expect(validate(full).mimeType).toBe("application/pdf");
    expect(validate(scannedPdf(25, { ascii85: false })).mimeType).toBe("application/pdf");
    expect(() => validate(scannedPdf(26))).toThrow("candidate_document_pdf_page_limit");
    const hidden = withObjectInStreamData(scannedPdf(12), { number: 99, body: "<</S/JavaScript/JS(app.alert\\(1\\))>>" }, [{ number: 1, body: "<</Type/Catalog/Pages 2 0 R/OpenAction 99 0 R>>" }]);
    expect(() => validate(hidden)).toThrow("candidate_document_pdf_active_content");
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
