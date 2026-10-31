import { describe, expect, it, vi } from "vitest";
import {
  createCandidateToken,
  hashCandidatePassword,
  hashCandidateToken,
  verifyCandidatePassword,
} from "./candidateAuth";
import { decryptCandidateDocument, encryptCandidateDocument } from "./candidateDocumentEncryption";
import { validateCandidateDocument } from "./candidateDocumentValidation";
import { verifyCandidateTurnstile } from "./candidateTurnstile";

function validPdfBuffer() {
  const content = "%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF";
  return Buffer.concat([Buffer.from(content, "utf8"), Buffer.alloc(256)]);
}

describe("parcours candidat — protections intégrées non destructives", () => {
  it("vérifie un mot de passe, isole les jetons d’activation et accepte un contrôle anti-bot validé par Cloudflare", async () => {
    const password = "Mot-de-passe-long-et-unique-2026";
    const passwordHash = await hashCandidatePassword(password);
    const token = createCandidateToken();

    await expect(verifyCandidatePassword(password, passwordHash)).resolves.toBe(true);
    await expect(verifyCandidatePassword(`${password}-incorrect`, passwordHash)).resolves.toBe(false);
    expect(hashCandidateToken(token, "verification")).not.toBe(hashCandidateToken(token, "session"));

    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({ success: true, hostname: "drahmedbenlallahom.com" }), { status: 200 });
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    try {
      await expect(verifyCandidateTurnstile({ token: "test-turnstile-token-valide" })).resolves.toBeUndefined();
    } finally {
      global.fetch = originalFetch;
      vi.unstubAllEnvs();
    }
  });

  it("valide un document PDF sûr puis garantit un aller-retour chiffré avant stockage privé", () => {
    const source = validPdfBuffer();
    const validation = validateCandidateDocument({
      buffer: source,
      mimeType: "application/pdf",
      originalName: "diplome.pdf",
      size: source.length,
    });
    const encrypted = encryptCandidateDocument(source);

    expect(validation.securityScanVersion).toBe("candidate-document-safety-v2");
    expect(encrypted.encrypted.equals(source)).toBe(false);
    expect(decryptCandidateDocument(encrypted.encrypted, encrypted.iv, encrypted.authTag)).toEqual(source);
  });

  it("bloque les documents PDF actifs ou chiffrés avant toute mise en quarantaine", () => {
    const activePdf = Buffer.concat([
      Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Page /JavaScript (malicious) >>\nendobj\n%%EOF", "utf8"),
      Buffer.alloc(256),
    ]);

    expect(() => validateCandidateDocument({
      buffer: activePdf,
      mimeType: "application/pdf",
      originalName: "document.pdf",
      size: activePdf.length,
    })).toThrow("candidate_document_pdf_active_content");
  });
});
