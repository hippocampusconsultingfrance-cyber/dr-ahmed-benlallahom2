// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Page FAQ montée par React dans un DOM, avec les vrais contextes de thème et de langue.
const { default: FAQPage } = await import("./FAQPage");
const { getFaqContent } = await import("./faqContent");
const { ThemeProvider } = await import("@/contexts/ThemeContext");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { renderRouteSeoHead } = await import("../../../server/routeSeo");

type Language = "fr" | "en" | "de" | "zh";

function mount(language: Language) {
  localStorage.setItem("language", language);
  window.history.replaceState(null, "", "/faq");
  return render(createElement(ThemeProvider, null, createElement(LanguageProvider, null, createElement(FAQPage))));
}

/** Panneau de réponse commandé par le bouton de la question. */
const answerPanel = (question: HTMLElement) => document.getElementById(question.getAttribute("aria-controls")!)!;
/** Réponses que lit un lecteur d'écran (la section de la FAQ, nommée, est elle aussi une région). */
const readAnswers = () => screen.queryAllByRole("region").filter(region => region.dataset.slot === "accordion-content");
/** Titres du contenu de la page, sans ceux du pied de page. */
const pageHeadings = (level: number) => within(screen.getByRole("main")).queryAllByRole("heading", { level });

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("réponses de la FAQ dans la page (SEOP-03)", () => {
  it.each(["fr", "en", "de", "zh"] as const)("%s : garde chaque réponse dans le HTML, masquée et hors lecture tant que sa question est fermée", language => {
    const content = getFaqContent(language);
    mount(language);

    const text = document.body.textContent ?? "";
    for (const entry of content.entries) expect(text, entry.question).toContain(entry.answer);
    // Rien d'ouvert : aucune réponse n'est lue.
    expect(readAnswers()).toEqual([]);
    for (const entry of content.entries) {
      const question = screen.getByRole("button", { name: entry.question });
      expect(question.getAttribute("aria-expanded")).toBe("false");
      expect(answerPanel(question).hidden).toBe(true);
    }
  });

  it("ouvre une seule réponse à la fois, et la referme", () => {
    const [first, second] = getFaqContent("fr").entries;
    mount("fr");
    const firstQuestion = screen.getByRole("button", { name: first.question });
    const secondQuestion = screen.getByRole("button", { name: second.question });

    fireEvent.click(firstQuestion);
    expect(firstQuestion.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: first.question }).textContent).toBe(first.answer);

    fireEvent.click(secondQuestion);
    expect(firstQuestion.getAttribute("aria-expanded")).toBe("false");
    expect(answerPanel(firstQuestion).hidden).toBe(true);
    expect(readAnswers().map(region => region.textContent)).toEqual([second.answer]);

    fireEvent.click(secondQuestion);
    expect(readAnswers()).toEqual([]);
    expect(document.body.textContent).toContain(second.answer);
  });

  it("publie au pré-rendu un FAQPage identique aux réponses que la page affiche en français", () => {
    const head = renderRouteSeoHead("/faq");
    const schemas = Array.from(head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g), match => JSON.parse(match[1]) as Record<string, any>);
    const faqPage = schemas.find(schema => schema["@type"] === "FAQPage");
    mount("fr");

    const shown = pageHeadings(2).map(heading => {
      const question = within(heading).getByRole("button");
      return { question: question.textContent, answer: answerPanel(question).textContent };
    });
    expect(faqPage?.mainEntity.map((item: any) => ({ question: item.name, answer: item.acceptedAnswer.text }))).toEqual(shown);
    expect(faqPage?.mainEntity.every((item: any) => item["@type"] === "Question" && item.acceptedAnswer["@type"] === "Answer")).toBe(true);
  });
});

describe("titres, urgence et liens de la FAQ (A11Y-15, PUB-14, A11Y-17)", () => {
  it("passe du h1 aux questions en h2, sans h3", () => {
    const content = getFaqContent("fr");
    mount("fr");

    expect(pageHeadings(1).map(heading => heading.textContent)).toEqual([content.title]);
    expect(pageHeadings(2).map(heading => heading.textContent)).toEqual(content.entries.map(entry => entry.question));
    expect(pageHeadings(3)).toEqual([]);
  });

  it.each([
    ["fr", "15 (SAMU) ou 112"],
    ["en", "15 (SAMU) or 112"],
    ["de", "15 (SAMU) oder 112"],
    ["zh", "15（SAMU）或 112"],
  ] as const)("%s : donne le 15 (SAMU) avec le 112 partout où la FAQ parle d’urgence", (language, numbers) => {
    const content = getFaqContent(language);
    const [purpose, , , , emergency] = content.entries;

    for (const text of [content.note, purpose.answer, emergency.answer]) expect(text).toContain(numbers);
    // Plus aucun 112 seul : chacun vient avec le 15 (SAMU).
    const all = JSON.stringify(content);
    expect(all.split(numbers).length).toBe(all.split("112").length);
  });

  it.each([
    ["fr", "Je suis soignant : postuler"],
    ["en", "I'm a healthcare professional: apply"],
  ] as const)("%s : mène au recrutement par un vrai lien qui dit l’action", (language, label) => {
    mount(language);

    const link = screen.getByRole("link", { name: label });
    expect(link.getAttribute("href")).toBe("/recruitment");
    expect(screen.queryByRole("button", { name: "Hippocampus Consulting" })).toBeNull();
    expect(screen.getByRole("link", { name: getFaqContent(language).booking }).getAttribute("href")).toBe("/booking");
  });
});
