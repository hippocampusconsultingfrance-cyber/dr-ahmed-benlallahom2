// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contrastOnTint, contrastRatio, type Oklch } from "@/lib/contrast";

// Documents candidats montés par React dans un DOM, avec un faux tRPC :
// « Refuser » et « Archiver » demandent la note interne saisie (aucun texte mis
// à la place de l’administrateur, ni le texte générique laissé par un
// « Valider ») puis une confirmation qui la rappelle (ADM-11) ; un coffre qui
// n’a pas pu être lu le dit, avec « Réessayer », au lieu de paraître vide
// (ADM-10).

type Document = Record<string, unknown> & { id: number };
const view = vi.hoisted(() => ({
  language: "fr" as "fr" | "en" | "de" | "zh",
  list: null as unknown as {
    data: Document[] | undefined;
    isLoading: boolean;
    error: { message: string } | null;
    refetch: ReturnType<typeof vi.fn>;
    isFetching: boolean;
  },
  reviews: [] as unknown[],
  toasts: [] as Array<[string, string]>,
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: view.language }),
}));
vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  const fakeMutation = (record: boolean) => (options: object) =>
    useMutation({
      mutationFn: async (input: unknown) => {
        if (record) view.reviews.push(input);
        return { success: true };
      },
      ...options,
    });
  return {
    trpc: {
      useUtils: () => ({
        admin: { candidateDocuments: { list: { invalidate: vi.fn() } } },
      }),
      admin: {
        candidateDocuments: {
          list: { useQuery: () => view.list },
          review: { useMutation: fakeMutation(true) },
          reanalyze: { useMutation: fakeMutation(false) },
          download: { useMutation: fakeMutation(false) },
        },
      },
    },
  };
});
vi.mock("sonner", () => ({
  toast: Object.fromEntries(
    ["success", "warning", "error", "info"].map(tone => [
      tone,
      (message: string) => view.toasts.push([tone, message]),
    ])
  ),
}));

const { default: CandidateDocumentsAdminTab } = await import(
  "./CandidateDocumentsAdminTab"
);

const diploma = (extra: Record<string, unknown> = {}): Document => ({
  id: 12,
  candidateId: 7,
  candidateEmail: "amina@test.local",
  firstName: "Amina",
  lastName: "Haddad",
  category: "diploma",
  categoryOtherLabel: null,
  originalName: "diplome.pdf",
  mimeType: "application/pdf",
  sizeBytes: 120_000,
  validationStatus: "accepted",
  status: "needs_review",
  analysisStatus: "needs_review",
  aiSummary: null,
  aiExtractedData: null,
  aiConfidence: null,
  aiFlags: null,
  aiModel: null,
  reviewNotes: null,
  createdAt: new Date(Date.UTC(2026, 9, 1)),
  analyzedAt: null,
  ...extra,
});

function mount() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(CandidateDocumentsAdminTab)
    )
  );
}

const note = () =>
  screen.getByLabelText(
    /Note interne obligatoire|Mandatory internal note/
  ) as HTMLInputElement;

beforeEach(() => {
  view.language = "fr";
  view.list = {
    data: [diploma()],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  };
  view.reviews = [];
  view.toasts = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("refus et archivage d’un document (ADM-11)", () => {
  it.each([["Refuser"], ["Archiver"]])(
    "« %s » sans note : rien n’est enregistré, la note est demandée et reçoit le focus",
    name => {
      mount();
      const confirm = vi.spyOn(window, "confirm");
      fireEvent.click(screen.getByRole("button", { name }));

      expect(view.toasts).toEqual([
        [
          "error",
          "Saisissez la note interne : elle est obligatoire pour refuser ou archiver un document.",
        ],
      ]);
      expect(document.activeElement).toBe(note());
      expect(confirm).not.toHaveBeenCalled();
      expect(view.reviews).toEqual([]);

      // Spaces are not a note either.
      fireEvent.change(note(), { target: { value: "   " } });
      fireEvent.click(screen.getByRole("button", { name }));
      expect(view.reviews).toEqual([]);
    }
  );

  it("refuse avec la note saisie, après une confirmation qui la rappelle ; annulée, rien n’est enregistré", async () => {
    mount();
    fireEvent.change(note(), {
      target: { value: "  Diplôme illisible, à renvoyer.  " },
    });

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Refuser" }));
    const message = String(confirm.mock.calls[0]![0]);
    expect(message).toContain(
      "Refuser le document « diplome.pdf » de Amina Haddad ?"
    );
    expect(message).toContain(
      "Note interne : « Diplôme illisible, à renvoyer. »"
    );
    expect(view.reviews).toEqual([]);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Refuser" }));
    await waitFor(() =>
      expect(view.reviews).toEqual([
        { id: 12, status: "rejected", notes: "Diplôme illisible, à renvoyer." },
      ])
    );
    expect(view.toasts).toEqual([["success", "Revue du document enregistrée"]]);
  });

  it.each([
    [
      "fr",
      "Refuser",
      "Document vérifié par revue humaine.",
      "Saisissez la note interne : elle est obligatoire pour refuser ou archiver un document.",
    ],
    // The generic text saved in another language is not a note either.
    [
      "en",
      "Archive",
      "Dokument durch manuelle Prüfung bestätigt.",
      "Enter the internal note: it is required to reject or archive a document.",
    ],
  ] as const)(
    "en %s, « %s » ne prend pas pour note le texte générique d’une validation antérieure : il est sélectionné, à remplacer",
    (language, name, saved, error) => {
      view.language = language;
      view.list.data = [diploma({ status: "reviewed", reviewNotes: saved })];
      mount();
      expect(note().value).toBe(saved);

      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name }));
      expect(view.toasts).toEqual([["error", error]]);
      expect(document.activeElement).toBe(note());
      expect([note().selectionStart, note().selectionEnd]).toEqual([
        0,
        saved.length,
      ]);
      expect(confirm).not.toHaveBeenCalled();
      expect(view.reviews).toEqual([]);
    }
  );

  it("archive dans la langue de l’administrateur, avec la note déjà enregistrée affichée dans le champ", async () => {
    view.language = "en";
    view.list.data = [
      diploma({
        status: "reviewed",
        reviewNotes: "Original checked $& kept on file.",
      }),
    ];
    mount();
    expect(note().value).toBe("Original checked $& kept on file.");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(confirm.mock.calls[0]![0]).toContain(
      "Archive the document “diplome.pdf” from Amina Haddad?"
    );
    expect(confirm.mock.calls[0]![0]).toContain(
      "Internal note: “Original checked $& kept on file.”"
    );
    await waitFor(() =>
      expect(view.reviews).toEqual([
        {
          id: 12,
          status: "archived",
          notes: "Original checked $& kept on file.",
        },
      ])
    );
  });
});

describe("coffre illisible (ADM-10)", () => {
  it("dit que les documents n’ont pas pu être chargés, au lieu de « Aucun document », et les recharge", () => {
    view.list = {
      data: undefined,
      isLoading: false,
      error: {
        message: "Le coffre documentaire est temporairement indisponible.",
      },
      refetch: vi.fn(),
      isFetching: false,
    };
    mount();

    const alert = screen.getByRole("alert");
    // Under the tab's h2 « Revue humaine des documents ».
    expect(within(alert).getByRole("heading", { level: 3 }).textContent).toBe(
      "Impossible de charger les documents candidats"
    );
    expect(alert.textContent).toContain(
      "Le coffre documentaire est temporairement indisponible."
    );
    expect(
      screen.queryByText("Aucun document ne correspond à ce filtre.")
    ).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(view.list.refetch).toHaveBeenCalledTimes(1);
  });

  it("garde « Réessayer » inactif pendant le nouvel essai, dans la langue de l’administrateur", () => {
    view.language = "de";
    // A list already read whose reload failed: React Query keeps its rows and its error while it fetches again
    // (without rows, it goes back to loading and shows the skeleton).
    view.list = {
      data: [diploma()],
      isLoading: false,
      error: { message: "Zeitüberschreitung" },
      refetch: vi.fn(),
      isFetching: true,
    };
    mount();

    const retry = within(screen.getByRole("alert")).getByRole("button", {
      name: "Erneut versuchen",
    }) as HTMLButtonElement;
    expect(screen.getByRole("alert").textContent).toContain(
      "Die Kandidatendokumente konnten nicht geladen werden"
    );
    expect(retry.disabled).toBe(true);
  });
});

describe("état d’analyse affiché sur la carte (EXPL-12)", () => {
  const badge = () =>
    screen
      .getByRole("button", {
        name: /Relancer l’IA|Rerun AI|KI erneut starten|重新运行 AI/,
      })
      .parentElement!.querySelector("span")!.textContent;

  it.each([
    ["fr", "Analyse en attente"],
    ["en", "Analysis pending"],
    ["de", "Analyse ausstehend"],
    ["zh", "等待分析"],
  ] as const)(
    "en %s, un document qui attend le passage quotidien est dit « %s », pas « queued »",
    (language, label) => {
      view.language = language;
      view.list.data = [
        diploma({
          status: "uploaded",
          analysisStatus: "queued",
          validationStatus: "quarantined",
          hasActiveAnalysisJob: true,
        }),
      ];
      mount();
      expect(badge()).toBe(label);
    }
  );

  it.each([["reviewed"], ["rejected"], ["archived"]] as const)(
    "un document « %s » par l’admin avant ou pendant son analyse n’est plus affiché « En analyse » une fois sa tâche fermée",
    status => {
      // What the worker now leaves on a document it closes because the admin decided (server/candidateDocumentProcessing.ts).
      view.list.data = [
        diploma({
          status,
          analysisStatus: "needs_review",
          validationStatus: "quarantined",
          reviewNotes: "Original vérifié",
          hasActiveAnalysisJob: false,
        }),
      ];
      mount();
      expect(badge()).toBe("Revue humaine requise");
      expect(
        screen.getByText(
          "Analyse non disponible : une revue humaine est requise."
        )
      ).toBeTruthy();
    }
  );
});

describe("carte d’analyse lisible en thème clair (A11Y-12)", () => {
  /** Tailwind 4 shades the card uses (node_modules/tailwindcss/theme.css), and the light theme's white card. */
  const SHADES: Record<string, Oklch> = {
    "cyan-700": [0.52, 0.105, 223.128],
    "cyan-800": [0.45, 0.085, 224.283],
    "cyan-950": [0.302, 0.056, 229.695],
    "amber-700": [0.555, 0.163, 48.998],
  };
  const WHITE_CARD: Oklch = [1, 0, 0];
  /** The light-theme text colour of an element: its text-* class without a dark: prefix. */
  const lightText = (element: Element) => {
    const name = Array.from(element.classList).find(value =>
      /^text-[a-z]+-\d+$/.test(value)
    );
    if (!name || !SHADES[name.slice(5)])
      throw new Error(`no known text colour on ${element.outerHTML}`);
    return SHADES[name.slice(5)]!;
  };

  it("garde le titre, le modèle et les points à vérifier au-dessus de 4,5:1 sur la carte blanche", () => {
    view.list.data = [
      diploma({
        aiSummary: "Diplôme de docteur en médecine.",
        aiConfidence: 80,
        aiModel: "gpt-test",
        aiFlags: JSON.stringify(["date_illisible"]),
      }),
    ];
    mount();
    const model = screen.getByText("Modèle: gpt-test");
    const box = model.parentElement!;
    // The analysis box: a 15 % cyan-950 tint on the card.
    expect(box.classList.contains("bg-cyan-950/15")).toBe(true);
    const onBox = (element: Element) =>
      contrastOnTint(lightText(element), SHADES["cyan-950"]!, 0.15, WHITE_CARD);
    expect(onBox(model)).toBeGreaterThanOrEqual(4.5);
    expect(
      onBox(screen.getByText("Synthèse IA d’aide à la revue"))
    ).toBeGreaterThanOrEqual(4.5);
    // The points to verify, under the box, on the card itself.
    const flags = screen.getByText(/^Points à vérifier/);
    expect(box.contains(flags)).toBe(false);
    expect(contrastRatio(lightText(flags), WHITE_CARD)).toBeGreaterThanOrEqual(
      4.5
    );
  });
});

describe("documents regroupés par candidat, avec leur candidature (ADM-19)", () => {
  const omar = {
    candidateId: 9,
    candidateEmail: "omar@test.local",
    firstName: "Omar",
    lastName: "Said",
  };

  beforeEach(() => {
    view.list.data = [
      diploma({
        id: 14,
        originalName: "identite.pdf",
        category: "identity_document",
        applicationTrackingId: "CVAMINA00001",
      }),
      diploma({
        id: 13,
        ...omar,
        originalName: "licence.pdf",
        category: "medical_license",
        applicationTrackingId: null,
      }),
      diploma({ id: 12, applicationTrackingId: "CVAMINA00001" }),
    ];
  });

  it("montre chaque document une seule fois, sous le nom de son candidat, dans l’ordre de son dernier dépôt", () => {
    mount();
    const groups = screen.getAllByRole("region");
    expect(
      groups.map(
        group => within(group).getByRole("heading", { level: 3 }).textContent
      )
    ).toEqual(["Amina Haddad", "Omar Said"]);

    const amina = screen.getByRole("region", { name: "Amina Haddad" });
    // Those of the rows read (the 50 most recent), not every document of the candidate.
    expect(amina.textContent).toContain(
      "amina@test.local · 2 document(s) affiché(s)"
    );
    expect(within(amina).getByText(/identite\.pdf/)).toBeTruthy();
    expect(within(amina).getByText(/diplome\.pdf/)).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Omar Said" })).getByText(
        /licence\.pdf/
      )
    ).toBeTruthy();
    for (const name of [/identite\.pdf/, /diplome\.pdf/, /licence\.pdf/])
      expect(screen.getAllByText(name)).toHaveLength(1);
  });

  it("« Voir la candidature » ouvre la candidature du candidat dans l’onglet Candidatures ; rien sans candidature", () => {
    window.history.replaceState(null, "", "/admin?tab=candidateDocuments");
    mount();
    const link = within(
      screen.getByRole("region", { name: "Amina Haddad" })
    ).getByRole("link", { name: /Voir la candidature/ });
    expect(link.getAttribute("href")).toBe(
      "/admin?tab=recruitment&ref=CVAMINA00001"
    );
    expect(
      within(screen.getByRole("region", { name: "Omar Said" })).queryByRole(
        "link"
      )
    ).toBeNull();

    fireEvent.click(link);
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      "/admin?tab=recruitment&ref=CVAMINA00001"
    );
  });

  it.each([
    ["en", "View application"],
    ["de", "Bewerbung ansehen"],
    ["zh", "查看申请"],
  ] as const)("en %s, le lien dit « %s »", (language, label) => {
    view.language = language;
    mount();
    expect(screen.getByRole("link", { name: new RegExp(label) })).toBeTruthy();
  });
});
