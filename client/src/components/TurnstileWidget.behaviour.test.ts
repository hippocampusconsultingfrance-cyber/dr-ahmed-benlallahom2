import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Le widget Turnstile monté avec un faux script Cloudflare : un défi en cours
// survit aux re-rendus du formulaire, l’envoi reste bloqué sans jeton, et un
// échec rend le jeton au formulaire (null) avec un bouton pour relancer.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr" }) }));

type Options = { sitekey: string; callback: (token: string) => void; "error-callback": (code?: string) => boolean; "expired-callback": () => void };
const turnstile = vi.hoisted(() => ({ renders: [] as Options[], removed: [] as string[] }));

const { TurnstileWidget, TurnstileLoadError } = await import("./TurnstileWidget");
const { getTurnstileWidgetCopy } = await import("@/lib/publicFormCopy");

type Element = { type: unknown; props: Record<string, any> };
let submitListeners: Array<(event: { preventDefault: () => void }) => void>;
let headScripts: Array<{ id: string; src: string }>;

function mount(onToken: (token: string | null) => void) {
  return renderStateful(() => TurnstileWidget({ onToken }) as ReactElement, tree => {
    // As React would: the challenge container is attached before the effects run.
    const container = (elementsOf(tree) as Element[]).find(element => element.props.ref && "current" in element.props.ref)!;
    container.props.ref.current ??= {
      closest: () => ({
        addEventListener: (type: string, listener: (event: { preventDefault: () => void }) => void) => { if (type === "submit") submitListeners.push(listener); },
        removeEventListener: (type: string, listener: unknown) => { if (type === "submit") submitListeners = submitListeners.filter(item => item !== listener); },
      }),
    };
  });
}
const submitForm = () => {
  const event = { preventDefault: vi.fn() };
  for (const listener of submitListeners) listener(event);
  return event.preventDefault;
};
/** The Cloudflare script is already on the page (another form loaded it): the challenge renders at once. */
const useLoadedScript = () => vi.stubGlobal("document", { getElementById: () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }), head: { appendChild: vi.fn() } });
const loadError = (tree: ReactElement) => (elementsOf(tree) as Element[]).find(element => element.type === TurnstileLoadError);

beforeEach(() => {
  vi.useFakeTimers();
  turnstile.renders = [];
  turnstile.removed = [];
  submitListeners = [];
  headScripts = [];
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
  vi.stubGlobal("window", {
    turnstile: {
      render: (_container: unknown, options: Options) => { turnstile.renders.push(options); return `widget-${turnstile.renders.length}`; },
      remove: (id: string) => turnstile.removed.push(id),
    },
  });
  vi.stubGlobal("document", {
    getElementById: () => null,
    createElement: () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    head: { appendChild: (script: { id: string; src: string }) => headScripts.push(script) },
  });
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("garde-fous Turnstile des parcours publics", () => {
  it("charge le script Cloudflare une fois et rend un défi avec la clé du site", () => {
    mount(vi.fn());
    expect(headScripts).toEqual([expect.objectContaining({ src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" })]);
  });

  it("préserve le challenge actif lors des re-rendus sans l’invalider avant sa fin", () => {
    useLoadedScript();
    const firstOnToken = vi.fn();
    const latestOnToken = vi.fn();
    mount(firstOnToken);
    expect(turnstile.renders).toHaveLength(1);
    expect(turnstile.renders[0]!.sitekey).toBe("test-site-key");

    // The form re-renders (typing, new callbacks) while the visitor solves the challenge.
    mount(latestOnToken);
    mount(latestOnToken);
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(turnstile.renders).toHaveLength(1);
    expect(turnstile.removed).toEqual([]);
    expect(firstOnToken).not.toHaveBeenCalled();

    turnstile.renders[0]!.callback("token-after-a-slow-challenge");
    expect(latestOnToken).toHaveBeenCalledWith("token-after-a-slow-challenge");
    expect(firstOnToken).not.toHaveBeenCalled();
  });

  it("bloque l’envoi du formulaire tant qu’aucun jeton n’est obtenu", () => {
    useLoadedScript();
    const onToken = vi.fn();
    mount(onToken);

    expect(submitForm()).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(loadError(mount(onToken))).toBeDefined();

    turnstile.renders[0]!.callback("valid-token");
    expect(submitForm()).not.toHaveBeenCalled();
  });

  it("rend le jeton au formulaire et propose de relancer après un échec, puis rend un nouveau défi", () => {
    useLoadedScript();
    const onToken = vi.fn();
    mount(onToken);
    turnstile.renders[0]!.callback("valid-token");
    turnstile.renders[0]!["expired-callback"]();
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(submitForm()).toHaveBeenCalledTimes(1);

    const retry = loadError(mount(onToken))!;
    expect(retry.props.copy.loadError).toContain("L’envoi reste bloqué afin de protéger vos données");
    retry.props.onRetry();
    mount(onToken);
    expect(turnstile.removed).toEqual(["widget-1"]);
    expect(turnstile.renders).toHaveLength(2);
  });

  it("dit, dans chaque langue, que l’envoi reste bloqué tant que la vérification échoue", () => {
    expect(getTurnstileWidgetCopy("fr").loadError).toContain("L’envoi reste bloqué afin de protéger vos données");
    expect(getTurnstileWidgetCopy("en").loadError).toContain("Sending stays blocked to protect your data");
    expect(getTurnstileWidgetCopy("de").loadError).toContain("Zum Schutz Ihrer Daten bleibt das Senden gesperrt");
    expect(getTurnstileWidgetCopy("zh").loadError).toContain("为保护您的数据，发送仍被阻止");
  });
});
