import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANDIDATE_AI_ANALYSIS_CATEGORIES, CANDIDATE_UPLOADABLE_DOCUMENT_CATEGORIES } from "@shared/candidateDocumentCategories";

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/candidate/portal", () => undefined],
  Link: ({ href, children, className }: { href: string; children: unknown; className?: string }) => createElement("a", { href, className }, children as never),
}));
vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => () => ({ data, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    trpc: {
      useUtils: () => ({ candidatePortal: { invalidate: vi.fn(), me: { setData: vi.fn(), invalidate: vi.fn() }, documents: { invalidate: vi.fn() }, sessions: { invalidate: vi.fn() } } }),
      candidatePortal: {
        me: { useQuery: query({ id: 7, firstName: "Vera" }) },
        documents: { useQuery: query([]) },
        sessions: { useQuery: query([]) },
        logout: { useMutation: mutation },
        revokeSession: { useMutation: mutation },
        revokeAllSessions: { useMutation: mutation },
      },
    },
  };
});

const { default: CandidatePortalPage, candidateDocumentAiNotice, candidatePortalCopy, candidateUploadFieldDescription, candidateUploadProblem, candidateUploadProblemField, focusCandidateUploadProblem } = await import("./CandidatePortalPage");
const languages = ["fr", "en", "de", "zh"] as const;

function renderPortal(language: (typeof languages)[number]) {
  view.language = language;
  return renderToStaticMarkup(createElement(CandidatePortalPage));
}

/** Opening tag and content of the category trigger (a Radix Select button). */
function categoryTrigger(html: string) {
  const match = html.match(/<button[^>]*id="candidate-document-category"[^>]*>(.*?)<\/button>/s);
  if (!match) throw new Error("category trigger not rendered");
  return { tag: match[0].slice(0, match[0].indexOf(">") + 1), content: match[1] };
}

beforeEach(() => { view.language = "fr"; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("REC-05 — catégorie du document dans le coffre", () => {
  it.each(languages)("n’en présélectionne aucune et l’exige (%s)", language => {
    const copy = candidatePortalCopy[language];
    const trigger = categoryTrigger(renderPortal(language));

    expect(trigger.content).toContain(copy.chooseCategory);
    expect(trigger.tag).toContain("data-placeholder");
    expect(trigger.tag).toContain('aria-required="true"');
    for (const category of CANDIDATE_UPLOADABLE_DOCUMENT_CATEGORIES) expect(trigger.content, category).not.toContain(copy.categories[category]);
  });

  it.each(languages)("laisse le message categoryRequired au formulaire, pas à la validation du navigateur (%s)", language => {
    // Radix adds a hidden native <select> to the form. Emptied after an upload, a `required` one would
    // make the browser block the next submit with its own bubble, before upload() shows categoryRequired.
    const nativeSelects = renderPortal(language).match(/<select[^>]*>/g) ?? [];

    expect(nativeSelects).toHaveLength(1);
    expect(nativeSelects[0]).toContain('aria-hidden="true"');
    expect(nativeSelects[0]).not.toMatch(/\srequired(=|\s|>)/);
  });

  it.each(languages)("indique sous la liste quelles catégories sont lues par l’IA (%s)", language => {
    const copy = candidatePortalCopy[language];
    const html = renderPortal(language);
    const note = html.match(/<p id="candidate-document-ai-note"[^>]*>(.*?)<\/p>/s)?.[1] ?? "";
    const notice = candidateDocumentAiNotice(copy);

    expect(categoryTrigger(html).tag).toContain('aria-describedby="candidate-document-ai-note"');
    expect(decodeHtml(note)).toBe(`${notice.aiRead} ${notice.humanOnly}`);
    for (const category of CANDIDATE_AI_ANALYSIS_CATEGORIES) expect(notice.aiRead, category).toContain(copy.categories[category]);
    for (const category of ["identity_document", "proof_of_address", "other"] as const) {
      expect(notice.aiRead, category).not.toContain(copy.categories[category]);
      expect(notice.humanOnly, category).toContain(copy.categories[category]);
    }
  });

  it("refuse l’envoi tant que le type n’est pas choisi, même si tout le reste est prêt", () => {
    const copy = candidatePortalCopy.fr;
    const ready = { file: { size: 2048 }, otherLabel: "", turnstileToken: "turnstile-token" };

    expect(candidateUploadProblem({ ...ready, category: "" }, copy)).toBe(copy.categoryRequired);
    expect(candidateUploadProblem({ ...ready, category: "identity_document" }, copy)).toBeNull();
    expect(candidateUploadProblem({ ...ready, category: "other" }, copy)).toBe(copy.otherRequired);
    expect(candidateUploadProblem({ ...ready, category: "diploma", file: null }, copy)).toBe(copy.selectDocument);
    expect(candidateUploadProblem({ ...ready, category: "diploma", turnstileToken: null }, copy)).toBe(copy.turnstile);
  });

  it.each(languages)("garde la région des messages dans la page dès le premier rendu, vide et reliée à aucun champ (%s)", language => {
    const html = renderPortal(language);
    const trigger = categoryTrigger(html).tag;

    // Inserted together with its text, a live region is not reliably announced: it must already be there.
    expect(html).toContain('<p id="candidate-document-upload-message" role="status" class="sr-only"></p>');
    expect(trigger).toContain('aria-describedby="candidate-document-ai-note"');
    expect(trigger).toContain('aria-invalid="false"');
    expect(html).toMatch(/<input[^>]*id="candidate-document-file"[^>]*aria-describedby="candidate-document-limit"/);
  });

  it.each(languages)("relie « choisissez le type » au déclencheur de catégorie, et à lui seul (%s)", language => {
    const copy = candidatePortalCopy[language];
    const html = renderPortal(language);
    const message = candidateUploadProblem({ file: { size: 2048 }, category: "", otherLabel: "", turnstileToken: "turnstile-token" }, copy) ?? "";
    const field = candidateUploadProblemField(message, copy);

    expect(field).toBe("candidate-document-category");
    expect(categoryTrigger(html).tag).toContain(`id="${field}"`);
    expect(candidateUploadFieldDescription("candidate-document-category", message, copy, "candidate-document-ai-note")).toBe("candidate-document-upload-message candidate-document-ai-note");
    expect(candidateUploadFieldDescription("candidate-document-file", message, copy, "candidate-document-limit")).toBe("candidate-document-limit");
    expect(candidateUploadFieldDescription("candidate-document-other", message, copy)).toBeUndefined();
    // Once a type is chosen the message goes, and so does the link.
    expect(candidateUploadFieldDescription("candidate-document-category", "", copy, "candidate-document-ai-note")).toBe("candidate-document-ai-note");
  });

  it("relie chaque autre message au champ qu’il concerne, et aucun message général à un champ", () => {
    const copy = candidatePortalCopy.en;

    expect(candidateUploadProblemField(copy.otherRequired, copy)).toBe("candidate-document-other");
    expect(candidateUploadFieldDescription("candidate-document-other", copy.otherRequired, copy)).toBe("candidate-document-upload-message");
    expect(candidateUploadProblemField(copy.selectDocument, copy)).toBe("candidate-document-file");
    expect(candidateUploadProblemField(copy.fileTooLarge, copy)).toBe("candidate-document-file");
    for (const message of ["", copy.turnstile, copy.uploading, copy.uploadSuccess, copy.uploadError]) {
      expect(candidateUploadProblemField(message, copy), message).toBeNull();
      expect(candidateUploadFieldDescription("candidate-document-category", message, copy, "candidate-document-ai-note"), message).toBe("candidate-document-ai-note");
    }
  });

  it("ramène le focus sur le champ fautif après le rendu qui lui relie le message", () => {
    const copy = candidatePortalCopy.fr;
    const frames: Array<() => void> = [];
    const fields = new Map<string, { focus: ReturnType<typeof vi.fn> }>();
    vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => frames.push(callback) });
    vi.stubGlobal("document", { getElementById: (id: string) => fields.get(id) ?? fields.set(id, { focus: vi.fn() }).get(id) });

    focusCandidateUploadProblem(copy.categoryRequired, copy);
    expect(fields.size).toBe(0);
    frames.splice(0).forEach(frame => frame());
    expect([...fields.keys()]).toEqual(["candidate-document-category"]);
    expect(fields.get("candidate-document-category")?.focus).toHaveBeenCalledTimes(1);

    // The anti-bot check is not a field the visitor can type into: focus stays where it is.
    focusCandidateUploadProblem(copy.turnstile, copy);
    expect(frames).toHaveLength(0);
  });
});

function decodeHtml(value: string) {
  return value.replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
