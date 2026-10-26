import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Visuels publics rendus comme sur le site (FR et EN) : illustrations locales
// légères et décoratives (masquées des lecteurs d’écran), et aucune promesse
// thérapeutique là où apparaissent les visuels médicaux et les photos.
// L’illustration de la réservation est vérifiée dans BookingPage.render.test.ts.

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" }));
vi.mock("@/contexts/LanguageContext", async () => {
  const { contentFr } = await import("@/data/content-fr");
  const { contentEn } = await import("@/data/content-en");
  return { useLanguage: () => ({ language: view.language, content: view.language === "en" ? contentEn : contentFr, setLanguage: vi.fn(), toggleLanguage: vi.fn() }) };
});
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "dark", toggleTheme: vi.fn(), switchable: true, highReadability: false, toggleHighReadability: vi.fn(), reducedMotion: false }) }));
vi.mock("@/components/LanguageMenu", () => ({ default: () => null }));
vi.mock("wouter", async () => {
  const { createElement } = await import("react");
  return { useLocation: () => ["/", vi.fn()], Link: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement("a", { href, ...rest }, children as never) };
});

const { default: AboutSection } = await import("./components/AboutSection");
const { default: Footer } = await import("./components/Footer");
const { default: Navigation } = await import("./components/Navigation");
const { default: ServicesSection } = await import("./components/ServicesSection");
const { venturesFr } = await import("./data/ventures-fr");
const { venturesEn } = await import("./data/ventures-en");

const PROHIBITED_CLAIMS = /guérison|guerison|résultat garanti|resultat garanti|traitement garanti|\bguaranteed\s+(?:cure|result)\b/i;
const html = (component: () => unknown) => renderToStaticMarkup(createElement(component as never)).replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const images = (markup: string) => [...markup.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
const imageWith = (markup: string, src: string) => images(markup).find(tag => tag.includes(`src="${src}"`));

beforeEach(() => { view.language = "fr"; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("illustrations et photos publiques", () => {
  it.each(["fr", "en"] as const)("garde l’illustration des services locale, légère et décorative (%s)", language => {
    view.language = language;
    const tag = imageWith(html(ServicesSection), "/assets/medical-compass.svg")!;
    expect(tag).toBeDefined();
    for (const attribute of ['alt=""', 'aria-hidden="true"', 'decoding="async"', 'loading="lazy"', 'sizes="100vw"']) expect(tag).toContain(attribute);
  });

  it.each(["fr", "en"] as const)("montre le portrait et le logo depuis les fichiers du site, jamais depuis /manus-storage/ (%s)", language => {
    view.language = language;
    const rendered = { about: html(AboutSection), footer: html(Footer), navigation: html(Navigation), services: html(ServicesSection) };
    expect(imageWith(rendered.about, "/assets/team/ahmed-ben-lallahom.webp")).toBeDefined();
    expect(imageWith(rendered.footer, "/assets/abl-logo.svg")).toBeDefined();
    expect(imageWith(rendered.navigation, "/assets/abl-logo.svg")).toBeDefined();
    for (const [name, markup] of Object.entries(rendered)) expect(markup, name).not.toContain("/manus-storage/");
  });

  it.each(["fr", "en"] as const)("n’associe aucune promesse thérapeutique aux visuels médicaux (%s)", language => {
    view.language = language;
    for (const component of [AboutSection, Footer, Navigation, ServicesSection]) {
      expect(html(component).replace(/<[^>]+>/g, " "), component.name).not.toMatch(PROHIBITED_CLAIMS);
    }
  });

  it("référence logos et photos de l’équipe dans les fiches des projets, sans promesse thérapeutique", () => {
    const assets = [
      "/assets/logos/appel-medical-tunisie.webp", "/assets/logos/hippocampus-consulting.webp", "/assets/logos/laska-corporate.webp", "/assets/logos/octopus-talent.webp",
      "/assets/team/ahmed-ben-lallahom.webp", "/assets/team/amine-hachicha.webp", "/assets/team/ines-dhaouadi.webp", "/assets/team/lotfi-ben-lallahom.webp",
      "/assets/team/monia-ben-lallahom.webp", "/assets/team/omar-ben-lallahom.webp", "/assets/team/sonia-siala.webp", "photo-wafa-clean_fe6f20ad.png", "/assets/team/youssef-ben-lallahom.webp",
    ];
    for (const ventures of [venturesFr, venturesEn]) {
      const data = JSON.stringify(ventures);
      for (const asset of assets) expect(data, asset).toContain(asset);
      expect(data).not.toMatch(PROHIBITED_CLAIMS);
    }
  });

  it.each(["fr", "en"] as const)("ne propose pas les actualités désactivées dans la navigation (%s)", language => {
    view.language = language;
    for (const component of [Navigation, Footer]) expect(html(component), component.name).not.toMatch(/href="\/blog/);
  });
});
