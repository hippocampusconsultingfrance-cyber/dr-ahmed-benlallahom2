import { describe, expect, it } from "vitest";
import { venturesFr } from "../client/src/data/ventures-fr";
import { ventureMetaDescription } from "../client/src/pages/VenturePage";
import { DEFAULT_SHARE_IMAGE, STATIC_ROUTE_METADATA, resolveClientSeo } from "../shared/routeMetadata";
import { getPrerenderRoutes, getSitemapRoutes, renderRouteSeoHead, renderSitemapXml } from "./routeSeo";
import { buildDate } from "../scripts/prerender-route-seo";

const decode = (value: string) =>
  value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function parseHead(head: string) {
  const meta = (attribute: "name" | "property", key: string) => {
    const match = head.match(new RegExp(`<meta ${attribute}="${key.replace(/[.:]/g, "\\$&")}" content="([^"]*)" />`));
    return match ? decode(match[1]) : undefined;
  };
  return {
    title: decode(head.match(/<title>([^<]*)<\/title>/)?.[1] ?? ""),
    description: meta("name", "description"),
    robots: meta("name", "robots"),
    canonicalUrl: head.match(/<link rel="canonical" href="([^"]+)" \/>/)?.[1],
    ogUrl: meta("property", "og:url"),
    image: meta("property", "og:image"),
    imageWidth: meta("property", "og:image:width"),
    imageHeight: meta("property", "og:image:height"),
    imageAlt: meta("property", "og:image:alt"),
  };
}

describe("une seule source de vérité pour le <head> (SEO-02 / PUB-SEO-01)", () => {
  it("le pré-rendu et SEOHead (FR) donnent les mêmes titre, description, robots, canonique et image", () => {
    const routes = getPrerenderRoutes();
    expect(routes.length).toBeGreaterThan(20);

    for (const route of routes) {
      const prerendered = parseHead(renderRouteSeoHead(route));
      const venture = venturesFr.find(item => `/venture/${item.slug}` === route);
      // Les pages passent leurs propres props ; pour une route statique, la table partagée doit l'emporter.
      const props = venture
        ? { title: `${venture.company} — ${venture.role} | Dr. Ahmed Ben Lallahom`, description: ventureMetaDescription(venture.description), ogUrl: `https://drahmedbenlallahom.com${route}` }
        : { title: "Titre propre à la page (ignoré en français)", description: "Description propre à la page" };
      const hydrated = resolveClientSeo(route, "fr", props);

      expect(hydrated.title, route).toBe(prerendered.title);
      expect(hydrated.description, route).toBe(prerendered.description);
      expect(hydrated.robots, route).toBe(prerendered.robots);
      expect(hydrated.canonicalUrl, route).toBe(prerendered.canonicalUrl);
      expect(hydrated.ogUrl, route).toBe(prerendered.ogUrl);
      expect(hydrated.image.url, route).toBe(prerendered.image);
    }
  });

  it("garde la canonique de l'accueil avec barre finale et celle des pages noindex", () => {
    expect(resolveClientSeo("/", "fr", { title: "x", description: "y", ogUrl: "https://drahmedbenlallahom.com" }).canonicalUrl).toBe("https://drahmedbenlallahom.com/");
    const search = resolveClientSeo("/search", "fr", { title: "x", description: "y", noIndex: true });
    expect(search.canonicalUrl).toBe("https://drahmedbenlallahom.com/search");
    expect(search.robots).toBe("noindex, follow");
    expect(resolveClientSeo("/vvip-offshore", "fr", { title: "x", description: "y" }).canonicalUrl).toBe("https://drahmedbenlallahom.com/recruitment/vvip-offshore");
  });

  it("utilise les props localisées dans les autres langues", () => {
    const english = resolveClientSeo("/booking", "en", { title: "Book a consultation", description: "Book online" });
    expect(english.title).toBe("Book a consultation");
    expect(english.canonicalUrl).toBe("https://drahmedbenlallahom.com/booking");
    expect(resolveClientSeo("/booking", "fr", { title: "Book", description: "x" }).title).toBe(STATIC_ROUTE_METADATA["/booking"].title);
  });
});

describe("image de partage (SEO-01)", () => {
  it("déclare une image PNG 1200x630 avec dimensions et texte alternatif", () => {
    const head = parseHead(renderRouteSeoHead("/booking"));
    expect(head.image).toBe(DEFAULT_SHARE_IMAGE.url);
    expect(head.image).toMatch(/\.png$/);
    expect(head).toMatchObject({ imageWidth: "1200", imageHeight: "630" });
    expect(head.imageAlt?.length).toBeGreaterThan(20);
    expect(renderRouteSeoHead("/booking")).toContain('<meta name="twitter:image" content="https://drahmedbenlallahom.com/assets/og/og-default.png" />');
    expect(renderRouteSeoHead("/")).not.toMatch(/og:image" content="[^"]+\.svg"/);
  });
});

describe("sitemap généré au build (SEO-03)", () => {
  it("liste toutes les routes indexables, dont /venture/pratique-clinique, sans alias ni noindex", () => {
    const xml = renderSitemapXml("2026-10-16");
    const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), match => new URL(match[1]).pathname);

    expect(locs).toEqual(getSitemapRoutes());
    expect(locs).toContain("/venture/pratique-clinique");
    for (const venture of venturesFr) expect(locs).toContain(`/venture/${venture.slug}`);
    for (const excluded of ["/vvip-offshore", "/search", "/error", "/maintenance", "/recruitment/unsubscribe", "/testimonials", "/admin", "/booking/confirmation"]) {
      expect(locs, excluded).not.toContain(excluded);
    }
    expect(xml.match(/<lastmod>2026-10-16<\/lastmod>/g)).toHaveLength(locs.length);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("date le build en heure de Paris", () => {
    expect(buildDate(new Date("2026-10-15T22:30:00Z"))).toBe("2026-10-16");
    expect(() => renderSitemapXml("16/10/2026")).toThrow();
  });
});
