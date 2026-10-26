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
    event(6, "admin_appointment_email_corrected", null),
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
    // EXPL-02: a patient's email corrected from the appointment card.
    expect(html).toContain("Correction de l’email d’un patient (rendez-vous)");
    for (const raw of ["admin personal data", "admin contact message", "admin medical question", "admin appointment email"]) expect(html).not.toContain(raw);
    // Other events keep their label and show no counter.
    expect(html).toContain("candidate login");
  });

  it("les traduit dans les autres langues de l’administration", () => {
    view.language = "en";
    let html = renderToStaticMarkup(createElement(SecurityOperationsTab));
    expect(html).toContain("Erasure of a person’s data (GDPR)");
    expect(html).toContain("Messages deleted: 2 · Health questions deleted: 1");
    expect(html).toContain("Patient email corrected (appointment)");
    view.language = "de";
    html = renderToStaticMarkup(createElement(SecurityOperationsTab));
    expect(html).toContain("Löschung der Daten einer Person (DSGVO)");
    expect(html).toContain("Gelöschte Zeilen: 1");
    expect(html).toContain("E-Mail-Adresse eines Patienten korrigiert (Termin)");
    view.language = "zh";
    html = renderToStaticMarkup(createElement(SecurityOperationsTab));
    expect(html).toContain("删除个人数据（GDPR）");
    expect(html).toContain("已删除行数：1");
    expect(html).toContain("更正患者电子邮箱（预约）");
  });

  it("nomme le créneau retenu par une réservation en ligne et son auteur anonyme, dans chaque langue (ABUS-02)", () => {
    view.events = [event(1, "public_booking_hold_created", null, "anonymous")];
    const labels = { fr: ["Créneau retenu par une réservation en ligne, en attente de paiement", "Visiteur anonyme"], en: ["Slot held by an online booking, awaiting payment", "Anonymous visitor"], de: ["Termin durch Online-Buchung reserviert, Zahlung ausstehend", "Anonymer Besucher"], zh: ["在线预约暂留时段，待付款", "匿名访客"] };
    for (const [language, [category, actor]] of Object.entries(labels)) {
      view.language = language;
      const html = renderToStaticMarkup(createElement(SecurityOperationsTab));
      expect(html).toContain(category);
      expect(html).toContain(actor);
      expect(html).not.toMatch(/public booking hold|>anonymous</);
    }
  });

  it("nomme la vérification anti-robot refusée ou indisponible d’une réservation en ligne, dans chaque langue (ABUS-02)", () => {
    view.events = [event(1, "public_booking_challenge", null, "anonymous"), event(2, "public_booking_challenge_unavailable", null, "anonymous")];
    const labels = {
      fr: ["Vérification anti-robot refusée (réservation en ligne)", "Vérification anti-robot indisponible (réservation en ligne)"],
      en: ["Anti-bot check refused (online booking)", "Anti-bot check unavailable (online booking)"],
      de: ["Bot-Prüfung abgelehnt (Online-Buchung)", "Bot-Prüfung nicht verfügbar (Online-Buchung)"],
      zh: ["反机器人验证未通过（在线预约）", "反机器人验证暂不可用（在线预约）"],
    };
    for (const [language, [refused, unavailable]] of Object.entries(labels)) {
      view.language = language;
      const html = renderToStaticMarkup(createElement(SecurityOperationsTab));
      expect(html).toContain(refused);
      expect(html).toContain(unavailable);
      expect(html).not.toContain("public booking challenge");
    }
  });

  it("ignore un compteur sans libellé", () => {
    view.events = [event(1, "admin_contact_message_deleted", { deleted: 1, unexpected: 9 })];
    const html = renderToStaticMarkup(createElement(SecurityOperationsTab));
    expect(html).toContain(">Lignes supprimées : 1</p>");
    expect(html).not.toMatch(/unexpected| : 9/);
  });
});
