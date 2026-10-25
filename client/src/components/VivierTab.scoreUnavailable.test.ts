import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));
const candidate = (id: number, lastName: string, aiScore: number | null) => ({
  id, firstName: "Dr", lastName, email: `${lastName}@test.local`, specialty: "Anesthésie-réanimation", targetCountries: "[]", languages: "[]",
  availability: null, mobility: null, certifications: null, aiScore, status: "new", marketingConsent: 1,
});

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    admin: {
      recruitment: {
        // As the server sends them: sorted by score, unscored profiles first (PostgreSQL puts NULL first in DESC).
        pool: { list: { useQuery: () => ({ data: [candidate(3, "Haddad", null), candidate(1, "Martin", 88), candidate(4, "Wang", null), candidate(2, "Weber", 74)], isLoading: false, error: null, refetch: vi.fn() }) } },
        exportCsv: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
    },
  },
}));

const { default: VivierTab } = await import("./VivierTab");

function render(language: typeof view.language) {
  view.language = language;
  return renderToStaticMarkup(createElement(VivierTab, { onCompose: () => undefined }));
}

describe("INTL-02 — vivier : profils sans score à part, à lire", () => {
  it.each([
    ["fr", "Score indisponible – à lire"],
    ["en", "Score unavailable – read the CV"],
    ["de", "Score nicht verfügbar – Lebenslauf lesen"],
    ["zh", "分数不可用——请阅读简历"],
  ] as const)("liste les profils notés, puis la rubrique et les profils sans score (%s)", (language, heading) => {
    const html = render(language);
    const position = (text: string) => html.indexOf(text);

    expect(position(heading)).toBeGreaterThan(-1);
    expect(position("Dr Martin")).toBeLessThan(position("Dr Weber"));
    expect(position("Dr Weber")).toBeLessThan(position(heading));
    expect(position(heading)).toBeLessThan(position("Dr Haddad"));
    expect(position("Dr Haddad")).toBeLessThan(position("Dr Wang"));
  });
});
