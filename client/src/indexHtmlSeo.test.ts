import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { venturesFr } from "./data/ventures-fr";

const projectRoot = resolve(import.meta.dirname, "../..");
const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

const structuredData = () =>
  Array.from(
    readProjectFile("client/index.html").matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    match => JSON.parse(match[1]) as Record<string, any>,
  );

describe("document HTML initial", () => {
  it("autorise le zoom pincé sur mobile (WCAG 1.4.4)", () => {
    const viewport = readProjectFile("client/index.html").match(/<meta name="viewport" content="([^"]+)"/)?.[1];

    expect(viewport).toBe("width=device-width, initial-scale=1.0");
    expect(viewport).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
  });

  it("conserve le marqueur remplacé par le head de chaque route", () => {
    expect(readProjectFile("client/index.html")).toContain("<!--route-seo-->");
  });

  it("publie des données structurées sans lien mort ni profil vide", () => {
    const schemas = structuredData();
    const person = schemas.find(schema => schema["@type"] === "Person");
    const slugs = venturesFr.map(venture => `https://drahmedbenlallahom.com/venture/${venture.slug}`);

    expect(schemas.length).toBeGreaterThanOrEqual(4);
    expect(slugs).toContain(person?.worksFor?.url);
    for (const schema of schemas) {
      for (const profile of schema.sameAs ?? []) {
        expect(new URL(profile).pathname.replace(/\/+$/, ""), profile).not.toBe("");
      }
    }
    expect(JSON.stringify(schemas)).not.toContain("twitter.com");
  });
});

describe("balises sociales côté client", () => {
  it("n’émet twitter:site / twitter:creator que pour un compte explicitement fourni", () => {
    const seoHead = readProjectFile("client/src/components/SEOHead.tsx");

    expect(seoHead).not.toContain("@drahmedbenlallahom");
    expect(seoHead).not.toMatch(/twitterHandle\s*=\s*["']/);
    expect(seoHead).toMatch(/if \(twitterHandle\) \{\s*updateMeta\("twitter:site", twitterHandle\);\s*updateMeta\("twitter:creator", twitterHandle\);/);
    expect(seoHead).toContain('meta[name="twitter:site"], meta[name="twitter:creator"]');
  });

  it("ne déclare pas l’accueil comme canonique d’une page privée sans URL explicite", () => {
    const seoHead = readProjectFile("client/src/components/SEOHead.tsx");

    expect(seoHead).toContain("const canonicalUrl = ogUrl ?? (noIndex ? undefined : DEFAULT_URL);");
    expect(seoHead).toContain("canonical.remove();");
  });
});
