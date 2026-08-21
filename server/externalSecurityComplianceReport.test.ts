import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("rapport externe de sécurité et conformité", () => {
  it("documente les limites HDS, antivirus, messagerie et IA avec des sources officielles", async () => {
    const report = await readFile(path.join(process.cwd(), "RAPPORT_SECURITE_CONFORMITE_EXTERNE_2026-08-21.md"), "utf8");
    for (const marker of ["HDS", "antivirus", "WhatsApp", "IA de recrutement", "esante.gouv.fr", "cnil.fr"]) {
      expect(report).toContain(marker);
    }
  });
});
