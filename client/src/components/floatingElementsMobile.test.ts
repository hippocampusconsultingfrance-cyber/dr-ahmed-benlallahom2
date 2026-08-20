import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("éléments flottants sur petits écrans", () => {
  it("préserve la zone sûre du bouton WhatsApp et la priorité du consentement", async () => {
    const root = process.cwd();
    const [whatsapp, cookies, navigation] = await Promise.all([
      readFile(path.join(root, "client/src/components/WhatsAppButton.tsx"), "utf8"),
      readFile(path.join(root, "client/src/components/CookieConsent.tsx"), "utf8"),
      readFile(path.join(root, "client/src/components/Navigation.tsx"), "utf8"),
    ]);
    expect(whatsapp).toContain("bottom-[calc(env(safe-area-inset-bottom)+1rem)]");
    expect(whatsapp).toContain("right-4");
    expect(whatsapp).toContain("z-30");
    expect(cookies).toContain("fixed bottom-0 left-0 right-0 z-50");
    expect(navigation).toContain("fixed top-0 left-0 right-0 z-50");
  });
});
