import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// IA-02 — vivier filtré par certification : le filtre trouve aussi ce que l’IA
// a lu dans le CV, la carte dit d’où vient chaque certification retenue.

// The component's useState/useMemo, kept between two renders like React does.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const slot = hooks.index++;
      if (!(slot in hooks.values)) hooks.values[slot] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.values[slot], (next: unknown) => { hooks.values[slot] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.values[slot]) : next; }];
    },
    useMemo: (factory: () => unknown) => factory(),
  };
});

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh", inputs: [] as Array<Record<string, unknown>> }));
const trapped = {
  id: 1, firstName: "Amal", lastName: "Haddad", email: "a@test.local", specialty: "Anesthésie-réanimation", targetCountries: "[]", languages: "[]",
  availability: null, mobility: null, certifications: "BLS", aiScore: 82, status: "new", marketingConsent: 1,
  certificationFacts: [
    { name: "BLS", origins: ["declared"], expiresAt: null },
    { name: "Licence DHA", origins: ["extracted"], expiresAt: null },
    { name: "Licence MOH", origins: ["extracted"], expiresAt: "2019-03" },
    { name: "ACLS", origins: ["declared", "extracted"], expiresAt: "2031-06-30" },
  ],
};

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    admin: {
      recruitment: {
        pool: { list: { useQuery: (input: Record<string, unknown>) => { view.inputs.push(input); return { data: [trapped], isLoading: false, error: null, refetch: vi.fn() }; } } },
        exportCsv: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
    },
  },
}));

const { default: VivierTab } = await import("./VivierTab");

function render() {
  hooks.index = 0;
  return VivierTab({ onCompose: () => undefined }) as ReactElement;
}

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

/** Types in the certification filter, whose placeholder cites ACLS in every language. */
function searchCertification(term: string) {
  const field = elements(render()).find(element => element.type === "input" && String(element.props.placeholder).includes("ACLS"))!;
  (field.props.onChange as (event: unknown) => void)({ target: { value: term } });
}

beforeEach(() => {
  hooks.values = [];
  view.language = "fr";
  view.inputs = [];
});

describe("IA-02 — vivier filtré par certification", () => {
  it("dit, pour la certification recherchée, qu’elle a seulement été extraite du CV par l’IA", () => {
    expect(renderToStaticMarkup(render())).not.toContain("Certification recherchée");

    searchCertification("DHA");
    const html = renderToStaticMarkup(render());
    expect(view.inputs.at(-1)).toMatchObject({ certification: "DHA" });
    expect(html).toContain("<strong class=\"text-foreground\">Certification recherchée:</strong> Licence DHA (extraite du CV par l’IA)");
    // Only the certifications matching the search, not the declared BLS.
    expect(html).not.toContain("BLS (déclarée par le candidat)");
  });

  it("date la certification recherchée : une licence que le CV dit expirée est trouvée, et le filtre le dit", () => {
    searchCertification("MOH");
    expect(renderToStaticMarkup(render())).toContain("Certification recherchée:</strong> Licence MOH (extraite du CV par l’IA), expirée en mars 2019</p>");
    searchCertification("acls");
    expect(renderToStaticMarkup(render())).toContain("Certification recherchée:</strong> ACLS (déclarée par le candidat, extraite du CV par l’IA), expire le 30/06/2031</p>");
  });

  it.each([
    ["en", "Searched certification:</strong> Licence MOH (read from the CV by the AI), expired in March 2019</p>", "ACLS (declared by the candidate, read from the CV by the AI), expires on 30/06/2031</p>"],
    ["de", "Gesuchte Zertifizierung:</strong> Licence MOH (von der KI aus dem Lebenslauf gelesen), abgelaufen im März 2019</p>", "ACLS (vom Kandidaten angegeben, von der KI aus dem Lebenslauf gelesen), gültig bis 30.06.2031</p>"],
    ["zh", "所查认证:</strong> Licence MOH (AI 从简历中提取), 已于 2019年3月 过期</p>", "ACLS (候选人自行申报, AI 从简历中提取), 有效期至 2031/06/30</p>"],
  ] as const)("date la certification recherchée dans la langue de l’administration (%s)", (language, expired, current) => {
    view.language = language;
    searchCertification("MOH");
    expect(renderToStaticMarkup(render())).toContain(expired);
    searchCertification("acls");
    expect(renderToStaticMarkup(render())).toContain(current);
  });

  it.each([
    ["en", "Searched certification:</strong> Licence DHA (read from the CV by the AI)"],
    ["de", "Gesuchte Zertifizierung:</strong> Licence DHA (von der KI aus dem Lebenslauf gelesen)"],
    ["zh", "所查认证:</strong> Licence DHA (AI 从简历中提取)"],
  ] as const)("dans la langue de l’administration (%s)", (language, expected) => {
    view.language = language;
    searchCertification("licence");
    expect(renderToStaticMarkup(render())).toContain(expected);
  });
});
