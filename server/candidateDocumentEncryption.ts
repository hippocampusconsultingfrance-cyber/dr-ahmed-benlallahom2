import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  const encoded = process.env.CANDIDATE_DOCUMENT_ENCRYPTION_KEY;
  if (!encoded) throw new Error("candidate_document_encryption_key_missing");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("candidate_document_encryption_key_invalid");
  return key;
}

export function encryptCandidateDocument(plain: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { encrypted, algorithm: ALGORITHM, iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decryptCandidateDocument(encrypted: Buffer, iv: string, authTag: string): Buffer {
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
