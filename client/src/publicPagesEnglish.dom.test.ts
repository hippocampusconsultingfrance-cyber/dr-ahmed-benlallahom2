// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// EN-07, A11Y-13 — l'application entière montée par React dans un DOM, en anglais, sur chaque page
// publique : aucun mot français courant ne reste hors d'un passage marqué lang (texte, textes
// alternatifs, noms accessibles, titre et description de l'onglet). tRPC répond par des données
// vides, sauf deux questions santé publiées, l'une en français, l'autre en anglais.

const publishedQuestion = { id: 1, question: "Puis-je boire de l’eau avant une anesthésie ?", response: "Les consignes de jeûne vous sont données lors de la consultation.", language: "fr", publishedAt: "2026-10-01T08:00:00.000Z" };
const englishQuestion = { id: 2, question: "Will I meet the anaesthetist before surgery?", response: "Yes, during the pre-anaesthetic consultation.", language: "en", publishedAt: "2026-10-02T08:00:00.000Z" };

vi.mock("@/lib/trpc", () => {
  const data: Record<string, unknown> = {
    "medicalQuestions.published": [publishedQuestion, englishQuestion],
    "candidatePortal.me": { id: 7, firstName: "Vera" },
    "candidatePortal.documents": [],
    "candidatePortal.sessions": [],
  };
  const query = (path: string) => ({ data: data[path], isLoading: false, isError: false, isFetching: false, isSuccess: true, error: null, errorUpdatedAt: 0, dataUpdatedAt: 1, refetch: async () => ({ isError: false }) });
  const mutation = () => ({ mutate: () => undefined, mutateAsync: async () => undefined, isPending: false, isSuccess: false, isError: false, error: null, reset: () => undefined });
  // Any procedure, at any depth (trpc.x.y.useQuery, trpc.useUtils().x.invalidate()), never a promise.
  const node = (path: string[]): unknown => new Proxy(() => undefined, {
    get: (_target, key) => {
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key === "useQuery") return () => query(path.join("."));
      if (key === "useMutation") return mutation;
      return node([...path, key]);
    },
    apply: () => node(path),
  });
  return { trpc: node([]) };
});

const { default: App, candidatePortalSeo } = await import("./App");
const { skipToContentCopy } = await import("@/components/SkipToContent");
const { homeSeo } = await import("@/pages/Home");
const { searchSeo } = await import("@/pages/SearchPage");
const { recruitmentUnsubscribeSeo } = await import("@/pages/RecruitmentUnsubscribePage");
const { contentEn } = await import("@/data/content-en");
const { venturesFr } = await import("@/data/ventures-fr");

const PUBLIC_PATHS = [
  "/",
  ...venturesFr.map(venture => `/venture/${venture.slug}`),
  "/legal", "/legal?tab=privacy", "/legal?tab=terms", "/gdpr",
  "/booking", "/booking/confirmation", "/questions-anesthesie", "/faq", "/resources", "/press", "/search",
  "/recruitment", "/recruitment/standard", "/recruitment/vvip-offshore", "/recruitment/unsubscribe", "/employers", "/why-hippocampus",
  "/candidate/access", "/candidate/verify", "/candidate/reset-password", "/candidate/portal",
  "/error", "/maintenance", "/page-introuvable",
];

/** Common French words, none of them English: articles, pronouns, prepositions, and the words of the leftovers found by the audit. */
const FRENCH_WORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "au", "aux", "de", "à", "et", "ou", "où", "est", "sont", "pour", "avec", "sans", "dans", "sur", "par", "chez", "vers",
  "vous", "votre", "vos", "nous", "notre", "nos", "je", "il", "elle", "ils", "mon", "ma", "mes", "ce", "cette", "ces", "leur", "qui", "que", "pas", "mais", "très", "chaque",
  "aller", "accueil", "retour", "contenu", "recherche", "rechercher", "chargement", "coffre", "candidat", "envoyer", "effacer", "aucun", "aucune", "veuillez",
]);
/** An elided article or pronoun (« d’information », « l’accueil », « j’accepte »). */
const FRENCH_ELISION = /(?:^|[^\p{L}])[dlj][’'][aeiouhéèêàâîôûœ]/iu;
const FRENCH_DIACRITIC = /[éèêëàâçùûôîïœ]/u;

/**
 * Proper names, French on every page and exempt from the language of parts (WCAG 3.1.2): a company,
 * the hospitals and universities of the doctor's path, the CNIL, an institution and the publisher's address.
 */
const PROPER_NAMES = [
  "Appel Médical Tunisie", "Centre Hospitalier du Mans", "Institut de Cancérologie de l'Ouest", "Institut de Cancérologie de l’Ouest",
  "Université de Nantes", "Université Paris Cité", "Université Paris-Saclay", "Université d'Angers", "Université de Strasbourg", "Sorbonne Université",
  "Commission Nationale de l'Informatique et des Libertés", "6 rue d’Armaillé",
];

function withoutProperNames(text: string) {
  const rest = PROPER_NAMES.reduce((value, name) => value.split(name).join(" "), text);
  // A description cut at 160 characters (ventureMetaDescription) can end inside a name: « the Institut de… ».
  if (!rest.endsWith("…")) return rest;
  for (const name of PROPER_NAMES) {
    const words = name.split(" ");
    for (let count = words.length - 1; count > 0; count -= 1) {
      const start = `${words.slice(0, count).join(" ")}…`;
      if (rest.endsWith(start)) return rest.slice(0, -start.length);
    }
  }
  return rest;
}

/** Texts a visitor sees or hears in English: those outside an element marked in another language. */
function englishTexts() {
  const texts: Array<{ where: string; text: string }> = [{ where: "title", text: document.title }];
  for (const meta of document.head.querySelectorAll("meta[name='description'], meta[property='og:title'], meta[property='og:description']")) texts.push({ where: "meta", text: meta.getAttribute("content") ?? "" });
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    const element = current.nodeType === Node.ELEMENT_NODE ? current as Element : current.parentElement!;
    // Les noms de pays viennent d'Intl.DisplayNames (EN-11), pas des dictionnaires du site.
    if (element.closest("script, style, noscript, [autocomplete='country-name']")) continue;
    if (!(element.closest("[lang]")?.getAttribute("lang") ?? "en").startsWith("en")) continue;
    if (current.nodeType === Node.TEXT_NODE) texts.push({ where: `<${element.tagName.toLowerCase()}>`, text: current.textContent ?? "" });
    else for (const name of ["alt", "aria-label", "title", "placeholder"]) if (element.hasAttribute(name)) texts.push({ where: `${name} of <${element.tagName.toLowerCase()}>`, text: element.getAttribute(name) ?? "" });
  }
  return texts;
}

/** Each English text with French in it, and the French words found. */
function frenchLeftovers() {
  return englishTexts().flatMap(({ where, text }) => {
    const rest = withoutProperNames(text);
    const words = rest.toLocaleLowerCase("fr").split(/[^\p{L}]+/u).filter(word => FRENCH_WORDS.has(word) || FRENCH_DIACRITIC.test(word));
    return words.length || FRENCH_ELISION.test(rest) ? [`${where} « ${text.trim()} » : ${words.join(", ") || "élision"}`] : [];
  });
}

async function mountInEnglish(path: string) {
  localStorage.setItem("language", "en");
  window.history.replaceState(null, "", path);
  render(createElement(App));
  // Page chargée à la demande : son h1, puis le <head> que SEOHead écrit après le rendu.
  await screen.findAllByRole("heading", { level: 1 }, { timeout: 5_000 });
  await new Promise(resolve => setTimeout(resolve, 20));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("pages publiques en anglais (EN-07, A11Y-13)", () => {
  it("repère les restes de français, hors noms propres et passages marqués lang", () => {
    document.head.innerHTML = "";
    document.body.innerHTML = `<p>Go home</p><a href="#main">Aller au contenu principal</a><img alt="Illustration médicale" src="x.svg"><p>Bibliothèque d’information</p><p lang="fr">Réponse publiée</p><p>Centre Hospitalier du Mans</p><p>Practice at the Institut de…</p><p>Practice in the de…</p>`;
    document.title = "Recherche | Dr. Ben Lallahom";

    expect(frenchLeftovers()).toEqual([
      "title « Recherche | Dr. Ben Lallahom » : recherche",
      "<a> « Aller au contenu principal » : aller, au, contenu",
      "alt of <img> « Illustration médicale » : médicale",
      "<p> « Bibliothèque d’information » : bibliothèque",
      "<p> « Practice in the de… » : de",
    ]);
    document.body.innerHTML = "";
  });

  it.each(PUBLIC_PATHS)("%s : aucun mot français hors des passages marqués lang", async path => {
    await mountInEnglish(path);

    expect(document.documentElement.lang).toBe("en");
    expect(frenchLeftovers()).toEqual([]);
  }, 15_000);

  it("le lien d’évitement est en anglais", async () => {
    await mountInEnglish("/");
    expect(screen.getByRole("link", { name: skipToContentCopy.en }).getAttribute("href")).toBe("#main-content");
  });

  it.each([
    ["/", homeSeo.en],
    ["/search", searchSeo.en],
    ["/recruitment/unsubscribe", recruitmentUnsubscribeSeo.en],
    ["/candidate/portal", candidatePortalSeo.en],
  ] as const)("%s : titre et description de l’onglet en anglais", async (path, seo) => {
    await mountInEnglish(path);

    expect(document.title).toBe(seo.title);
    expect(document.head.querySelector("meta[name='description']")?.getAttribute("content")).toBe(seo.description);
  });
});

describe("images de l’accueil (A11Y-14)", () => {
  it("les deux illustrations sont décoratives, le portrait seul est décrit, en anglais", async () => {
    await mountInEnglish("/");
    const images = Array.from(document.querySelectorAll("main img"));
    const bySource = (source: string) => images.find(image => image.getAttribute("src") === source)!;

    for (const source of ["/assets/medical-hero.svg", "/assets/consulting-network.svg"]) {
      expect(bySource(source).getAttribute("alt"), source).toBe("");
      expect(bySource(source).getAttribute("aria-hidden"), source).toBe("true");
    }
    expect(screen.getByRole("img", { name: contentEn.about.portraitAlt }).getAttribute("src")).toBe("/assets/team/ahmed-ben-lallahom.webp");
  });
});

describe("contenus restés en français sur les pages anglaises (EN-15)", () => {
  it("questions santé : la question publiée en français est marquée lang=fr et dite « In French », celle en anglais sans mention", async () => {
    await mountInEnglish("/questions-anesthesie");
    const card = (question: string) => screen.getByRole("heading", { level: 3, name: question }).closest("article")!;

    expect(card(publishedQuestion.question).getAttribute("lang")).toBe("fr");
    expect(within(card(publishedQuestion.question)).getByText("In French").getAttribute("lang")).toBe("en");
    expect(card(englishQuestion.question).getAttribute("lang")).toBe("en");
    expect(within(card(englishQuestion.question)).queryByText(/^In /)).toBeNull();
  });

  it("ressources : le lien de la HAS est dit « (in French) », en hreflang fr, les sources anglaises sans mention", async () => {
    await mountInEnglish("/resources");
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("main a[target='_blank']"));
    const link = (host: string) => links.find(anchor => new URL(anchor.href).hostname.endsWith(host))!;

    expect(link("has-sante.fr").textContent).toBe("Open source (in French)");
    expect(link("has-sante.fr").hreflang).toBe("fr");
    for (const host of ["who.int", "ecdc.europa.eu"]) {
      expect(link(host).textContent, host).toBe("Open source");
      expect(link(host).hreflang, host).toBe("en");
    }
  });
});
