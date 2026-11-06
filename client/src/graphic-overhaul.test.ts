import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderStateful, resetStatefulHooks } from "@/testing/statefulRender";
import { bookingContent } from "./pages/BookingPage";
import { renderSitemapXml } from "../../server/routeSeo";

// Les composants et pages sont vérifiés à leur rendu : BookingPage.render,
// BookingConfirmationPage.render, publicImagery.render (navigation sans lien
// vers les actualités) et publicTestimonials.render (routes de l’application).

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr" }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/booking", vi.fn()] }));

const { SEOHead } = await import("./components/SEOHead");
const { resolveClientSeo } = await import("@shared/routeMetadata");
const projectRoot = resolve(import.meta.dirname, "../..");

type FakeNode = { tag: string; id?: string; type?: string; textContent?: string; attributes: Map<string, string>; removed?: boolean; setAttribute: (name: string, value: string) => void; remove: () => void };

/** A document head with the site's own JSON-LD (index.html), as the page loads it. */
function fakeDocument() {
  const head: FakeNode[] = [];
  const node = (tag: string): FakeNode => {
    const created: FakeNode = { tag, attributes: new Map(), setAttribute: (name, value) => created.attributes.set(name, value), remove: () => { created.removed = true; head.splice(head.indexOf(created), 1); } };
    return created;
  };
  const siteSchema = Object.assign(node("script"), { id: "site-structured-data", type: "application/ld+json", textContent: "{\"@type\":\"Physician\"}" });
  head.push(siteSchema);
  const document = {
    title: "",
    head: { appendChild: (child: FakeNode) => { head.push(child); return child; } },
    createElement: (tag: string) => node(tag),
    getElementById: (id: string) => head.find(child => child.id === id) ?? null,
    querySelector: (selector: string) => {
      const meta = /^meta\[(name|property)="([^"]+)"\]$/.exec(selector);
      if (meta) return head.find(child => child.tag === "meta" && child.attributes.get(meta[1]!) === meta[2]) ?? null;
      if (selector === "link[rel='canonical']") return head.find(child => child.tag === "link") ?? null;
      return null;
    },
    querySelectorAll: () => [],
  };
  return { document, head, siteSchema };
}

afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("premium graphic overhaul contracts", () => {
  it("keeps the multilingual booking reassurance copy complete", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const content = bookingContent[language];
      expect(content.form.checkingAvailability).toBeTruthy();
      expect(content.form.available).toBeTruthy();
      expect(content.form.blocked).toBeTruthy();
      expect(content.form.alreadyBooked).toBeTruthy();
      expect(content.cancellation).toBeTruthy();
      expect(content.paymentTrust).toBeTruthy();
      expect(content.availabilityLabel).toBeTruthy();
    }
  });

  it("covers public route SEO and preserves document-level structured data", () => {
    const { document, head, siteSchema } = fakeDocument();
    vi.stubGlobal("document", document);
    const schema = { "@context": "https://schema.org", "@type": "MedicalBusiness", name: "Consultation" };
    let props: Record<string, unknown> = { title: "Réservation | Dr. Ahmed Ben Lallahom", description: "Réservez une consultation.", ogUrl: "https://drahmedbenlallahom.com/booking", structuredData: schema };
    const mount = () => renderStateful(() => SEOHead(props as never) as unknown as ReactElement);

    mount();
    const pageSchema = document.getElementById("seo-head-structured-data")!;
    expect(pageSchema).toMatchObject({ type: "application/ld+json", textContent: JSON.stringify(schema) });
    // The served route metadata, shared with the prerendering, gives the French head.
    const seo = resolveClientSeo("/booking", "fr", props as never);
    expect(document.title).toBe(seo.title);
    expect(head.find(child => child.attributes.get("property") === "og:url")!.attributes.get("content")).toBe(seo.ogUrl);
    expect(head.find(child => child.attributes.get("name") === "robots")!.attributes.get("content")).toBe(seo.robots);

    // Without page data, only the page's own schema goes; the site's schema stays.
    props = { ...props, structuredData: undefined };
    mount();
    expect(pageSchema.removed).toBe(true);
    expect(document.getElementById("seo-head-structured-data")).toBeNull();
    expect(head).toContain(siteSchema);
  });

  it("hides news from public indexing", () => {
    expect(renderSitemapXml("2026-10-16")).not.toContain("/blog");
    expect(readFileSync(resolve(projectRoot, "client/public/robots.txt"), "utf8")).toContain("Disallow: /blog");
  });
});
