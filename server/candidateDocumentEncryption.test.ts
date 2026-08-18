import { describe, expect, it } from "vitest";
import { decryptCandidateDocument, encryptCandidateDocument } from "./candidateDocumentEncryption";

describe("candidate document encryption key", () => {
  it("encrypts and decrypts a document with the configured AES-256 key", () => {
    const source = Buffer.from("document candidat confidentiel", "utf8");
    const encrypted = encryptCandidateDocument(source);
    expect(encrypted.encrypted.equals(source)).toBe(false);
    expect(decryptCandidateDocument(encrypted.encrypted, encrypted.iv, encrypted.authTag)).toEqual(source);
  });
});
