import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { siteConfig } from "./data/site-config";
import { venturesEn } from "./data/ventures-en";
import { venturesFr } from "./data/ventures-fr";

const projectRoot = resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(resolve(projectRoot, file), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|html)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

describe("coordonnées publiques uniques (PUB-CONTACT-01)", () => {
  it("n'utilise plus d'autre adresse ni d'autre profil LinkedIn pour le Dr Ben Lallahom", () => {
    const files = [...sourceFiles(resolve(projectRoot, "client/src")), ...sourceFiles(resolve(projectRoot, "shared")), resolve(projectRoot, "client/index.html")];
    const offenders = files.filter(file => /contact@drahmedbenlallahom\.com|linkedin\.com\/in\/ahmed-ben-lallahom\/?["']/.test(readFileSync(file, "utf8")));
    expect(offenders.map(file => relative(projectRoot, file))).toEqual([]);
  });

  it("affiche l'email de site-config dans les mentions légales, dans les 4 langues", () => {
    const legal = read("client/src/pages/LegalPage.tsx");
    expect(legal).toContain('import { siteConfig } from "@/data/site-config";');
    expect(legal).not.toContain("{HIPPOCAMPUS_LEGAL.contactEmail}");
    expect(legal.match(/\{siteConfig\.email\}/g)?.length).toBeGreaterThanOrEqual(12);
  });

  it("relie la fiche du Dr Ben Lallahom des pages entreprises au profil LinkedIn de site-config", () => {
    for (const venture of [...venturesFr, ...venturesEn]) {
      for (const member of venture.team ?? []) {
        if (/Ahmed Ben Lallahom/i.test(member.name)) expect(member.linkedin, venture.slug).toBe(siteConfig.linkedin);
      }
    }
  });
});

// Le lien du pied de page vers /gdpr et celui de la page Employeurs vers /why-hippocampus, dans les
// quatre langues : components/Footer.dom.test.ts, pages/EmployersPage.dom.test.ts.
describe("pages orphelines reliées (PUB-NAV-01)", () => {
  it("la politique de confidentialité (§6) renvoie vers /gdpr au lieu du formulaire de contact", () => {
    const legal = read("client/src/pages/LegalPage.tsx");
    expect(legal.match(/<Link href="\/gdpr"/g)).toHaveLength(4);
    expect(legal).not.toContain('formulaire de contact avec la mention "Demande RGPD"');
    expect(legal).not.toContain('contact form with the mention "GDPR Request"');
  });
});
