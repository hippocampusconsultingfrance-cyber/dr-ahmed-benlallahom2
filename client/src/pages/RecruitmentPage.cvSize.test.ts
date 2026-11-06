import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Taille du CV choisi dans le formulaire standard, sous son nom : en Ko pour un
// petit fichier (et non « 0.00 MB »), en Mo au-delà, avec les unités et la
// virgule ou le point décimal de la langue de la page.

const state = vi.hoisted(() => ({ language: "fr" }));

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: state.language }) }));
vi.mock("@/components/TurnstileWidget", () => ({ TurnstileWidget: function TurnstileWidget() { return null; } }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: function SEOHead() { return null; } }));
vi.mock("wouter", () => ({ useLocation: () => ["/recruitment/standard", vi.fn()], Link: () => null }));

const { default: RecruitmentPage } = await import("./RecruitmentPage");

type Element = { type: unknown; props: Record<string, any> };
const elements = () => elementsOf(renderStateful(RecruitmentPage as () => ReactElement)) as Element[];
const byId = (id: string) => elements().find(element => element.props.id === id)!;
const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as Element).props.children);
  return "";
};

/** The hint under the CV field once a PDF of `bytes` bytes is chosen, in the page's language. */
function hintFor(language: string, bytes: number) {
  resetStatefulHooks();
  state.language = language;
  byId("recruitment-cv").props.onChange({ target: { files: [new File([new Uint8Array(bytes)], "cv.pdf", { type: "application/pdf" })] } });
  return textOf(byId("recruitment-cv-hint").props.children).replace(/\u00a0/g, " ");
}

beforeEach(() => {
  vi.stubGlobal("window", { requestAnimationFrame: vi.fn() });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn(), getElementById: () => ({ focus: vi.fn() }) });
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("taille du CV choisi dans le formulaire standard", () => {
  it("donne un petit fichier en Ko en français, et non « 0.00 MB »", () => {
    expect(hintFor("fr", 3_200)).toBe("3 Ko · CV (PDF ou DOCX — 4 Mo maximum)");
    expect(hintFor("fr", 300)).toMatch(/^1 Ko · /);
  });

  it("donne un fichier vide, refusé, pour 0 Ko et non 1 Ko", () => {
    expect(hintFor("fr", 0)).toBe("0 Ko · CV (PDF ou DOCX — 4 Mo maximum)");
    expect(hintFor("en", 0)).toMatch(/^0 KB · /);
  });

  it("passe en Mo au-delà de 1 024 Ko, avec la virgule décimale en français et le point en anglais", () => {
    expect(hintFor("fr", 1_572_864)).toBe("1,5 Mo · CV (PDF ou DOCX — 4 Mo maximum)");
    expect(hintFor("en", 1_572_864)).toBe("1.5 MB · CV (PDF or DOCX — 4 MB maximum)");
    expect(hintFor("en", 250_000)).toMatch(/^244 KB · /);
    expect(hintFor("fr", 3 * 1024 * 1024 + 41_944)).toMatch(/^3,04 Mo · /);
  });

  it("arrondit au-dessus un CV refusé pour quelques octets de trop, qui ne se lit jamais « 4 Mo »", () => {
    const limit = 4 * 1024 * 1024;
    expect(hintFor("fr", limit)).toMatch(/^4 Mo · /);
    expect(hintFor("fr", limit + 1)).toMatch(/^4,01 Mo · /);
    expect(hintFor("fr", limit + 5_000)).toMatch(/^4,01 Mo · /);
    expect(hintFor("en", limit + 1)).toMatch(/^4\.01 MB · /);
    expect(hintFor("fr", limit + 10_486)).toMatch(/^4,02 Mo · /);
  });

  it("garde les unités KB et MB en allemand et en chinois, avec leur écriture des nombres", () => {
    expect(hintFor("de", 1_572_864)).toMatch(/^1,5 MB · Lebenslauf/);
    expect(hintFor("zh", 51_200)).toMatch(/^50 KB · 简历/);
  });
});
