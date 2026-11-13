// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blendSrgb, oklchToSrgb, srgbContrastRatio, type Srgb } from "@/lib/contrast";

// A11Y-22 — chaque texte affiché par les pages de l'espace candidat (accès, activation, coffre,
// nouveau mot de passe), mesuré sur le fond peint derrière lui : couleurs et fonds relevés dans
// les classes que React rend, teintes lues dans la palette de Tailwind (theme.css) et dans les
// jetons de client/src/index.css, en thème clair et sombre. Une classe de couleur que la mesure
// ne sait pas lire fait échouer le test plutôt que d'être ignorée.

const api = vi.hoisted(() => ({
  queries: {} as Record<string, { data?: unknown; isError?: boolean }>,
  succeeded: new Set<string>(),
}));

/** Any member, call or awaited call of trpc.useUtils() does nothing. */
const inert: unknown = vi.hoisted(() => {
  const proxy: unknown = new Proxy(() => undefined, { get: (_target, key) => (key === "then" ? undefined : proxy), apply: () => Promise.resolve() });
  return proxy;
});

vi.mock("@/lib/trpc", () => {
  // Every mutation fails as the server refuses it, which shows the page's message.
  const procedure = (name: string) => ({
    useQuery: () => ({ data: api.queries[name]?.data, isLoading: false, isFetching: false, isError: api.queries[name]?.isError ?? false, refetch: () => undefined }),
    useMutation: (options?: { onError?: (error: unknown) => void }) => ({
      mutate: () => options?.onError?.({ message: "Identifiants invalides.", data: { code: "UNAUTHORIZED" } }),
      isPending: false,
      isSuccess: api.succeeded.has(name),
    }),
  });
  return { trpc: { useUtils: () => inert, candidatePortal: new Proxy({}, { get: (_target, name) => procedure(String(name)) }) } };
});
vi.mock("@/components/TurnstileWidget", () => ({ TurnstileWidget: () => null }));

const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { default: CandidateAccessPage } = await import("./CandidateAccessPage");
const { default: CandidateVerifyPage } = await import("./CandidateVerifyPage");
const { default: CandidatePortalPage } = await import("./CandidatePortalPage");
const { default: CandidateResetPasswordPage } = await import("./CandidateResetPasswordPage");

const root = path.resolve(import.meta.dirname, "../../..");
type Theme = "light" | "dark";
type Paint = { colors: readonly Srgb[]; alpha: number };

function hexColor(hex: string): Paint {
  const digits = hex.replace("#", "");
  const full = digits.length <= 4 ? [...digits].map(digit => digit + digit).join("") : digits;
  const channels = [0, 2, 4, 6].map(index => Number.parseInt(full.slice(index, index + 2) || "ff", 16) / 255);
  return { colors: [channels.slice(0, 3) as unknown as Srgb], alpha: channels[3]! };
}

/** oklch(55.4% 0.046 257.417), oklch(0.66 0.2 25), #fff, rgba(8,145,178,0.26). */
function cssColor(value: string): Paint {
  const oklch = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim());
  if (oklch) return { colors: [oklchToSrgb([Number(oklch[1]) / (oklch[2] ? 100 : 1), Number(oklch[3]), Number(oklch[4])])], alpha: 1 };
  if (/^#[\da-f]{3,8}$/i.test(value.trim())) return hexColor(value.trim());
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value.trim());
  if (rgb) return { colors: [[Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255]], alpha: rgb[4] === undefined ? 1 : Number(rgb[4]) };
  throw new Error(`colour not read: ${value}`);
}

/** The `--name: value;` declarations of every rule with exactly this selector in a style sheet. */
function declarations(css: string, selector: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, body] of css.matchAll(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{\\n([\\s\\S]*?)^\\}`, "gm"))) {
    for (const [, name, value] of body!.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) found[name!] = value!;
  }
  return found;
}

/** Tailwind's palette, as the build reads it: --color-slate-400, --color-white… */
const palette = new Map(Object.entries(declarations(readFileSync(path.join(root, "node_modules/tailwindcss/theme.css"), "utf8"), "@theme default")).flatMap(([name, value]) => {
  const colour = /^color-(.+)$/.exec(name)?.[1];
  return colour ? [[colour, cssColor(value)] as const] : [];
}));

const siteCss = readFileSync(path.join(root, "client/src/index.css"), "utf8");
/** The site's own colours (bg-card, text-destructive, gold…), most of them a token of the theme. */
const siteColours = Object.fromEntries(Object.entries(declarations(siteCss, "@theme inline")).flatMap(([name, value]) => {
  const colour = /^color-(.+)$/.exec(name)?.[1];
  return colour ? [[colour, value]] : [];
}));
const darkTokens = declarations(siteCss, ":root");
const lightTokens = { ...darkTokens, ...declarations(siteCss, ":root:not(.dark)") };
/** Inside .theme-dark-island, the light theme takes the dark tokens it redefines there. */
const islandTokens = { ...lightTokens, ...declarations(siteCss, ":root:not(.dark) .theme-dark-island") };

/** A class split into its variants (dark:, data-[placeholder]:, sm:…) and its utility, `:` inside brackets left alone. */
function parseClass(className: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of className) {
    if (character === "[" || character === "(") depth += 1;
    if (character === "]" || character === ")") depth -= 1;
    if (character === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else current += character;
  }
  return { variants: parts, utility: current.replace(/^!/, "") };
}

/** Whether a variant holds for this element at rest, at the width of a computer: no hover, focus or open menu. */
function variantHolds(variant: string, element: Element, theme: Theme) {
  if (/^(?:sm|md|lg|xl|2xl)$/.test(variant)) return true;
  // @custom-variant dark (&:is(.dark *)): html.dark in the dark theme, or a .dark above the element.
  if (variant === "dark") return theme === "dark" || element.parentElement?.closest(".dark") != null;
  const data = /^data-\[([\w-]+)(?:=([^\]]+))?\]$/.exec(variant) ?? /^data-([\w-]+)()$/.exec(variant);
  if (data) return element.hasAttribute(`data-${data[1]}`) && (!data[2] || element.getAttribute(`data-${data[1]}`) === data[2]);
  const aria = /^aria-([\w-]+)$/.exec(variant);
  if (aria) return element.getAttribute(`aria-${aria[1]}`) === "true";
  return false;
}

/** The utilities that apply to this element at rest, those of a variant after the others, as Tailwind orders its rules. */
function utilitiesOf(element: Element, theme: Theme) {
  const classes = [...element.classList].map(parseClass).filter(({ variants }) => variants.every(variant => variantHolds(variant, element, theme)));
  return [...classes.filter(({ variants }) => variants.length === 0), ...classes.filter(({ variants }) => variants.length > 0)].map(({ utility }) => utility);
}

const TEXT_NOT_COLOUR = /^(?:xs|sm|base|lg|xl|[2-9]xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|\[[\d.]+(?:px|rem|em)\])$/;
const BACKGROUND_NOT_COLOUR = /^(?:none|cover|contain|center|top|bottom|left|right|fixed|local|scroll|no-repeat|repeat(?:-[xy])?|auto|(?:clip|origin|blend)-[\w-]+)$/;

/**
 * The paint of a colour of text-* or bg-*: the palette, the site's colours in this theme (the dark
 * tokens inside .theme-dark-island), or an arbitrary colour; a gradient gives each colour it can
 * show behind a text. null: not a colour (text-sm, bg-cover). Anything else fails the test.
 */
function paintOf(kind: "text" | "bg", value: string, element: Element, theme: Theme): Paint | "inherit" | null {
  if ((kind === "text" ? TEXT_NOT_COLOUR : BACKGROUND_NOT_COLOUR).test(value)) return null;
  const [, name, opacity] = /^(.+?)(?:\/(\d+|\[[\d.]+\]))?$/.exec(value)!;
  const alpha = opacity === undefined ? 1 : opacity.startsWith("[") ? Number(opacity.slice(1, -1)) : Number(opacity) / 100;
  const withAlpha = (paint: Paint): Paint => ({ colors: paint.colors, alpha: paint.alpha * alpha });
  if (name === "transparent") return { colors: [[0, 0, 0]], alpha: 0 };
  if (kind === "text" && (name === "inherit" || name === "current")) return "inherit";
  if (/^\[#[\da-f]{3,8}\]$/i.test(name!)) return withAlpha(hexColor(name!.slice(1, -1)));
  if (kind === "bg" && /^\[.*gradient\(/.test(name!)) {
    // Every opaque stop, and every translucent one over each of them: what a text may sit on.
    const stops = [...name!.matchAll(/#[\da-f]{3,8}\b|rgba?\([^)]*\)/gi)].map(([stop]) => cssColor(stop));
    const opaque = stops.filter(stop => stop.alpha === 1).flatMap(stop => stop.colors);
    const translucent = stops.filter(stop => stop.alpha < 1);
    if (opaque.length === 0) throw new Error(`gradient without an opaque colour: bg-${value}`);
    return { colors: [...opaque, ...translucent.flatMap(stop => opaque.map(under => blendSrgb(stop.colors[0]!, stop.alpha, under)))], alpha: 1 };
  }
  if (palette.has(name!)) return withAlpha(palette.get(name!)!);
  if (name! in siteColours) {
    const island = element.closest(".theme-dark-island") != null;
    const tokens = theme === "dark" ? darkTokens : island ? islandTokens : lightTokens;
    // In the light theme, text-primary outside an island takes the darker --primary-strong (PUB-A11Y-03).
    const token = kind === "text" && name === "primary" && theme === "light" && !island ? "primary-strong" : /^var\(--([\w-]+)\)$/.exec(siteColours[name!]!)?.[1];
    const colour = token ? tokens[token] : siteColours[name!];
    if (!colour) throw new Error(`token without a value in the ${theme} theme: ${kind}-${value}`);
    return withAlpha(cssColor(colour));
  }
  throw new Error(`colour class this measure does not read: ${kind}-${value}`);
}

/** The last colour of this kind the element sets, if it sets one. */
function ownPaint(kind: "text" | "bg", element: Element, theme: Theme) {
  let paint: Paint | "inherit" | null = null;
  for (const utility of utilitiesOf(element, theme)) {
    if (!utility.startsWith(`${kind}-`)) continue;
    if (kind === "bg" && /^bg-(?:linear|radial|conic|gradient)-/.test(utility)) throw new Error(`gradient of from-/via-/to- this measure does not read: ${utility}`);
    paint = paintOf(kind, utility.slice(kind.length + 1), element, theme) ?? paint;
  }
  return paint;
}

const HIDDEN_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "TITLE", "SELECT", "OPTION"]);
const DISPLAY = /^(?:hidden|block|inline|inline-block|flex|inline-flex|grid|inline-grid|contents|table)$/;

/** Text no one sees: sr-only, hidden, aria-hidden (decorative), or visually hidden by Radix. */
function isHidden(element: Element, theme: Theme): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (HIDDEN_TAGS.has(node.tagName) || node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return true;
    if (/clip:\s*rect\(0/.test(node.getAttribute("style") ?? "")) return true;
    const utilities = utilitiesOf(node, theme);
    if (utilities.filter(utility => utility === "sr-only" || utility === "not-sr-only").at(-1) === "sr-only") return true;
    if (utilities.filter(utility => DISPLAY.test(utility)).at(-1) === "hidden" || utilities.includes("invisible")) return true;
  }
  return false;
}

type Measure = { text: string; ratio: number; textClass: string; backgrounds: string[] };

/** Contrast of every visible text under `container`, in the worst place it may be painted. */
function measureTexts(container: Element, theme: Theme): Measure[] {
  const measures: Measure[] = [];
  const walker = container.ownerDocument.createTreeWalker(container, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? "";
    const element = node.parentElement;
    if (!text || !element || isHidden(element, theme)) continue;
    let textPaint: Paint | undefined;
    let textClass = "";
    for (let ancestor: Element | null = element; ancestor && !textPaint; ancestor = ancestor.parentElement) {
      const paint = ownPaint("text", ancestor, theme);
      if (paint && paint !== "inherit") {
        textPaint = paint;
        textClass = utilitiesOf(ancestor, theme).filter(utility => utility.startsWith("text-")).join(" ");
      }
    }
    if (!textPaint) throw new Error(`no text colour above « ${text} »`);
    // The backgrounds from the text up to the first opaque one, which the translucent ones lie over.
    const layers: Paint[] = [];
    const backgrounds: string[] = [];
    let backdrop: readonly Srgb[] | undefined;
    for (let ancestor: Element | null = element; ancestor && !backdrop; ancestor = ancestor.parentElement) {
      const opacity = utilitiesOf(ancestor, theme).find(utility => /^opacity-\d+$/.test(utility) && utility !== "opacity-100");
      if (opacity) throw new Error(`${opacity} above « ${text} », which this measure does not read`);
      const paint = ownPaint("bg", ancestor, theme);
      if (!paint || paint === "inherit" || paint.alpha === 0) continue;
      backgrounds.push(utilitiesOf(ancestor, theme).filter(utility => utility.startsWith("bg-")).join(" "));
      if (paint.alpha === 1) backdrop = paint.colors;
      else layers.push(paint);
    }
    if (!backdrop) throw new Error(`no opaque background behind « ${text} »`);
    const surfaces = layers.reduceRight((unders, layer) => unders.map(under => blendSrgb(layer.colors[0]!, layer.alpha, under)), backdrop);
    const ratio = Math.min(...surfaces.flatMap(surface => textPaint.colors.map(colour => srgbContrastRatio(blendSrgb(colour, textPaint.alpha, surface), surface))));
    measures.push({ text, ratio, textClass, backgrounds });
  }
  return measures;
}

/** The page mounted by React at this address, after `interact` has done what the visitor does. */
async function mount(page: () => unknown, address: string, interact?: (container: HTMLElement) => void) {
  window.history.replaceState(null, "", address);
  localStorage.setItem("language", "fr");
  const { container } = render(createElement(LanguageProvider, null, createElement(page as never)));
  await act(async () => interact?.(container));
  return container;
}
const submit = (selector: string) => (container: HTMLElement) => { fireEvent.submit(container.querySelector(selector)!); };

afterEach(() => {
  cleanup();
  localStorage.clear();
  api.queries = {};
  api.succeeded.clear();
});

const signedIn = () => {
  api.queries.me = { data: { id: 7, firstName: "Vera" } };
  api.queries.sessions = { data: [{ id: 1, deviceLabel: "Firefox sur Linux", current: true, lastSeenAt: "2026-11-12T09:00:00.000Z" }, { id: 2, deviceLabel: "Safari sur iPhone", current: false, lastSeenAt: "2026-11-10T18:30:00.000Z" }] };
  api.queries.documents = { data: [{ id: 3, category: "cv", categoryOtherLabel: null, originalName: "CV Vera Rossi.pdf", sizeBytes: 182_000, status: "pending_review" }] };
};
const activationLink = "/candidate/verify?email=candidat%40example.com&token=activation-token";
const withActivationDetails = () => { api.queries.activationDetails = { data: { email: "candidat@example.com", firstName: "Vera", lastName: "Rossi" } }; };

/** Each page in the states a visitor reaches, messages included. */
const SCREENS: Array<[string, () => Promise<HTMLElement>]> = [
  ["accès : connexion refusée", () => mount(CandidateAccessPage, "/candidate/access", submit("#candidate-access-form"))],
  ["accès : invitation", () => { api.queries.resolveInvitation = { data: { email: "candidat@example.com", firstName: "Vera", lastName: "Rossi", expired: false } }; return mount(CandidateAccessPage, `/candidate/access?invite=${"i".repeat(32)}`); }],
  ["accès : inscription sans consentement", () => mount(CandidateAccessPage, "/candidate/access", container => {
    fireEvent.click([...container.querySelectorAll("button[aria-controls='candidate-access-form']")][1]!);
    fireEvent.submit(container.querySelector("#candidate-access-form")!);
  })],
  ["activation : formulaire et mots de passe différents", () => { withActivationDetails(); return mount(CandidateVerifyPage, activationLink, container => {
    fireEvent.change(container.querySelector("#candidate-activation-password")!, { target: { value: "un mot de passe assez long" } });
    fireEvent.submit(container.querySelector("form")!);
  }); }],
  ["activation : compte activé", () => { withActivationDetails(); api.succeeded.add("verifyEmail"); return mount(CandidateVerifyPage, activationLink); }],
  ["activation : lien refusé", () => { api.queries.activationDetails = { isError: true }; return mount(CandidateVerifyPage, activationLink); }],
  ["coffre : documents, sessions et envoi refusé", () => { signedIn(); return mount(CandidatePortalPage, "/candidate/portal", submit("form")); }],
  ["coffre : aucun document", () => { signedIn(); api.queries.documents = { data: [] }; return mount(CandidatePortalPage, "/candidate/portal"); }],
  ["coffre : documents indisponibles", () => { signedIn(); api.queries.documents = { isError: true }; return mount(CandidatePortalPage, "/candidate/portal"); }],
  ["nouveau mot de passe : refusé", () => mount(CandidateResetPasswordPage, "/candidate/reset-password?email=candidat%40example.com&token=reset-token", submit("form"))],
];

describe("A11Y-22 — textes de l'espace candidat sur les fonds où ils sont peints", () => {
  it.each(SCREENS)("%s : chaque texte visible atteint 4,5:1, en thème clair et sombre", async (_screen, open) => {
    const container = await open();
    const below: string[] = [];
    let measured = 0;
    for (const theme of ["light", "dark"] as const) {
      for (const { text, ratio, textClass, backgrounds } of measureTexts(container, theme)) {
        measured += 1;
        if (ratio < 4.5) below.push(`${theme}: « ${text.slice(0, 60)} » ${textClass} on ${backgrounds.join(" < ")} = ${ratio.toFixed(2)}`);
      }
    }
    expect(measured).toBeGreaterThanOrEqual(6);
    expect(below).toEqual([]);
  });

  it("montre les messages que les écrans ci-dessus doivent mesurer", async () => {
    const notices: Element[] = [];
    for (const [screen, selector] of [[0, "[role='status']"], [3, "[role='status']"], [6, "#candidate-document-upload-message"], [9, "[role='status']"]] as const) {
      notices.push(...(await SCREENS[screen]![1]()).querySelectorAll(selector));
      cleanup();
    }
    expect(notices.map(notice => notice.textContent?.trim() !== "" && !isHidden(notice, "light"))).toEqual([true, true, true, true]);
  });
});

describe("A11Y-22 — la mesure elle-même", () => {
  afterEach(() => { document.body.replaceChildren(); });

  function screen(html: string) {
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    return container;
  }

  it("mesure comme insuffisant l'ancien gris slate-500 sur le fond candidat, et lit les fonds translucides, les jetons et les dégradés", () => {
    const [grey, overTint, token, gradient] = measureTexts(screen(`<main class="bg-[#030a12] text-white">
      <p class="text-slate-500">gris</p>
      <div class="bg-cyan-400/10"><p class="text-cyan-100">sur la teinte</p></div>
      <div class="bg-slate-950/80"><p class="text-destructive">erreur</p></div>
      <section class="bg-[radial-gradient(circle,rgba(8,145,178,0.26),transparent_42%),linear-gradient(150deg,#06243a,#06121e)]"><p class="text-slate-300">dégradé</p></section>
    </main>`), "light");
    expect(grey!.ratio).toBeLessThan(4.5);
    expect(overTint!.ratio).toBeGreaterThan(10);
    // The light theme's red, made for light backgrounds, does not read on the candidate space's dark one.
    expect(token!.ratio).toBeLessThan(4.5);
    expect(gradient!.ratio).toBeGreaterThanOrEqual(4.5);
    expect(measureTexts(screen(`<main class="dark bg-[#030a12]"><p class="text-destructive dark:text-red-300">erreur</p></main>`), "light")[0]!.ratio).toBeGreaterThan(4.5);
  });

  it("refuse une couleur ou un effet qu'elle ne sait pas lire, plutôt que de l'ignorer", () => {
    for (const html of [
      `<main class="bg-[#030a12]"><p class="text-[rgb(1,2,3)]">x</p></main>`,
      `<main class="bg-[#030a12]"><p class="text-slate-950 text-brand">x</p></main>`,
      `<main class="bg-linear-to-r from-slate-950 to-cyan-950 text-white"><p>x</p></main>`,
      `<main class="bg-[#030a12] text-white"><p class="opacity-60">x</p></main>`,
      `<main class="bg-cyan-950/40 text-white"><p>x</p></main>`,
    ]) {
      expect(() => measureTexts(screen(html), "dark"), html).toThrow();
    }
    expect(measureTexts(screen(`<main class="bg-[#030a12] text-white"><span class="sr-only">lecteur d'écran</span><span aria-hidden="true">·</span></main>`), "dark")).toEqual([]);
  });
});
