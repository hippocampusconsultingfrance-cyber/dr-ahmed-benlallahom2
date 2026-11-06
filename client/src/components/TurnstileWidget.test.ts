import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTurnstileWidgetCopy, publicFormCopy } from "@/lib/publicFormCopy";

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));

const { TurnstileLoadError, TurnstileWidget } = await import("./TurnstileWidget");
const languages = ["fr", "en", "de", "zh"] as const;
const french = publicFormCopy.turnstile.fr;

function renderWidget(language: (typeof languages)[number], siteKey: string) {
  view.language = language;
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", siteKey);
  return decodeHtml(renderToStaticMarkup(createElement(TurnstileWidget, { onToken: () => undefined })));
}

/** First <button> element of a rendered tree, to call its handler as a click would. */
function findButton(node: ReactNode): { props: { onClick: () => void; children: ReactNode } } | null {
  if (Array.isArray(node)) return node.map(findButton).find(Boolean) ?? null;
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (node.type === "button") return node as never;
  return findButton(node.props.children);
}

afterEach(() => {
  vi.unstubAllEnvs();
  view.language = "fr";
});

describe("vérification anti-robot dans la langue de la page (REC-03)", () => {
  it.each(languages)("dit que la vérification est indisponible dans la langue courante (%s)", language => {
    const html = renderWidget(language, "");

    expect(html).toMatch(/role="alert"/);
    expect(html).toContain(getTurnstileWidgetCopy(language).unavailable);
    if (language !== "fr") expect(html).not.toContain(french.unavailable);
  });

  it.each(languages)("nomme la zone du défi dans la langue courante, sans message d’erreur avant tout échec (%s)", language => {
    const html = renderWidget(language, "test-site-key");

    expect(html).toContain(`aria-label="${getTurnstileWidgetCopy(language).label}"`);
    expect(html).not.toMatch(/role="alert"/);
  });

  it.each(languages)("affiche l’échec de chargement du script et son bouton dans la langue courante (%s)", language => {
    const copy = getTurnstileWidgetCopy(language);
    const html = decodeHtml(renderToStaticMarkup(createElement(TurnstileLoadError, { copy, onRetry: () => undefined })));

    expect(html).toMatch(/role="alert"/);
    expect(html).toContain(copy.loadError);
    expect(html).toMatch(new RegExp(`<button type="button"[^>]*>${copy.retry}</button>`));
    if (language !== "fr") {
      expect(html).not.toContain(french.loadError);
      expect(html).not.toContain(french.retry);
    }
  });

  it("relance un nouveau défi quand le visiteur clique sur le bouton", () => {
    const onRetry = vi.fn();
    const button = findButton(TurnstileLoadError({ copy: getTurnstileWidgetCopy("en"), onRetry }));

    expect(button?.props.children).toBe("Try again");
    button?.props.onClick();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

function decodeHtml(value: string) {
  return value.replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
