import { describe, expect, it } from "vitest";
import { buildCandidateTimeline } from "./candidate360Timeline";

describe("chronologie candidat 360°", () => {
  it("conserve la demande libre de pièces dans la chronologie", () => {
    const timeline = buildCandidateTimeline({
      createdAt: new Date("2026-08-01T08:00:00.000Z"),
      audits: [{ id: 1, action: "email", metadata: JSON.stringify({ template: "additional_information", customRequest: "Attestation d’inscription et diplômes" }), createdAt: new Date("2026-08-02T08:00:00.000Z") }],
      campaignRecipients: [],
      followUps: [],
    });

    expect(timeline[0]).toMatchObject({ title: "Demande de complément envoyée", detail: "Pièces ou informations demandées : Attestation d’inscription et diplômes" });
  });

  it("nomme la confirmation d’une certification et l’accord du candidat pour une mission (IA-02, RGPD-03)", () => {
    const audit = (id: number, metadata: Record<string, unknown>) => ({ id, action: "status_update", metadata: JSON.stringify(metadata), createdAt: new Date(`2026-10-2${id}T08:00:00.000Z`) });
    const timeline = buildCandidateTimeline({
      createdAt: new Date("2026-10-19T08:00:00.000Z"),
      audits: [
        audit(1, { event: "certification_confirmed", certification: "Licence DHA" }),
        audit(2, { event: "certification_unconfirmed", certification: "Licence DHA" }),
        audit(3, { event: "mission_consent", briefId: 7, consentDate: "2026-10-23" }),
        audit(4, { event: "mission_consent", briefId: 7, consentDate: null }),
      ],
      campaignRecipients: [],
      followUps: [],
    });

    expect(timeline.map(event => event.title)).toEqual([
      "Accord du candidat retiré pour une mission",
      "Accord du candidat noté pour une mission",
      "Confirmation retirée : Licence DHA",
      "Certification confirmée : Licence DHA",
      "Candidature reçue",
    ]);
  });

  it("place les événements les plus récents en premier", () => {
    const timeline = buildCandidateTimeline({
      createdAt: new Date("2026-08-01T08:00:00.000Z"),
      audits: [],
      campaignRecipients: [],
      followUps: [{ id: 3, kind: "custom", status: "suggested", notes: null, dueAt: new Date("2026-08-04T08:00:00.000Z"), completedAt: null }],
    });

    expect(timeline[0]?.kind).toBe("follow_up");
  });
});
