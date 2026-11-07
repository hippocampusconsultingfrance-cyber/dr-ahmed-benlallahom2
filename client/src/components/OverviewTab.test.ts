import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf } from "@/testing/statefulRender";

// ADM-06 — vue d’ensemble : le panneau « À traiter » en tête, puis ce qui
// attend une action (chaque carte ouvre son onglet), puis les indicateurs :
// chiffre d’affaires du mois et du mois précédent au format « 17 750,00 € »,
// consultations des 7 prochains jours, conversion des réservations,
// candidatures par semaine et délai de réponse aux questions.

const view = vi.hoisted(() => ({ stats: null as unknown, isLoading: false, error: null as null | { message: string } }));

vi.mock("@/components/AdminAttentionPanel", () => ({ default: function AdminAttentionPanel() { return null; } }));
vi.mock("@/components/RecruitmentDashboardPanel", () => ({ default: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: { admin: { stats: { useQuery: () => ({ data: view.stats, isLoading: view.isLoading, error: view.error }) } } },
}));

const { default: OverviewTab } = await import("./OverviewTab");
const { default: AdminAttentionPanel } = await import("@/components/AdminAttentionPanel");

const HOUR_MS = 60 * 60 * 1000;

const stats = (overrides: Record<string, unknown> = {}) => ({
  appointments: { today: 3, tomorrow: 1, upcomingWeek: { count: 9, lastDay: "2026-11-13" } },
  // 21 October, 01:30 in Paris.
  medicalQuestions: { open: 61, oldestReceivedAt: new Date("2026-10-20T23:30:00Z"), recentAnswers: { count: 12, averageResponseMs: 60 * HOUR_MS } },
  unreadMessages: 67,
  gdprRequests: { open: 21, nextDeadline: new Date("2026-11-26T22:59:59.999Z") },
  documentsToReview: 2,
  applications: { new: 5, lastWeek: 4, lastFourWeeks: 10 },
  bookingConversion: { started: 29, paid: 18 },
  revenue: { currentMonth: { month: "2026-11", amount: "17750.00" }, previousMonth: { month: "2026-10", amount: "1250.50" } },
  ...overrides,
});

const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as { props: { children?: unknown } }).props.children);
  return "";
};
/** Regular spaces, as read on screen (Intl puts no-break spaces around the thousands and before €). */
const shown = (text: string) => text.replace(/\s/g, " ");
const html = () => shown(renderToStaticMarkup(createElement(OverviewTab, { onNavigate: vi.fn() })));
const cards = (onNavigate = vi.fn()) => elementsOf(OverviewTab({ onNavigate }) as ReactElement)
  .filter(element => element.type === "button")
  .map(element => ({ text: shown(textOf(element)), element }));
const card = (label: string) => cards().find(({ text }) => text.includes(label))!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T10:00:00Z"));
  view.stats = stats();
  view.isLoading = false;
  view.error = null;
});
afterEach(() => vi.useRealTimers());

describe("vue d’ensemble de l’administration (ADM-06)", () => {
  it("garde « À traiter » en tête, même pendant le chargement ou après une erreur des indicateurs", () => {
    for (const state of [{}, { isLoading: true, stats: undefined }, { error: { message: "Base de données indisponible." }, stats: undefined }]) {
      Object.assign(view, state);
      const tree = OverviewTab({ onNavigate: vi.fn() }) as ReactElement<{ children: ReactElement[] }>;
      expect(tree.props.children[0]!.type).toBe(AdminAttentionPanel);
    }
    expect(html()).toContain("Erreur de chargement : Base de données indisponible.");
  });

  it("montre ce qui attend une action, chaque carte ouvrant l’onglet concerné", () => {
    const onNavigate = vi.fn();
    const expected = [
      ["3Rendez-vous aujourd’huiConsultations confirmées", "appointments"],
      ["1Rendez-vous demainConsultations confirmées", "appointments"],
      ["61Questions santé à répondreLa plus ancienne reçue le 21/10/2026", "medicalQuestions"],
      ["67Messages non lusFormulaire de contact", "contacts"],
      ["21Demandes RGPD ouvertesProchaine échéance : 26/11/2026", "gdpr"],
      ["2Documents candidats à revoirEn attente de votre revue", "candidateDocuments"],
      ["5Nouvelles candidaturesPas encore examinées", "recruitment"],
      ["17 750,00 €Chiffre d’affaires · novembre 2026Mois en cours", "appointments"],
      ["1 250,50 €Chiffre d’affaires · octobre 2026Mois précédent", "appointments"],
      ["9Consultations à venir · 7 joursConfirmées, jusqu’au 13/11/2026 inclus", "appointments"],
      ["62 %Conversion des réservations · 30 jours18 payées sur 29 réservations commencées", "appointments"],
      ["4Candidatures reçues · 7 joursEn moyenne 2,5 par semaine sur 4 semaines", "recruitment"],
      ["2,5 joursDélai moyen de réponse aux questions · 30 joursSur 12 réponses envoyées", "medicalQuestions"],
    ];
    // Without the « Candidatures » and « Missions » shortcuts, below the recruitment panel.
    const shownCards = cards(onNavigate).filter(({ text }) => !/^(Candidatures|Missions)/.test(text.trim()));
    expect(shownCards.map(({ text }) => text.replace(/^→/, ""))).toEqual(expected.map(([text]) => text));
    for (const { element } of shownCards) (element.props.onClick as () => void)();
    expect(onNavigate.mock.calls.map(([tab]) => tab)).toEqual(expected.map(([, tab]) => tab));
    expect(html()).toContain(">17 750,00 €<");
  });

  it("dit l’échéance RGPD la plus proche : dépassée une fois son jour fini à Paris, proche dans la semaine", () => {
    const gdpr = (nextDeadline: Date | null, open = 3) => {
      view.stats = stats({ gdprRequests: { open, nextDeadline } });
      const { text, element } = card("Demandes RGPD ouvertes");
      // The detail line, last of the card, coloured by how near the deadline is.
      const detail = elementsOf(element).filter(node => node.type === "span").at(-1)!;
      return { text, tone: String(detail.props.className).replace("mt-1 text-xs ", "") };
    };

    // Colours readable on the white cards of the light theme and on the dark ones.
    expect(gdpr(new Date("2026-11-26T22:59:59.999Z"))).toEqual({ text: "→3Demandes RGPD ouvertesProchaine échéance : 26/11/2026", tone: "text-muted-foreground" });
    expect(gdpr(new Date("2026-11-12T22:59:59.999Z"))).toEqual({ text: "→3Demandes RGPD ouvertesÉchéance proche : 12/11/2026", tone: "text-amber-700 dark:text-amber-300" });
    expect(gdpr(new Date("2026-11-01T22:59:59.999Z"))).toEqual({ text: "→3Demandes RGPD ouvertesÉchéance dépassée : 01/11/2026", tone: "text-red-600 dark:text-red-400" });
    expect(gdpr(null, 0).text).toBe("→0Demandes RGPD ouvertesAucune demande en attente");

    // 1 November, 23:00 in Paris: the deadline day is not over yet.
    vi.setSystemTime(new Date("2026-11-01T22:00:00Z"));
    expect(gdpr(new Date("2026-11-01T22:59:59.999Z")).text).toBe("→3Demandes RGPD ouvertesÉchéance proche : 01/11/2026");
  });

  it("dit qu’aucune question n’attend quand il n’y en a pas, et écrit un chiffre d’affaires nul « 0,00 € »", () => {
    view.stats = stats({
      medicalQuestions: { open: 0, oldestReceivedAt: null, recentAnswers: { count: 0, averageResponseMs: null } },
      revenue: { currentMonth: { month: "2027-01", amount: "0.00" }, previousMonth: { month: "2026-12", amount: "980.00" } },
    });
    expect(card("Questions santé à répondre").text).toBe("→0Questions santé à répondreAucune en attente");
    expect(card("janvier 2027").text).toBe("→0,00 €Chiffre d’affaires · janvier 2027Mois en cours");
    expect(card("décembre 2026").text).toBe("→980,00 €Chiffre d’affaires · décembre 2026Mois précédent");
  });

  it("écrit le délai de réponse en heures sous deux jours, sinon en jours, et un tiret sans réservation ni réponse", () => {
    const answers = (averageResponseMs: number | null, count = 1) => {
      view.stats = stats({ medicalQuestions: { open: 0, oldestReceivedAt: null, recentAnswers: { count, averageResponseMs } } });
      return card("Délai moyen de réponse").text;
    };
    expect(answers(20 * 60 * 1000)).toBe("→moins d’1 hDélai moyen de réponse aux questions · 30 joursSur 1 réponse envoyée");
    expect(answers(5.4 * HOUR_MS, 3)).toBe("→5 hDélai moyen de réponse aux questions · 30 joursSur 3 réponses envoyées");
    expect(answers(47 * HOUR_MS)).toMatch(/^→47 h/);
    expect(answers(48 * HOUR_MS)).toMatch(/^→2 jours/);
    expect(answers(null, 0)).toBe("→—Délai moyen de réponse aux questions · 30 joursAucune réponse envoyée");

    view.stats = stats({ bookingConversion: { started: 0, paid: 0 }, applications: { new: 0, lastWeek: 1, lastFourWeeks: 1 } });
    expect(card("Conversion des réservations").text).toBe("→—Conversion des réservations · 30 joursAucune réservation commencée");
    expect(card("Candidatures reçues").text).toBe("→1Candidatures reçues · 7 joursEn moyenne 0,3 par semaine sur 4 semaines");
    view.stats = stats({ bookingConversion: { started: 1, paid: 1 } });
    expect(card("Conversion des réservations").text).toBe("→100 %Conversion des réservations · 30 jours1 payée sur 1 réservation commencée");
  });
});
