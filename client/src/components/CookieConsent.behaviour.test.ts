import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Bandeau et préférences cookies rendus et utilisés : choix enregistré, vraie
// fenêtre de dialogue qui rend le focus à son déclencheur, et rechargement de
// la page quand la mesure d’audience est retirée (le script déjà chargé
// continuerait sinon de suivre la navigation).

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr" }) }));

const { default: CookieConsent, COOKIE_BANNER_OPEN_ATTRIBUTE, COOKIE_POLICY_HREF, cookieCopy } = await import("./CookieConsent");
const { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent } = await import("./cookieConsentState");
const { Dialog, DialogContent } = await import("@/components/ui/dialog");

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

const render = (props: { showPreferencesShortcut?: boolean } = {}) => elementsOf(renderStateful(() => CookieConsent(props) as ReactElement)) as Element[];
const button = (elements: Element[], label: string) => elements.find(element => typeof element.props.onClick === "function" && (textOf(element).trim() === label || element.props["aria-label"] === label))!;
const dialog = (elements: Element[]) => elements.find(element => element.type === Dialog)!;
const savedConsent = () => JSON.parse(stored.get(COOKIE_CONSENT_STORAGE_KEY) ?? "null");

beforeEach(() => {
  stored = new Map();
  reload = vi.fn();
  events = [];
  rootAttributes = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); }, removeItem: (key: string) => { stored.delete(key); } });
  vi.stubGlobal("window", { location: { reload }, dispatchEvent: (event: Event) => { events.push(event.type); return true; } });
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
    const shortcut = button(render(), copy.settings);
    shortcut.props.onClick({ currentTarget: { focus: vi.fn(), isConnected: true } });
    const preferences = render();
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
    button(render(), copy.settings).props.onClick({ currentTarget: { focus: vi.fn(), isConnected: true } });
    render().find(element => element.type === "input" && !element.props.disabled)!.props.onChange({ target: { checked: true } });
    button(render(), copy.save).props.onClick();
    expect(savedConsent()).toMatchObject({ performance: true });
    expect(reload).not.toHaveBeenCalled();
  });

  it("utilise une vraie fenêtre modale qui rend le focus à son déclencheur à la fermeture (PUB-A11Y-04)", () => {
    stored.set(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(createCookieConsent(false)));
    render();
    const trigger = { focus: vi.fn(), isConnected: true };
    button(render(), copy.settings).props.onClick({ currentTarget: trigger });

    const opened = render();
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
    button(render(), copy.settings).props.onClick({ currentTarget: { focus: vi.fn(), isConnected: true } });
    const preferences = render();
    expect(preferences.filter(element => element.type === "input").map(element => Boolean(element.props.disabled))).toEqual([true, false]);
    expect(textOf(preferences.find(element => element.props["data-testid"] === "cookie-functional-storage"))).toContain(copy.functionalDescription);
    for (const language of Object.values(cookieCopy)) expect(language).not.toHaveProperty("preferences");
  });

  it("masque la pastille « Préférences cookies » quand la page le demande", () => {
    stored.set(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(createCookieConsent(false)));
    render({ showPreferencesShortcut: false });
    expect(render({ showPreferencesShortcut: false }).find(element => element.props["aria-label"] === copy.settings && String(element.props.className).includes("cookie-preferences-shortcut"))).toBeUndefined();
  });
});
