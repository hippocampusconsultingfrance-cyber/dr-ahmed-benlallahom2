import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Candidature VVIP offshore remplie et envoyée : ce qui part vers
// /api/recruitment/apply (tous les environnements cochés, spécialité « Autre »
// précisée et bornée, pays du diplôme y compris prérempli par un navigateur
// mobile), la confirmation qui n’apparaît qu’avec un numéro de suivi, et un
// sélecteur de CV utilisable au clavier.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));
const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/components/TurnstileWidget", () => ({ TurnstileWidget: function TurnstileWidget() { return null; } }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("wouter", () => ({ useLocation: () => ["/recruitment/vvip-offshore", vi.fn()], Link: () => null }));

const { default: VvipOffshorePage, vvipOffshoreCopy, VVIP_CUSTOM_SPECIALTY_MAX_LENGTH } = await import("./VvipOffshorePage");
const { TurnstileWidget } = await import("@/components/TurnstileWidget");

type Element = { type: unknown; props: Record<string, any> };
const t = vvipOffshoreCopy.fr;
const elements = () => elementsOf(renderStateful(VvipOffshorePage as () => ReactElement)) as Element[];
const byId = (id: string) => elements().find(element => element.props.id === id)!;
const change = (id: string, event: unknown) => byId(id).props.onChange(event);
const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as Element).props.children);
  return "";
};

let visibleFields: Array<[string, string]>;
class FormDataFromVisibleFields extends FormData {
  constructor(form?: unknown) {
    super();
    if (form) for (const [name, value] of visibleFields) this.append(name, value);
  }
}
let sent: FormData[];
let answer: () => Promise<Response>;

function fillRequiredFields() {
  change("vvip-firstName", { target: { value: "Karim" } });
  change("vvip-lastName", { target: { value: "Saidi" } });
  change("vvip-email", { target: { value: "karim@example.org" } });
  change("vvip-specialty", { target: { value: t.specialties[0] } });
  change("vvip-environment-0", {});
  change("vvip-cv", { target: { files: [new File(["%PDF-1.7\n"], "cv.pdf", { type: "application/pdf" })] } });
  change("vvip-gdpr-consent", { target: { checked: true } });
  elements().find(element => element.type === TurnstileWidget)!.props.onToken("single-use-token");
}
const submit = () => elements().find(element => element.type === "form")!.props.onSubmit({ preventDefault: vi.fn(), currentTarget: {} });

beforeEach(() => {
  view.language = "fr";
  sent = [];
  visibleFields = [];
  answer = async () => new Response(JSON.stringify({ trackingId: "CV-2026-VVIP01" }), { status: 200, headers: { "Content-Type": "application/json" } });
  vi.stubGlobal("FormData", FormDataFromVisibleFields);
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: FormData }) => { sent.push(init.body); return answer(); }));
  vi.stubGlobal("window", { requestAnimationFrame: vi.fn() });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn(), getElementById: () => ({ focus: vi.fn() }) });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("envoi de la candidature VVIP offshore", () => {
  it("envoie chaque environnement coché, la spécialité « Autre » précisée et le pays du diplôme", async () => {
    fillRequiredFields();
    change("vvip-environment-2", {});
    change("vvip-specialty", { target: { value: t.specialties[t.specialties.length - 1] } });
    expect(byId("vvip-specialty-custom").props.maxLength).toBe(VVIP_CUSTOM_SPECIALTY_MAX_LENGTH);
    change("vvip-specialty-custom", { target: { value: "  Médecin hyperbare  " } });
    change("vvip-diploma-country", { target: { value: "Tunisie" } });

    await submit();

    expect(sent).toHaveLength(1);
    const environments = JSON.parse(String(sent[0]!.get("targetCountries")));
    expect(environments).toHaveLength(2);
    expect(String(sent[0]!.get("message"))).toContain(environments.join(", "));
    expect(sent[0]!.get("specialty")).toBe("[VVIP / Offshore] Médecin hyperbare");
    expect(sent[0]!.get("diplomaCountry")).toBe("Tunisie");
  });

  it("récupère un pays reconnu affiché par un navigateur mobile au moment de l’envoi", async () => {
    fillRequiredFields();
    visibleFields = [["diplomaCountry", "Maroc"]];
    await submit();
    expect(sent[0]!.get("diplomaCountry")).toBe("Maroc");
  });

  it("refuse l’option « Autre » sans précision, sans rien envoyer", async () => {
    fillRequiredFields();
    change("vvip-diploma-country", { target: { value: "Tunisie" } });
    change("vvip-specialty", { target: { value: t.specialties[t.specialties.length - 1] } });
    await submit();
    expect(sent).toEqual([]);
  });

  it("ne confirme jamais une candidature sans numéro de suivi du serveur", async () => {
    fillRequiredFields();
    change("vvip-diploma-country", { target: { value: "Tunisie" } });
    answer = async () => new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    await submit();
    expect(sent).toHaveLength(1);
    expect(textOf(elements())).not.toContain("VVIP-OK");
    expect(elements().find(element => element.type === "form")).toBeDefined();
  });

  it("rend le sélecteur de CV utilisable au clavier et correctement décrit, avec le remplissage automatique du nom", () => {
    const tree = elements();
    const cv = tree.find(element => element.props.id === "vvip-cv")!;
    expect(cv.props).toMatchObject({ type: "file", "aria-describedby": "vvip-cv-hint" });
    expect(cv.props.className).toContain("sr-only");
    expect(tree.find(element => element.type === "label" && element.props.htmlFor === "vvip-cv")).toBeDefined();
    expect(tree.find(element => element.props.id === "vvip-cv-hint")).toBeDefined();
    expect(tree.find(element => element.props.id === "vvip-firstName")!.props.autoComplete).toBe("given-name");
    expect(tree.find(element => element.props.id === "vvip-lastName")!.props.autoComplete).toBe("family-name");
  });

  it.each(["fr", "en", "de", "zh"] as const)("utilise les aides de saisie et les spécialités de la langue de la page (%s)", language => {
    view.language = language;
    const copy = vvipOffshoreCopy[language];
    const tree = elements();
    expect(tree.filter(element => element.props.placeholder === copy.experiencePlaceholder)).toHaveLength(1);
    expect(tree.filter(element => element.props.placeholder === copy.certificationsPlaceholder)).toHaveLength(1);
    const options = tree.filter(element => element.type === "option").map(element => element.props.value);
    for (const specialty of copy.specialties) expect(options).toContain(specialty);
  });
});
