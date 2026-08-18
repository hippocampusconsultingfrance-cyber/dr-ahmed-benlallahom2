import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const pageSource = readFileSync(resolve(projectRoot, "client/src/pages/WhyHippocampusPage.tsx"), "utf8");
const appSource = readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8");
const employersSource = readFileSync(resolve(projectRoot, "client/src/pages/EmployersPage.tsx"), "utf8");

describe("page Pourquoi Hippocampus Consulting", () => {
  it("présente la méthode, les territoires, les garanties et le parcours de shortlist", () => {
    expect(pageSource).toContain("Shortlists explicables");
    expect(pageSource).toContain("Europe");
    expect(pageSource).toContain("Canada");
    expect(pageSource).toContain("Moyen-Orient");
    expect(pageSource).toContain("Afrique");
    expect(pageSource).toContain("Décision humaine");
    expect(pageSource).toContain("Soumettre un brief de mission");
  });

  it("reste accessible par une route publique et depuis l’espace Employeurs", () => {
    expect(appSource).toContain('path="/why-hippocampus"');
    expect(employersSource).toContain('href="/why-hippocampus"');
  });
});
