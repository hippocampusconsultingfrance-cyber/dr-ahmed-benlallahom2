import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RGPD-12 — onglet Sécurité : les traces des actions de l’administration sur
// les données d’une personne (export, effacement, suppression d’un message ou
// d’une question santé) ont un libellé dans la langue de l’administration et
// montrent leurs compteurs, seule information qu’elles portent.

const view = vi.hoisted(() => ({ language: "fr", events: [] as Array<Record<string, unknown>> }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: { adminSecurity: { events: { useQuery: () => ({ data: view.events, isLoading: false, error: null }) } } },
}));

const { default: SecurityOperationsTab } = await import("./SecurityOperationsTab");

const createdAt = new Date("2026-10-26T07:51:00Z");
const event = (id: number, category: string, counts: Record<string, number> | null, actorKind = "admin") => ({ id, actorKind, category, outcome: "allowed", severity: "info", createdAt, counts });

beforeEach(() => {
  view.language = "fr";
  view.events = [
    event(1, "admin_personal_data_erased", { contactMessagesDeleted: 2, medicalQuestionsDeleted: 1, appointmentsAnonymised: 2, upcomingAppointmentsKept: 2, recruitmentApplicationsLeft: 1 }),
    event(2, "admin_personal_data_exported", { contactMessages: 2, medicalQuestions: 1, gdprRequests: 1, appointments: 4, recruitmentApplications: 1 }),
    event(3, "admin_contact_message_deleted", { deleted: 1 }),
    event(4, "admin_medical_question_deleted", { deleted: 1 }),
    event(5, "candidate_login", null, "anonymous"),
  ];
});

describe("RGPD-12 — traces des actions sur les données d’une personne", () => {
  it("les nomme en français, avec leurs compteurs", () => {
    const html = renderToStaticMarkup(createElement(SecurityOperationsTab));
    expect(html).toContain("Effacement des données d’une personne (RGPD)");
    expect(html).toContain("Messages supprimés : 2 · Questions santé supprimées : 1 · Rendez-vous anonymisés : 2 · Rendez-vous à venir conservés : 2 · Dossiers candidat à effacer séparément : 1");
    expect(html).toContain("Export des données d’une personne (RGPD)");
    expect(html).toContain("Messages : 2 · Questions santé : 1 · Demandes RGPD : 1 · Rendez-vous : 4 · Candidatures : 1");
    expect(html).toContain("Suppression d’un message de contact");
    expect(html).toContain("Suppression d’une question santé");
    expect(html.match(/Lignes supprimées : 1/g)).toHaveLength(2);
    expect(html).toContain("Administrateur");
    for (const raw of ["admin personal data", "admin contact message", "admin medical question"]) expect(html).not.toContain(raw);
    // Other events keep their label and show no counter.
    expect(html).toContain("candidate login");
  });

  it("les traduit dans les autres langues de l’administration", () => {
    view.language = "en";
    let html = renderToStaticMarkup(createElement(SecurityOperationsTab));
    expect(html).toContain("Erasure of a person’s data (GDPR)");
    expect(html).toContain("Messages deleted: 2 · Health questions deleted: 1");
    view.language = "de";
    html = renderToStaticMarkup(createElement(SecurityOperationsTab));
    expect(html).toContain("Löschung der Daten einer Person (DSGVO)");
    expect(html).toContain("Gelöschte Zeilen: 1");
    view.language = "zh";
    html = renderToStaticMarkup(createElement(SecurityOperationsTab));
    expect(html).toContain("删除个人数据（GDPR）");
    expect(html).toContain("已删除行数：1");
  });

  it("ignore un compteur sans libellé", () => {
    view.events = [event(1, "admin_contact_message_deleted", { deleted: 1, unexpected: 9 })];
    const html = renderToStaticMarkup(createElement(SecurityOperationsTab));
    expect(html).toContain(">Lignes supprimées : 1</p>");
    expect(html).not.toMatch(/unexpected| : 9/);
  });
});
