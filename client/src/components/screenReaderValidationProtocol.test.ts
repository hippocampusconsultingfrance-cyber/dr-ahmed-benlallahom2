import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("protocole lecteur d’écran", () => {
  it("relie les repères de code à une recette assistive réelle", async () => {
    const root = process.cwd();
    const [protocol, skip, booking] = await Promise.all([
      readFile(path.join(root, "EXTERNAL_VALIDATION_REGISTER.md"), "utf8"),
      readFile(path.join(root, "client/src/components/SkipToContent.test.ts"), "utf8"),
      readFile(path.join(root, "client/src/pages/BookingPage.test.ts"), "utf8"),
    ]);
    for (const marker of ["Recette lecteur d’écran", "NVDA", "VoiceOver", "TalkBack", "main-content", "Contact/RGPD/Réservation", "coffre candidat", "fenêtres modales", "Réalisé"]) expect(protocol).toContain(marker);
    expect(skip).toContain("main-content");
    expect(booking).toContain('role="alert"');
  });
});
