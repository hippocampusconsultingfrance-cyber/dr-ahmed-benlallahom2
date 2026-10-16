import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { venturesFr } from "./data/ventures-fr";
import { siteConfig } from "./data/site-config";
import { renderRouteSeoHead } from "../../server/routeSeo";
import { resolveClientSeo } from "@shared/routeMetadata";

const projectRoot = resolve(import.meta.dirname, "../..");
const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

const structuredData = (html: string) =>
  Array.from(
    html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
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
    const schemas = structuredData(renderRouteSeoHead("/"));
    const person = schemas.find(schema => schema["@type"] === "Person");
    const slugs = venturesFr.map(venture => `https://drahmedbenlallahom.com/venture/${venture.slug}`);

    expect(schemas.length).toBeGreaterThanOrEqual(3);
    expect(slugs).toContain(person?.worksFor?.url);
    for (const schema of schemas) {
      for (const profile of schema.sameAs ?? []) {
        expect(new URL(profile).pathname.replace(/\/+$/, ""), profile).not.toBe("");
      }
    }
    expect(JSON.stringify(schemas)).not.toContain("twitter.com");
  });

  it("aligne les données structurées sur site-config, avec des images matricielles (SEO-04)", () => {
    const schemas = structuredData(renderRouteSeoHead("/"));
    const json = JSON.stringify(schemas);

    for (const schema of schemas.filter(item => item.sameAs)) expect(schema.sameAs).toEqual([siteConfig.linkedin]);
    for (const schema of schemas.filter(item => item.contactPoint)) {
      expect(schema.contactPoint.email).toBe(siteConfig.email);
      expect(schema.contactPoint.telephone).toBe(siteConfig.phone);
    }
    expect(json).not.toMatch(/\.svg"/);
    expect(json).not.toContain("SearchAction");
    expect(json).not.toContain("LocalBusiness");
    expect(json).not.toContain("contact@drahmedbenlallahom.com");
    // Plus de JSON-LD codé en dur dans le shell : il ne serait pas aligné sur site-config.
    expect(readProjectFile("client/index.html")).not.toContain("application/ld+json");
    // Uniquement sur l'accueil : pas de répétition sur les pages non indexables.
    expect(structuredData(renderRouteSeoHead("/search"))).toEqual([]);
    expect(structuredData(renderRouteSeoHead("/faq"))).toEqual([]);
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
    const privatePage = resolveClientSeo("/candidate/portal", "fr", { title: "Coffre", description: "Privé", noIndex: true });

    expect(privatePage.canonicalUrl).toBeUndefined();
    expect(privatePage.robots).toBe("noindex, nofollow, noarchive");
    expect(seoHead).toContain("resolveClientSeo(location, language,");
    expect(seoHead).toContain("canonical.remove();");
  });
});
