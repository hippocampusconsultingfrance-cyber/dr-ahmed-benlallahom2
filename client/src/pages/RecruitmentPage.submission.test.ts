import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Candidature standard remplie et envoyée comme par un candidat : ce qui part
// vers /api/recruitment/apply (pays du diplôme, y compris prérempli par un
// navigateur mobile, spécialité « Autre » précisée, pays « Autre » précisé,
// langues), la confirmation qui n’apparaît qu’avec un numéro de suivi du
// serveur, et les champs de recherche nommés pour les lecteurs d’écran.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr" }) }));
vi.mock("@/components/TurnstileWidget", () => ({ TurnstileWidget: function TurnstileWidget() { return null; } }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: function SEOHead() { return null; } }));
vi.mock("wouter", () => ({ useLocation: () => ["/recruitment/standard", vi.fn()], Link: () => null }));

const { default: RecruitmentPage, countryOptions } = await import("./RecruitmentPage");
const { TurnstileWidget } = await import("@/components/TurnstileWidget");
const { SEOHead } = await import("@/components/SEOHead");

type Element = { type: unknown; props: Record<string, any> };
const elements = () => elementsOf(renderStateful(RecruitmentPage as () => ReactElement)) as Element[];
const byId = (id: string) => elements().find(element => element.props.id === id)!;
const change = (id: string, event: unknown) => byId(id).props.onChange(event);
const languageBoxes = () => elements().filter(element => element.type === "input" && element.props.type === "checkbox" && !element.props.id);
const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as Element).props.children);
  return "";
};

/** The visible fields of the form, as a mobile browser may fill them without React knowing. */
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
  change("recruitment-firstName", { target: { value: "Amina" } });
  change("recruitment-lastName", { target: { value: "Haddad" } });
  change("recruitment-email", { target: { value: "amina@example.org" } });
  change("recruitment-specialty", { target: { value: "Médecine d’urgence" } });
  change("recruitment-target-country-0", {});
  change("recruitment-cv", { target: { files: [new File(["%PDF-1.7\n"], "cv.pdf", { type: "application/pdf" })] } });
  change("recruitment-gdpr-consent", { target: { checked: true } });
  elements().find(element => element.type === TurnstileWidget)!.props.onToken("single-use-token");
}
const submit = () => elements().find(element => element.type === "form")!.props.onSubmit({ preventDefault: vi.fn(), currentTarget: {} });

beforeEach(() => {
  sent = [];
  visibleFields = [];
  answer = async () => new Response(JSON.stringify({ trackingId: "CV-2026-ABCDEF" }), { status: 200, headers: { "Content-Type": "application/json" } });
  vi.stubGlobal("FormData", FormDataFromVisibleFields);
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: FormData }) => { sent.push(init.body); return answer(); }));
  vi.stubGlobal("window", { requestAnimationFrame: vi.fn() });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn(), getElementById: () => ({ focus: vi.fn() }) });
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("envoi de la candidature standard", () => {
  it("garde la liste des pays du diplôme fermée jusqu’à une interaction explicite", () => {
    expect(elements().find(element => element.props.id === "recruitment-diploma-country-options")).toBeUndefined();
    byId("recruitment-diploma-country-search").props.onFocus();
    expect(elements().find(element => element.props.id === "recruitment-diploma-country-options")).toBeDefined();
  });

  it("transmet le pays du diplôme choisi, la spécialité précisée, le pays « Autre » précisé et les langues", async () => {
    fillRequiredFields();
    byId("recruitment-diploma-country-search").props.onInput({ currentTarget: { value: "Tunisie" } });
    change("recruitment-specialty", { target: { value: "Autre spécialité ou profession" } });
    change("recruitment-specialty-custom", { target: { value: "  Perfusionniste  " } });
    change(`recruitment-target-country-${countryOptions.length - 1}`, {});
    change("recruitment-other-target-country", { target: { value: " Islande " } });
    languageBoxes()[1]!.props.onChange();
    languageBoxes()[7]!.props.onChange();
    change("recruitment-other-language", { target: { value: "Italien, , russe " } });

    await submit();

    expect(sent).toHaveLength(1);
    const body = sent[0]!;
    expect(body.get("diplomaCountry")).toBe("Tunisie");
    expect(body.get("specialty")).toBe("Perfusionniste");
    expect(JSON.parse(String(body.get("targetCountries")))).toEqual(["France", "Autre pays : Islande"]);
    expect(JSON.parse(String(body.get("languages")))).toEqual(["French", "Italien", "russe"]);
    expect(body.get("turnstileToken")).toBe("single-use-token");
    expect((body.get("cv") as File).name).toBe("cv.pdf");
  });

  it("récupère un pays reconnu affiché par un navigateur mobile au moment de l’envoi", async () => {
    fillRequiredFields();
    visibleFields = [["diplomaCountry", "Maroc"]];
    await submit();
    expect(sent[0]!.get("diplomaCountry")).toBe("Maroc");
  });

  it("refuse l’option « Autre » sans précision, sans rien envoyer", async () => {
    fillRequiredFields();
    byId("recruitment-diploma-country-search").props.onInput({ currentTarget: { value: "Tunisie" } });
    change("recruitment-specialty", { target: { value: "Autre spécialité ou profession" } });
    await submit();
    expect(sent).toEqual([]);
    expect(byId("recruitment-specialty-custom").props["aria-invalid"]).toBe(true);
  });

  it("ne confirme jamais une candidature sans numéro de suivi du serveur", async () => {
    fillRequiredFields();
    byId("recruitment-diploma-country-search").props.onInput({ currentTarget: { value: "Tunisie" } });
    answer = async () => new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    await submit();
    expect(sent).toHaveLength(1);
    expect(elements().filter(element => element.props.role === "status").map(textOf).join(" ")).not.toContain("CV-");
    expect(elements().find(element => element.type === "form")).toBeDefined();

    answer = async () => new Response(JSON.stringify({ trackingId: "CV-2026-ABCDEF" }), { status: 200, headers: { "Content-Type": "application/json" } });
    elements().find(element => element.type === TurnstileWidget)!.props.onToken("second-token");
    await submit();
    expect(elements().find(element => element.props.role === "status" && textOf(element).includes("CV-2026-ABCDEF"))).toBeDefined();
  });

  it("associe les recherches de spécialité et de pays à un nom accessible, et publie une adresse canonique dédiée", () => {
    const tree = elements();
    expect(tree.find(element => element.props.id === "recruitment-specialty")!.props["aria-labelledby"]).toBe("recruitment-specialty-label");
    expect(tree.find(element => element.props.id === "recruitment-specialty-label")).toBeDefined();
    expect(tree.find(element => element.props.id === "recruitment-diploma-country-search")!.props["aria-labelledby"]).toBe("recruitment-diploma-country-label");
    expect(tree.find(element => element.props.id === "recruitment-diploma-country-label")).toBeDefined();
    expect(tree.find(element => element.type === SEOHead)!.props.ogUrl).toBe("https://drahmedbenlallahom.com/recruitment/standard");
  });
});
