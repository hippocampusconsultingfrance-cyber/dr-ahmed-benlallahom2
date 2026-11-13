import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RGPD-12 — onglet Sécurité : les traces des actions de l’administration sur
// les données d’une personne (export, effacement, suppression d’un message ou
// d’une question santé) ont un libellé dans la langue de l’administration et
// montrent leurs compteurs, seule information qu’elles portent.

const view = vi.hoisted(() => ({ language: "fr", events: [] as Array<Record<string, unknown>>, recentHigh: 0 }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    adminSecurity: {
      events: { useQuery: () => ({ data: view.events, isLoading: false, error: null }) },
      recentHighEvents: { useQuery: () => ({ data: { count: view.recentHigh }, isLoading: false, error: null }) },
      sessions: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
      revokeOtherSessions: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      backupCodes: { useQuery: () => ({ data: { remaining: 0, generatedAt: null }, isLoading: false, error: null, refetch: vi.fn() }) },
      regenerateBackupCodes: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

const { default: SecurityOperationsTab } = await import("./SecurityOperationsTab");

const createdAt = new Date("2026-10-26T07:51:00Z");
const event = (id: number, category: string, counts: Record<string, number> | null, actorKind = "admin") => ({ id, actorKind, category, outcome: "allowed", severity: "info", createdAt, counts });

beforeEach(() => {
  view.language = "fr";
  view.recentHigh = 0;
  view.events = [
    event(1, "admin_personal_data_erased", { contactMessagesDeleted: 2, medicalQuestionsDeleted: 1, appointmentsAnonymised: 2, upcomingAppointmentsKept: 2, recruitmentApplicationsLeft: 1 }),
    event(2, "admin_personal_data_exported", { contactMessages: 2, medicalQuestions: 1, gdprRequests: 1, appointments: 4, recruitmentApplications: 1 }),
    event(3, "admin_contact_message_deleted", { deleted: 1 }),
    event(4, "admin_medical_question_deleted", { deleted: 1 }),
    event(5, "future_category", null, "anonymous"),
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
    // An event no list names keeps its code, and shows no counter.
    expect(html).toContain("future category");
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

describe("ADM-07 / A11Y-12 / ADM-21 — date, gravité et période bloquée", () => {
  it("date chaque évènement à l’heure de Paris, son fuseau dit dans la langue de l’administration", () => {
    view.events = [event(1, "admin_contact_message_deleted", { deleted: 1 })];
    // 07:51 UTC on 26 October 2026, winter time: 08:51 in Paris.
    expect(renderToStaticMarkup(createElement(SecurityOperationsTab))).toContain("Administrateur · 26/10/2026 08:51 (heure de Paris)");
    view.language = "en";
    expect(renderToStaticMarkup(createElement(SecurityOperationsTab))).toContain("Administrator · 26/10/2026, 08:51 (Paris time)");
  });

  it("donne aux gravités les teintes lisibles des badges de l’administration, dans les deux thèmes", () => {
    view.events = [{ ...event(1, "candidate_login", null, "anonymous"), severity: "high", outcome: "blocked" }, { ...event(2, "candidate_login", null, "anonymous"), severity: "critical", outcome: "blocked" }];
    view.recentHigh = 2;
    const html = renderToStaticMarkup(createElement(SecurityOperationsTab));
    expect(html).toMatch(/<span class="[^"]*text-orange-700 [^"]*dark:text-orange-300[^"]*">Élevé<\/span>/);
    expect(html).toMatch(/<span class="[^"]*text-red-700 [^"]*dark:text-red-300[^"]*">Critique<\/span>/);
    // The count of the events to review, in the same tones.
    expect(html).toMatch(/<div class="[^"]*text-orange-700 [^"]*">2 événement\(s\) élevé\(s\) ou critique\(s\) à examiner sur les dernières 24 heures<\/div>/);
  });

  it("nomme la période bloquée et la suspension puis la reprise des réservations, dans chaque langue", () => {
    view.events = [event(1, "admin_blocked_period_added", null), event(2, "admin_bookings_suspended", null), event(3, "admin_bookings_resumed", null)];
    const labels = {
      fr: ["Période bloquée dans les disponibilités", "Réservations en ligne suspendues", "Réservations en ligne reprises"],
      en: ["Period blocked in the availability", "Online bookings suspended", "Online bookings resumed"],
      de: ["Zeitraum in den Verfügbarkeiten gesperrt", "Online-Buchungen ausgesetzt", "Online-Buchungen wieder aufgenommen"],
      zh: ["已在可预约时间中屏蔽一段时期", "已暂停在线预约", "已恢复在线预约"],
    };
    for (const [language, expected] of Object.entries(labels)) {
      view.language = language;
      const html = renderToStaticMarkup(createElement(SecurityOperationsTab));
      for (const label of expected) expect(html).toContain(label);
      expect(html).not.toMatch(/admin blocked period|admin bookings/);
    }
  });
});
