import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Bandeau et préférences cookies rendus et utilisés : choix enregistré, vraie
// fenêtre de dialogue qui rend le focus à son déclencheur, et rechargement de
// la page quand la mesure d’audience est retirée (le script déjà chargé
// continuerait sinon de suivre la navigation).

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr" }) }));

const { default: CookieConsent, COOKIE_BANNER_OPEN_ATTRIBUTE, COOKIE_POLICY_HREF, cookieCopy, openCookiePreferences } = await import("./CookieConsent");
const { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent } = await import("./cookieConsentState");
const { Dialog, DialogContent } = await import("@/components/ui/dialog");
const { default: WhatsAppButton } = await import("./WhatsAppButton");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the props of any element of the tree, read and called as each test needs
type Element = { type: unknown; props: Record<string, any> };
const copy = cookieCopy.fr;
const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as Element).props.children);
  return "";
};

let stored: Map<string, string>;
let reload: ReturnType<typeof vi.fn>;
let events: string[];
let rootAttributes: Map<string, string>;
let listeners: Map<string, Set<(event: Event) => void>>;

const render = () => elementsOf(renderStateful(() => CookieConsent() as ReactElement)) as Element[];
/**
 * « Gérer les cookies » (ManageCookiesButton) pressed once the page is shown, i.e. after the render that
 * follows reading the stored choice: the preferences open, `trigger` gets the focus back at closing.
 */
const openFrom = (trigger: { focus: () => void; isConnected: boolean }) => {
  render();
  openCookiePreferences(trigger as unknown as HTMLElement);
  return render();
};
const button = (elements: Element[], label: string) => elements.find(element => typeof element.props.onClick === "function" && (textOf(element).trim() === label || element.props["aria-label"] === label))!;
const dialog = (elements: Element[]) => elements.find(element => element.type === Dialog)!;
const savedConsent = () => JSON.parse(stored.get(COOKIE_CONSENT_STORAGE_KEY) ?? "null");

beforeEach(() => {
  stored = new Map();
  reload = vi.fn();
  events = [];
  rootAttributes = new Map();
  listeners = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); }, removeItem: (key: string) => { stored.delete(key); } });
  vi.stubGlobal("window", {
    location: { reload },
    dispatchEvent: (event: Event) => { events.push(event.type); listeners.get(event.type)?.forEach(listener => listener(event)); return true; },
    addEventListener: (type: string, listener: (event: Event) => void) => { listeners.set(type, (listeners.get(type) ?? new Set()).add(listener)); },
    removeEventListener: (type: string, listener: (event: Event) => void) => { listeners.get(type)?.delete(listener); },
  });
  vi.stubGlobal("document", {
    activeElement: null,
    documentElement: { setAttribute: (name: string, value: string) => rootAttributes.set(name, value), removeAttribute: (name: string) => rootAttributes.delete(name), style: { setProperty: vi.fn(), removeProperty: vi.fn() } },
  });
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("bandeau et préférences cookies (PUB-COOKIE-01 / PUB-COOKIE-04)", () => {
  it("demande un choix sans consentement enregistré, et n’active la mesure d’audience que sur accord", () => {
    render();
    const banner = render();
    expect(rootAttributes.get(COOKIE_BANNER_OPEN_ATTRIBUTE)).toBe("true");
    expect(banner.find(element => element.props.href === COOKIE_POLICY_HREF)).toBeDefined();

    button(banner, copy.essential).props.onClick();
    expect(savedConsent()).toMatchObject({ performance: false });
    expect(events).toHaveLength(1);
    render();
    expect(rootAttributes.has(COOKIE_BANNER_OPEN_ATTRIBUTE)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("recharge la page quand la mesure d’audience est retirée, et seulement dans ce cas", () => {
    stored.set(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(createCookieConsent(true)));
    render();
    const preferences = openFrom({ focus: vi.fn(), isConnected: true });
    expect(dialog(preferences).props.open).toBe(true);

    const performance = preferences.find(element => element.type === "input" && !element.props.disabled)!;
    expect(performance.props.checked).toBe(true);
    performance.props.onChange({ target: { checked: false } });
    button(render(), copy.save).props.onClick();

    expect(savedConsent()).toMatchObject({ performance: false });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ne recharge pas la page quand la mesure d’audience est acceptée", () => {
    stored.set(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(createCookieConsent(false)));
    render();
    openFrom({ focus: vi.fn(), isConnected: true }).find(element => element.type === "input" && !element.props.disabled)!.props.onChange({ target: { checked: true } });
    button(render(), copy.save).props.onClick();
    expect(savedConsent()).toMatchObject({ performance: true });
    expect(reload).not.toHaveBeenCalled();
  });

  it("utilise une vraie fenêtre modale qui rend le focus à son déclencheur à la fermeture (PUB-A11Y-04)", () => {
    stored.set(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(createCookieConsent(false)));
    render();
    const trigger = { focus: vi.fn(), isConnected: true };
    const opened = openFrom(trigger);
    dialog(opened).props.onOpenChange(false);
    expect(dialog(render()).props.open).toBe(false);
    const closeAutoFocus = { preventDefault: vi.fn() };
    opened.find(element => element.type === DialogContent)!.props.onCloseAutoFocus(closeAutoFocus);
    expect(closeAutoFocus.preventDefault).toHaveBeenCalled();
    expect(trigger.focus).toHaveBeenCalledTimes(1);
  });

  it("ne propose que les cookies essentiels et la mesure d’audience, et décrit le stockage fonctionnel", () => {
    stored.set(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(createCookieConsent(false)));
    render();
    const preferences = openFrom({ focus: vi.fn(), isConnected: true });
    expect(preferences.filter(element => element.type === "input").map(element => Boolean(element.props.disabled))).toEqual([true, false]);
    expect(textOf(preferences.find(element => element.props["data-testid"] === "cookie-functional-storage"))).toContain(copy.functionalDescription);
    for (const language of Object.values(cookieCopy)) expect(language).not.toHaveProperty("preferences");
  });

  it("ouvre les préférences sur l’évènement de « Gérer les cookies », avec le choix enregistré, et rend le focus à ce bouton (PUB-12)", () => {
    stored.set(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(createCookieConsent(true)));
    render();
    expect(dialog(render()).props.open).toBe(false);

    const trigger = { focus: vi.fn(), isConnected: true } as unknown as HTMLElement;
    openCookiePreferences(trigger);
    const opened = render();
    expect(dialog(opened).props.open).toBe(true);
    expect(opened.find(element => element.type === "input" && !element.props.disabled)!.props.checked).toBe(true);

    dialog(opened).props.onOpenChange(false);
    opened.find(element => element.type === DialogContent)!.props.onCloseAutoFocus({ preventDefault: vi.fn() });
    expect(trigger.focus).toHaveBeenCalledTimes(1);
    expect(dialog(render()).props.open).toBe(false);
  });

  it("ne fait flotter aucune pastille, et laisse rouvrir les préférences après la fermeture du bandeau sans choix (PUB-12)", () => {
    render();
    button(render(), copy.close).props.onClick();
    const closed = render();
    expect(rootAttributes.has(COOKIE_BANNER_OPEN_ATTRIBUTE)).toBe(false);
    expect(closed.filter(element => /(?:^|\s)fixed(?:\s|$)/.test(String(element.props.className)))).toEqual([]);
    expect(savedConsent()).toBeNull();

    const opened = openFrom({ focus: vi.fn(), isConnected: true });
    expect(dialog(opened).props.open).toBe(true);
    expect(opened.find(element => element.type === "input" && !element.props.disabled)!.props.checked).toBe(false);
  });

  it("passe le bandeau devant le bouton WhatsApp, qui reste au-dessus de la zone sûre des petits écrans", () => {
    render();
    const banner = render().find(element => String(element.props.className).includes("cookie-consent-banner"))!;
    const whatsapp = /class="([^"]*)"/.exec(renderToStaticMarkup(createElement(WhatsAppButton)))![1];
    const layer = (className: string) => Number(/(?:^|\s)z-(\d+)(?:\s|$)/.exec(className)?.[1]);
    expect(banner.props.className).toContain("fixed bottom-0 left-0 right-0");
    expect(layer(banner.props.className)).toBeGreaterThan(layer(whatsapp));
    expect(whatsapp).toContain("bottom-[calc(env(safe-area-inset-bottom)+1rem)]");
    expect(whatsapp).toContain("right-4");
  });
});
