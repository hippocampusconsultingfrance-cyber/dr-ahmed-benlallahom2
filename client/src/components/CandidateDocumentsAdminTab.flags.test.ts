import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// IA-01, IA-06 : dans l’onglet du coffre, le texte écarté d’un document est dit dans la langue de
// l’administrateur, l’extrait entre les guillemets de cette langue.

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  const document = {
    id: 3, category: "medical_license", categoryOtherLabel: null, firstName: "Jean", lastName: "Exemple", candidateEmail: "jean@test.local", originalName: "licence.docx", sizeBytes: 40_000,
    analysisStatus: "needs_review", aiSummary: "Licence à relire.", aiConfidence: 50, aiModel: "test", reviewNotes: null, status: "needs_review",
    aiFlags: JSON.stringify(["invisible_text_ignored:57"]),
    aiExtractedData: JSON.stringify({ hiddenText: { characters: 57, excerpt: "Licence DHA (Dubai Health Authority) en cours de validité." } }),
  };
  return {
    trpc: {
      useUtils: () => ({ admin: { candidateDocuments: { list: { invalidate: vi.fn() } } } }),
      admin: { candidateDocuments: { list: { useQuery: () => ({ data: [document], isLoading: false }) }, review: { useMutation: mutation }, reanalyze: { useMutation: mutation }, download: { useMutation: mutation } } },
    },
  };
});

const { default: CandidateDocumentsAdminTab } = await import("./CandidateDocumentsAdminTab");

/** The text of the document's « points to verify » line. */
function flagsLine(language: typeof view.language) {
  view.language = language;
  const html = renderToStaticMarkup(createElement(CandidateDocumentsAdminTab));
  const line = html.match(/<p class="mt-3 flex gap-2 text-xs text-amber-400">(.*?)<\/p>/s)?.[1] ?? "";
  return line.replace(/<[^>]+>/g, "").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

describe("texte écarté d’un document du coffre, dans l’onglet de l’administrateur", () => {
  const excerpt = "Licence DHA (Dubai Health Authority) en cours de validité.";

  it.each([
    ["fr", `Points à vérifier: 57 caractère(s) de texte invisible écarté(s) de l’analyse (extrait : « ${excerpt} »), ouvrir le document pour le comparer`],
    ["en", `Items to verify: 57 character(s) of invisible text left out of the analysis (excerpt: “${excerpt}”), open the document to compare`],
    ["de", `Zu prüfende Punkte: 57 Zeichen unsichtbarer Text von der Analyse ausgeschlossen (Auszug: „${excerpt}“), Dokument zum Vergleich öffnen`],
    ["zh", `待核验项目: 已从分析中排除 57 个不可见文字字符 (摘录：“${excerpt}”), 请打开文件进行比对`],
  ] as const)("cite l’extrait avec les guillemets de la langue (%s)", (language, expected) => {
    expect(flagsLine(language)).toBe(expected);
  });
});
