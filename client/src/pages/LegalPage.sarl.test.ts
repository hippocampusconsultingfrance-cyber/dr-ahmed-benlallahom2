import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// L’identité légale vit dans shared/legalIdentity.ts (source unique partagée avec la facture) :
// la page publiée = la page + cette configuration.
const legalPageSource = [
  readFileSync(resolve(process.cwd(), "client/src/pages/LegalPage.tsx"), "utf8"),
  readFileSync(resolve(process.cwd(), "shared/legalIdentity.ts"), "utf8"),
].join("\n");

describe("mentions légales Hippocampus Consulting SARL", () => {
  it("publie les informations d’immatriculation sans divulguer le domicile privé du gérant", () => {
    expect(legalPageSource).toContain("Hippocampus Consulting SARL");
    expect(legalPageSource).toContain("999 259 252 R.C.S. Paris");
    expect(legalPageSource).toContain("6 rue d’Armaillé, 75017 Paris, France");
    expect(legalPageSource).toContain("hippocampusconsultingfrance@gmail.com");
    expect(legalPageSource).not.toContain("96 avenue Bollée");
    expect(legalPageSource).toContain('from "@shared/legalIdentity"');
  });

  it("qualifie les prestataires de données et la revue humaine de l’IA", () => {
    expect(legalPageSource).toContain("Google Drive");
    for (const provider of ["Vercel", "Neon", "Clerk", "Cloudflare Turnstile", "Resend", "Stripe"]) {
      expect(legalPageSource).toContain(provider);
    }
    expect(legalPageSource).not.toContain("Butterfly Effect Pte. Ltd.");
    expect(legalPageSource).toContain("aucune décision d’embauche ou de rejet sans revue humaine");
  });
});
