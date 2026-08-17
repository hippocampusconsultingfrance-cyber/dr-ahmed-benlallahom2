import { describe, expect, it } from "vitest";
import { validateCvFile } from "./recruitmentFileValidation";

const validPdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(300, 65)]);
const validDoc = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(300, 66)]);
const validDocx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("[Content_Types].xml"), Buffer.alloc(300, 67)]);

describe("validation et quarantaine des CV", () => {
  it("accepte les signatures attendues pour PDF, DOC et DOCX", () => {
    expect(validateCvFile({ buffer: validPdf, mimeType: "application/pdf", originalName: "cv.pdf", size: validPdf.length }).checksum).toHaveLength(64);
    expect(validateCvFile({ buffer: validDoc, mimeType: "application/msword", originalName: "cv.doc", size: validDoc.length }).mimeType).toBe("application/msword");
    expect(validateCvFile({ buffer: validDocx, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", originalName: "cv.docx", size: validDocx.length }).mimeType).toContain("officedocument");
  });

  it("rejette une extension ou une signature qui ne correspond pas au type déclaré", () => {
    expect(() => validateCvFile({ buffer: validPdf, mimeType: "application/pdf", originalName: "cv.docx", size: validPdf.length })).toThrow("cv_validation_type_mismatch");
    expect(() => validateCvFile({ buffer: Buffer.alloc(300, 70), mimeType: "application/pdf", originalName: "cv.pdf", size: 300 })).toThrow("cv_validation_signature_invalid");
  });
});
