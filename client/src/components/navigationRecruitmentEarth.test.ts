import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("recrutement et ordre de navigation", () => {
  it("place une Terre décorative derrière la page de recrutement principale", () => {
    const source = readSource("client/src/pages/RecruitmentHubPage.tsx");
    expect(source).toContain("hippocampus-recruitment-earth_f3124b59.png");
    expect(source).toContain('aria-hidden="true"');
  });

  it("place Contact après Recrutement et Employeurs dans les deux navigations", () => {
    const source = readSource("client/src/components/Navigation.tsx");
    const contactLink = 'scrollTo("contact")} className="nav-link';
    expect(source.indexOf('href="/recruitment"')).toBeLessThan(source.indexOf(contactLink));
    expect(source.indexOf('href="/employers"')).toBeLessThan(source.indexOf(contactLink));
    expect(source).toContain('scrollTo("contact")} className="nav-mobile-link');
  });
});
